import { Model } from "mongoose";
import {
  EventPayload,
  IAttribution,
  IEvent,
  IEventSource,
  IEventSourceDefinition,
  IEventTransfer,
  IEventType,
} from "./types.ts";
import {
  createEventModel,
  getEventSourceDefinitionModel,
  getEventTypeModel,
  IEventDoc,
  IEventSourceDefinitionDoc,
  IEventTypeDoc,
} from "./db/Event.ts";
import { Engine } from "./mod.ts";
import { getMetricsFromEvent } from "./db/AggregateQuery.ts";

const sanitizeNameForCollection = (name: string): string => {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
};

export class EventSource implements IEventSource {
  private engine: Engine;
  private definitionDoc: IEventSourceDefinitionDoc;
  private eventModel: Model<IEventDoc<any>>;

  constructor(
    engine: Engine,
    definitionDoc: IEventSourceDefinitionDoc,
  ) {
    this.engine = engine;
    this.definitionDoc = definitionDoc;
    this.eventModel = createEventModel(
      this.engine.connection,
      sanitizeNameForCollection(this.definitionDoc.name),
    );
  }

  public static async create(
    engine: Engine,
    definition: Partial<IEventSourceDefinition>,
  ): Promise<EventSource> {
    const EventSourceDefinitionModel = getEventSourceDefinitionModel(
      engine.connection,
    );
    // We need to fetch the full document to get the retention policy
    const sourceDoc = await EventSourceDefinitionModel.findOneAndUpdate(
      { name: definition.name },
      {
        $setOnInsert: definition,
      },
      { new: true, upsert: true, runValidators: true },
    );

    // --- Cache Invalidation ---
    await engine.eventSourceDefCache.set(`id:${sourceDoc._id}`, sourceDoc);
    const source = new EventSource(engine, sourceDoc);
    const eventTypes = definition.eventTypes;
    if (eventTypes?.length) {
      await Promise.all(
        eventTypes.map((eventType) => source.defineEventType(eventType)),
      );
    }
    return source;
  }

  public getDefinition(): IEventSourceDefinition {
    return {
      id: this.definitionDoc._id.toString()!,
      name: this.definitionDoc.name,
      description: this.definitionDoc.description,
      owners: this.definitionDoc.owners,
      retention: (this.definitionDoc as any).retention,
    };
  }

  public async defineEventType(eventType: IEventType): Promise<IEventType> {
    const EventTypeModel = getEventTypeModel(this.engine.connection);
    const eventTypeDoc = await EventTypeModel.findOneAndUpdate(
      { sourceId: this.definitionDoc._id, name: eventType.name },
      { $setOnInsert: { ...eventType, sourceId: this.definitionDoc._id } },
      { new: true, upsert: true, runValidators: true },
    );

    // --- Cache Invalidation ---
    await this.engine.eventTypeCache.set(
      `id:${eventTypeDoc._id}`,
      eventTypeDoc,
    );
    await this.engine.eventTypeCache.set(
      `source:${this.definitionDoc._id}:name:${eventType.name}`,
      eventTypeDoc,
    );

    return this.toEventTypeObject(eventTypeDoc);
  }

  public async listEventTypes(): Promise<IEventType[]> {
    const EventTypeModel = getEventTypeModel(this.engine.connection);
    const types = await EventTypeModel.find({
      sourceId: this.definitionDoc._id,
    });
    return types.map(this.toEventTypeObject);
  }

  // Overload signatures
  public record<T extends EventPayload>(
    event: IEventTransfer<T>,
  ): Promise<IEvent<T>>;
  public record<T extends EventPayload>(
    events: IEventTransfer<T>[],
  ): Promise<IEvent<T>[]>;

  public async record<T extends EventPayload>(
    eventOrEvents: IEventTransfer<T> | IEventTransfer<T>[],
  ): Promise<IEvent<T> | IEvent<T>[]> {
    const wasSingle = !Array.isArray(eventOrEvents);
    const events = wasSingle ? [eventOrEvents] : eventOrEvents;

    if (events.length === 0) {
      return wasSingle
        ? Promise.reject("No event provided")
        : Promise.resolve([]);
    }

    // --- 1. Idempotency Check (in bulk) ---
    const uuids = events.map((e) => e.uuid);
    const existingEvents = await this.eventModel.find({ uuid: { $in: uuids } });
    const existingUuids = new Set(existingEvents.map((e) => e.uuid));
    const newEventsInput = events.filter((e) => !existingUuids.has(e.uuid));

    // We cannot resolve eventType for existing events easily without a bulk fetch,
    // which adds complexity. For idempotency, returning the existing doc is enough,
    // and the caller already has the eventType. Let's return a partial object
    // and let the full object be constructed for new events.
    const results: Partial<IEvent<T>>[] = existingEvents.map((doc) =>
      this.toEventObject(doc)
    );

    if (newEventsInput.length === 0) {
      // @ts-ignore:
      return wasSingle ? results[0] : results;
    }

    // --- 2. Prepare new event documents ---
    const docsToInsert: any[] = [];
    const eventTypeDocs = new Map<string, IEventTypeDoc>();

    for (const event of newEventsInput) {
      const eventTypeDoc = await this.engine.getEventTypeByName(
        this.definitionDoc._id,
        event.eventType,
      );
      if (!eventTypeDoc) {
        throw new Error(
          `Event type "${event.eventType}" is not defined for source "${this.definitionDoc.name}".`,
        );
      }
      eventTypeDocs.set(eventTypeDoc._id.toString(), eventTypeDoc);

      // --- Plugin Hook: beforeEventRecord ---
      const modified = await this.engine.pluginManager.executeWaterfallHook(
        "beforeEventRecord",
        {
          payload: event.payload,
          eventType: event.eventType,
          attributions: event.attributions,
        },
      );

      docsToInsert.push({
        uuid: event.uuid,
        sourceId: this.definitionDoc._id,
        eventTypeId: eventTypeDoc._id,
        payload: modified.payload,
        attributions: modified.attributions,
        timestamp: event.timestamp ?? new Date(),
      });
    }

    // --- 3. Insert new documents into DB ---
    const insertedDocs = await this.eventModel.insertMany(docsToInsert);

    // --- 4. Update metadata (non-blocking) ---
    // @ts-ignore:
    this._updateMetadata(insertedDocs, eventTypeDocs).catch(console.error);

    // Create a map from eventTypeId to eventType name for quick lookups.
    const eventTypeIdToNameMap = new Map<string, string>();
    for (const doc of eventTypeDocs.values()) {
      eventTypeIdToNameMap.set(doc._id.toString(), doc.name);
    }

    // --- 5. Post-processing for newly inserted docs ---
    for (const newEventDoc of insertedDocs) {
      // --- Plugin Hook: afterEventRecord ---
      this.engine.pluginManager.executeActionHook("afterEventRecord", {
        eventDoc: newEventDoc,
      }).catch(console.log);

      // Enqueue for durable processing
      this.engine.aggregator.queueEventForProcessing(
        newEventDoc._id.toString(),
        this.eventModel.collection.name,
      ).catch(console.log);

      // Handle real-time buffer
      await this.processRealtime(newEventDoc as any);

      results.push(
        this.toEventObject(newEventDoc as any, eventTypeIdToNameMap),
      );
    }
    // @ts-ignore:
    return wasSingle
      // @ts-ignore:
      ? results.find((e) =>
        e.uuid === (eventOrEvents as IEventTransfer<T>).uuid
      )!
      : results as any;
  }

  private async _updateMetadata(
    insertedDocs: IEventDoc<any>[],
    eventTypeDocs: Map<string, IEventTypeDoc>,
  ) {
    const metrics = new Set<string>();
    const groupableFields = new Set<string>();
    const eventTypes = new Set<string>();

    for (const doc of insertedDocs) {
      const payload = doc.payload;
      for (const key in payload) {
        if (typeof payload[key] === "number") {
          metrics.add(`${key}_sum`);
        } else if (typeof payload[key] === "string") {
          groupableFields.add(key);
        }
      }
      const eventTypeDoc = eventTypeDocs.get(doc.eventTypeId.toString());
      if (eventTypeDoc) {
        eventTypes.add(eventTypeDoc.name);
        metrics.add(`${eventTypeDoc.name}_count`);
      }
    }

    if (metrics.size > 0 || groupableFields.size > 0 || eventTypes.size > 0) {
      await this.engine.EventSourceMetadataModel.updateOne(
        { sourceId: this.definitionDoc._id },
        {
          $addToSet: {
            metrics: { $each: Array.from(metrics) },
            groupableFields: { $each: Array.from(groupableFields) },
            eventTypes: { $each: Array.from(eventTypes) },
          },
        },
        { upsert: true },
      );
    }
  }

  private async processRealtime(newEventDoc: IEventDoc<any>) {
    if (
      !this.engine.aggregator.bufferService ||
      newEventDoc.timestamp.getTime() <
        Date.now() - this.engine.aggregator.bufferService.bufferAgeMs
    ) {
      return;
    }

    const allActiveSources = await this.engine.getAllActiveAggregationSources();
    const configs = allActiveSources.filter((config) =>
      config.filter?.sources.some(
        (source: { id: string }) =>
          source.id === newEventDoc.sourceId.toString(),
      )
    );

    for (const config of configs) {
      const metrics = await getMetricsFromEvent(
        newEventDoc,
        this.engine,
        config.granularity ?? "minute",
      );

      for (const metric of metrics) {
        await this.engine.aggregator.bufferService.add(
          config.targetCollection,
          metric,
        );
      }

      this.engine.pluginManager.executeActionHook(
        "afterRealtimeMetricsGenerated",
        { reportId: config.reportId.toString(), event: newEventDoc, metrics },
      ).catch(console.log);
    }
  }

  private toEventObject<T extends EventPayload>(
    newEventDoc: IEventDoc<T>,
    typeMap?: Map<string, string>,
  ): Partial<IEvent<T>> {
    const eventTypeName = typeMap?.get(newEventDoc.eventTypeId.toString()) ??
      "";
    return {
      id: newEventDoc._id.toString(),
      uuid: newEventDoc.uuid,
      eventType: eventTypeName,
      timestamp: newEventDoc.timestamp,
      payload: newEventDoc.payload as T,
      attributions: newEventDoc.attributions?.map((a: IAttribution) => ({
        type: a.type,
        value: a.value,
      })),
    };
  }

  private toEventTypeObject(doc: IEventTypeDoc): IEventType {
    return {
      name: doc.name,
      description: doc.description,
      _schema: doc._schema,
    };
  }
}
