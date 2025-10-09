import { createAggregateModel } from "./Aggregation.ts";
import { IEventDoc } from "./Event.ts";
import {
  AggregationType,
  EventPayload,
  Granularity,
  IAttribution,
} from "../types.ts";
import { truncateDate } from "../utils.ts";
import { Engine } from "../engine.ts";
import { TOTAL_ATTRIBUTION } from "../constants.ts";

/**
 * Represents a single metric to be updated in the database.
 */
export interface IMetricUpdate {
  query: Record<string, any>; // The query to find the aggregate document.
  incrementValue: number; // The value to increment by or the boolean value.
}

/**

 * Analyzes a raw event document and returns an array of metric updates.
 * This function does NOT write to the database; it only determines what
 * needs to be written.
 *
 * @param eventDoc The raw event document from the database.
 * @param granularity The storage granularity for this metric.
 * @returns A promise resolving to an array of metric update objects.
 */
export async function getMetricsFromEvent(
  eventDoc: IEventDoc<EventPayload>,
  engine: Engine,
  storageGranularity: Granularity,
): Promise<IMetricUpdate[]> {
  const metrics: IMetricUpdate[] = [];
  if (!eventDoc || !eventDoc.payload) {
    return metrics;
  }

  try {
    const eventTypeDoc = await engine.getEventTypeById(
      eventDoc.eventTypeId.toString(),
    );
    if (!eventTypeDoc) return metrics;

    const sourceDoc = await engine.getEventSourceDefinitionById(
      eventDoc.sourceId.toString(),
    );
    if (!sourceDoc) return metrics;

    const attributionsToProcess: IAttribution[] = [
      { type: TOTAL_ATTRIBUTION, value: TOTAL_ATTRIBUTION },
      ...(eventDoc.attributions || []),
    ];

    const numericalFields: Map<string, number> = new Map();
    const categoricalFields: Map<string, string> = new Map();

    const truncatedTimestamp = truncateDate(
      eventDoc.timestamp,
      storageGranularity,
    ); // storage granularity

    for (const attr of attributionsToProcess) {
      // a) Base COUNT metric
      metrics.push({
        query: buildAggregateQuery(
          eventDoc.sourceId.toString(),
          eventTypeDoc.name,
          truncatedTimestamp,
          attr,
          storageGranularity,
          AggregationType.COUNT,
          null,
        ),
        incrementValue: 1,
      });

      // b) Automatically discovered payload metrics
      for (const [field, value] of Object.entries(eventDoc.payload)) {
        // Simple SUM and CATEGORY metrics
        if (typeof value === "number") {
          metrics.push({
            query: buildAggregateQuery(
              eventDoc.sourceId.toString(),
              eventTypeDoc.name,
              truncatedTimestamp,
              attr,
              storageGranularity,
              AggregationType.SUM,
              field,
            ),
            incrementValue: value,
          });
          numericalFields.set(field, value);
        } else if (typeof value === "string" || typeof value === "boolean") {
          metrics.push({
            query: buildAggregateQuery(
              eventDoc.sourceId.toString(),
              eventTypeDoc.name,
              truncatedTimestamp,
              attr,
              storageGranularity,
              AggregationType.CATEGORY,
              field,
              String(value),
            ),
            incrementValue: 1,
          });
          categoricalFields.set(field, String(value));
        }
        if (typeof value === "boolean") {
          metrics.push({
            query: buildAggregateQuery(
              eventDoc.sourceId.toString(),
              eventTypeDoc.name,
              eventDoc.timestamp, // Use original timestamp for booleans
              attr,
              storageGranularity, // Still needed for context
              AggregationType.BOOLEAN,
              field,
            ),
            incrementValue: value ? 1 : 0, // Store boolean as 1 or 0
          });
        }
      }
      // c) Compound SUM metrics (numerical broken down by categorical)
      for (const [numField, numValue] of numericalFields) {
        for (const [catField, catValue] of categoricalFields.entries()) {
          metrics.push({
            query: buildAggregateQuery(
              eventDoc.sourceId.toString(),
              eventTypeDoc.name,
              truncatedTimestamp,
              attr,
              storageGranularity,
              AggregationType.COMPOUND_SUM,
              numField, // The field being summed (e.g., 'amount')
              catValue, // The category value (e.g., 'USD')
              {
                // Store the category key in a new field
                compoundCategoryKey: catField, // (e.g., 'currency')
              },
            ),
            incrementValue: numValue,
          });
        }
      }
    }

    // --- Plugin Hook: onGetMetrics ---
    const pluginMetrics = await engine.pluginManager.executeCollectorHook(
      "onGetMetrics",
      { eventDoc, storageGranularity },
    );
    metrics.push(...pluginMetrics);

    return metrics;
  } catch (error) {
    console.error(`Error generating metrics for event ${eventDoc._id}:`, error);
    return []; // Return empty array on error to not stop processing
  }
}

/**
 * Helper to construct the query object for finding an aggregate document.
 */
export function buildAggregateQuery(
  sourceId: string,
  eventType: string,
  timestamp: Date,
  attribution: IAttribution,
  granularity: Granularity,
  aggType: AggregationType,
  payloadField: string | null = null,
  payloadCategory: string | null = null,
  extra: Record<string, any> = {},
): Record<string, any> {
  return {
    sourceId,
    eventType,
    timestamp: timestamp,
    granularity: granularity, // This is the storage granularity, not query granularity
    attributionType: attribution.type,
    attributionValue: attribution.value,
    aggregationType: aggType,
    payloadField,
    payloadCategory,
    ...extra,
  };
}

/**
 * Writes a batch of metric updates to MongoDB using bulk operations.
 * @param targetCollection The name of the MongoDB collection to write to.
 * @param metrics An array of metric updates.
 */
export async function writeMetricsToMongo(
  engine: Engine,
  targetCollection: string,
  metrics: IMetricUpdate[],
  retry: number = 0,
): Promise<void> {
  if (metrics.length === 0) {
    return;
  }

  // Prepare bulk write operations for MongoDB.
  const AggregateModel = await createAggregateModel(
    engine.connection,
    targetCollection,
  );
  const bulkOps = metrics.map((agg) => {
    const truncatedTimestamp = new Date(agg.query.timestamp);
    const finalQuery = { ...agg.query, timestamp: truncatedTimestamp };

    return {
      updateOne: {
        filter: finalQuery,
        update: {
          $inc: { value: agg.incrementValue },
          $setOnInsert: finalQuery,
        },
        upsert: true,
      },
    };
  });

  if (bulkOps.length > 0) {
    try {
      await AggregateModel.bulkWrite(bulkOps);
    } catch (error) {
      // sometimes duplicate keys stuck up in one session before initial write
      // so we get a conflict even with {upsert: true}
      // here we give db some time to commit the first batch
      if ((error as any).code === 11000 && retry < 100) {
        await new Promise((resolve) => setTimeout(resolve, 100 * retry));
        await writeMetricsToMongo(
          engine,
          targetCollection,
          metrics,
          retry + 1,
        );
        return;
      }
      throw error;
    }
  }
}

/**
 * Writes a batch of boolean metric updates to MongoDB.
 * This uses a simple insertMany as we are not aggregating, but recording individual facts.
 * @param engine The engine instance.
 * @param targetCollection The name of the MongoDB collection to write to.
 * @param metrics An array of metric updates for boolean types.
 */
export async function writeBooleanMetricsToMongo(
  engine: Engine,
  targetCollection: string,
  metrics: IMetricUpdate[],
): Promise<void> {
  if (metrics.length === 0) {
    return;
  }

  const AggregateModel = await createAggregateModel(
    engine.connection,
    targetCollection,
  );

  const documentsToInsert = metrics.map((metric) => ({
    ...metric.query,
    value: metric.incrementValue, // Here value is 0 or 1
  }));

  await AggregateModel.insertMany(documentsToInsert);
}
