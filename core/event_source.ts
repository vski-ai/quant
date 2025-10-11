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
    definition: IEventSourceDefinition,
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
      id: this.definitionDoc._id.toString(),
      name: this.definitionDoc.name,
      description: this.definitionDoc.description,
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

  public async record<T extends EventPayload>({
    uuid,
    eventType,
    payload,
    attributions,
    timestamp,
  }: IEventTransfer<T>): Promise<IEvent<T>> {
    const eventTypeDoc = await this.engine.getEventTypeByName(
      this.definitionDoc._id,
      eventType,
    );

    if (!eventTypeDoc) {
      throw new Error(
        `Event type "${eventType}" is not defined for source "${this.definitionDoc.name}". Please define it first.`,
      );
    }

    // --- Plugin Hook: beforeEventRecord ---
    const modified = await this.engine.pluginManager.executeWaterfallHook(
      "beforeEventRecord",
      {
        payload,
        eventType,
        attributions,
      },
    );

    // --- Idempotency Check ---
    // First, try to find an event with the same UUID to prevent duplicates.
    const existingEvent = await this.eventModel.findOne({ uuid });
    if (existingEvent) {
      // If found, return the existing event's data.
      return {
        id: existingEvent._id.toString(),
        uuid: existingEvent.uuid,
        eventType: eventType, // Assuming eventType matches, or we could fetch it.
        timestamp: existingEvent.timestamp,
        payload: existingEvent.payload as T,
        attributions: existingEvent.attributions?.map((a: IAttribution) => ({
          type: a.type,
          value: a.value,
        })),
      };
    }

    const newEventDoc = new this.eventModel({
      uuid,
      sourceId: this.definitionDoc._id,
      eventTypeId: eventTypeDoc._id,
      payload: modified.payload,
      attributions: modified.attributions,
      timestamp: timestamp ?? new Date(),
    });
    // Save the event to the database FIRST to get the permanent, server-side _id.
    // This prevents race conditions where a temporary client-side ID might be used.
    await newEventDoc.save();

    // --- Plugin Hook: afterEventRecord ---
    await this.engine.pluginManager.executeActionHook("afterEventRecord", {
      eventDoc: newEventDoc,
    });

    // For recent events, generate metrics and push them to the real-time buffer immediately.

    // Enqueue the event for durable processing by the aggregator.
    await this.engine.aggregator.queueEventForProcessing(
      newEventDoc._id.toString(),
      this.eventModel.collection.name,
    );

    if (
      this.engine.aggregator.bufferService &&
      newEventDoc.timestamp.getTime() >
        Date.now() - this.engine.aggregator.bufferService.bufferAgeMs
    ) {
      // This is a simplified, in-place metric generation for the buffer.
      // It assumes a single, default aggregation source for real-time purposes.
      // Fetch all active aggregation sources to find matches for this event.
      const allActiveSources = await this.engine
        .getAllActiveAggregationSources();
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

        // Add all generated metrics to the buffer
        for (const metric of metrics) {
          await this.engine.aggregator.bufferService.add(
            config.targetCollection,
            metric,
          );
        }
        // Run the hook to notify plugins about the newly generated metrics for this config.
        await this.engine.pluginManager.executeActionHook(
          "afterRealtimeMetricsGenerated",
          { reportId: config.reportId.toString(), event: newEventDoc, metrics },
        );
      }
    }

    return {
      id: newEventDoc._id.toString(),
      uuid: newEventDoc.uuid,
      eventType: eventType,
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
