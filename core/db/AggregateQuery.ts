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

    const numericalFields = new Map<string, number>();
    const categoricalFields = new Map<string, string>();
    const booleanFields = new Map<string, boolean>();

    for (const [field, value] of Object.entries(eventDoc.payload)) {
      if (typeof value === "number") {
        numericalFields.set(field, value);
      } else if (typeof value === "string") {
        categoricalFields.set(field, value);
      } else if (typeof value === "boolean") {
        categoricalFields.set(field, String(value)); // Also treat booleans as categories for compound metrics
        booleanFields.set(field, value);
      }
    }

    const truncatedTimestamp = truncateDate(
      eventDoc.timestamp,
      storageGranularity,
    );

    for (const attr of attributionsToProcess) {
      // Base COUNT metric
      metrics.push({
        query: buildAggregateQuery(
          eventDoc.sourceId.toString(),
          eventTypeDoc.name,
          truncatedTimestamp,
          attr,
          storageGranularity,
          AggregationType.COUNT,
        ),
        incrementValue: 1,
      });

      // SUM metrics
      for (const [field, value] of numericalFields.entries()) {
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
      }

      // CATEGORY metrics
      for (const [field, value] of categoricalFields.entries()) {
        metrics.push({
          query: buildAggregateQuery(
            eventDoc.sourceId.toString(),
            eventTypeDoc.name,
            truncatedTimestamp,
            attr,
            storageGranularity,
            AggregationType.CATEGORY,
            field,
            value,
          ),
          incrementValue: 1,
        });
      }

      // BOOLEAN metrics
      for (const [field, value] of booleanFields.entries()) {
        metrics.push({
          query: buildAggregateQuery(
            eventDoc.sourceId.toString(),
            eventTypeDoc.name,
            eventDoc.timestamp, // Use original timestamp for booleans
            attr,
            storageGranularity,
            AggregationType.BOOLEAN,
            field,
          ),
          incrementValue: value ? 1 : 0,
        });
      }

      // COMPOUND_SUM metrics
      for (const [numField, numValue] of numericalFields.entries()) {
        for (const [catField, catValue] of categoricalFields.entries()) {
          metrics.push({
            query: buildAggregateQuery(
              eventDoc.sourceId.toString(),
              eventTypeDoc.name,
              truncatedTimestamp,
              attr,
              storageGranularity,
              AggregationType.COMPOUND_SUM,
              numField,
              catValue,
              { compoundCategoryKey: catField },
            ),
            incrementValue: numValue,
          });
        }
      }

      // LEAF_SUM metrics
      const leafKey: Record<string, string> = {};
      for (const [field, value] of categoricalFields.entries()) {
        leafKey[field] = value;
      }

      for (const [numField, numValue] of numericalFields.entries()) {
        metrics.push({
          query: buildAggregateQuery(
            eventDoc.sourceId.toString(),
            eventTypeDoc.name,
            truncatedTimestamp,
            attr,
            storageGranularity,
            AggregationType.LEAF_SUM,
            numField,
            null, // No single payloadCategory for LEAF_SUM
            { leafKey },
          ),
          incrementValue: numValue,
        });
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

  // --- Plugin Hook: beforeMetricsWritten ---
  const modified = await engine.pluginManager.executeWaterfallHook(
    "beforeMetricsWritten",
    {
      metrics,
      targetCollection,
    },
  );

  const finalMetrics = modified.metrics;
  const finalTargetCollection = modified.targetCollection;

  // Pre-aggregate metrics in memory to prevent duplicate key errors from multiple
  // upserts targeting the same document in a single bulkWrite operation.
  const aggregatedMetrics = new Map<string, IMetricUpdate>();
  for (const metric of finalMetrics) {
    // Using JSON.stringify as a key. This assumes that the order of keys
    // in the query object is consistent for metrics that should be aggregated.
    const key = JSON.stringify(metric.query);
    const existingMetric = aggregatedMetrics.get(key);

    if (existingMetric) {
      existingMetric.incrementValue += metric.incrementValue;
    } else {
      // Store a copy to avoid mutating the original metric object,
      // which might be used by plugins.
      aggregatedMetrics.set(key, { ...metric });
    }
  }
  const uniqueMetrics = Array.from(aggregatedMetrics.values());

  // Prepare bulk write operations for MongoDB.
  const AggregateModel = await createAggregateModel(
    engine.connection,
    finalTargetCollection,
  );
  const bulkOps = uniqueMetrics.map(
    (agg) => {
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
    },
  );

  if (bulkOps.length > 0) {
    await AggregateModel.bulkWrite(bulkOps);
    // --- Plugin Hook: afterMetricsWritten ---
    // Pass the original metrics to the hook, as plugins might expect
    // the non-aggregated data.
    engine.pluginManager.executeActionHook("afterMetricsWritten", {
      metrics: finalMetrics,
      targetCollection: finalTargetCollection,
    }).catch(console.error);
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
