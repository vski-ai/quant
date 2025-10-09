import { Redis } from "ioredis";
import {
  AggregationType,
  IAnalyticsQuery,
  IDatasetQuery,
  IReportDataPoint,
} from "../types.ts";
import { IAggregationSourceFilter } from "./Aggregation.ts";
import { truncateDate } from "../utils.ts";
import { TOTAL_ATTRIBUTION } from "../constants.ts";

/**
 * Queries the Redis buffer to provide a real-time report, including data
 * that has not yet been flushed to the database.
 *
 * @param redis - The ioredis client instance.
 * @param prefix - The Redis key prefix used by the buffer.
 * @param query - The analytics query to execute against the buffer.
 * @param targetCollections - The specific buffer collections to query.
 * @param filter - The source/event filter for the report.
 * @returns A promise that resolves to an object containing report data points and the last flushed timestamp.
 */
export async function queryRedisBuffer(
  redis: Redis,
  prefix: string,
  query: IAnalyticsQuery | IDatasetQuery,
  collection?: string,
  filter?: IAggregationSourceFilter,
): Promise<
  { member: string; timestamp: Date; value: number; category?: string }[]
> {
  const { attribution, timeRange, granularity } = query;
  const metric = "metric" in query ? query.metric : undefined;
  const metrics = "metrics" in query ? query.metrics : undefined;

  const start = timeRange.start.getTime();
  const end = timeRange.end.getTime();

  let collectionsToQuery: string[];
  if (collection) {
    collectionsToQuery = [collection];
  } else {
    // Using KEYS is a major performance risk. The calling context (e.g., Engine)
    // is now responsible for providing the specific collection(s) to query.
    // If no collection is provided, we query nothing.
    collectionsToQuery = [];
  }

  // 2. Filter and process members in batches (one collection at a time) to keep memory usage low.
  const filteredMetrics: {
    timestamp: Date;
    member: string;
    value: number;
    category?: string;
  }[] = [];

  const BATCH_SIZE = 1000;

  for (const coll of collectionsToQuery) {
    const collectionKey = `${prefix}:${coll}`;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // Fetch members with scores in batches using ZRANGE with LIMIT.
      const membersWithScores = await redis.zrange(
        collectionKey,
        start,
        end,
        // @ts-ignore: reason
        "BYSCORE",
        "WITHSCORES",
        "LIMIT",
        offset,
        BATCH_SIZE,
      );

      // Process this batch of members immediately.
      for (let i = 0; i < membersWithScores.length; i += 2) {
        const member = membersWithScores[i];
        const score = membersWithScores[i + 1];
        // Parse the structured member string.
        const parts = member.split(":");
        const [
          incrementValue,
          aggType,
          payloadField,
          payloadCategory,
          _compoundCategoryKey,
          attrType,
          attrValue,
          sourceId,
          eventType,
        ] = parts;

        // --- Filtering Logic ---
        let typeMatch = true;
        let fieldMatch = true;

        if (metric) { // Analytics Query (single metric)
          typeMatch = aggType === metric.type;
          fieldMatch = metric.type === AggregationType.COUNT
            ? payloadField === "null"
            : payloadField === metric.field;
        } else { // Dataset Query
          // For datasets, we always include COUNT and BOOLEAN types.
          // If no specific metrics are requested, include everything.
          // Otherwise, filter SUM/COMPOUND_SUM based on the metrics list.
          if (!metrics || metrics.length === 0) {
            fieldMatch = true; // Include all metric types
          } else {
            fieldMatch = aggType === AggregationType.COUNT ||
              aggType === AggregationType.BOOLEAN ||
              ((aggType === AggregationType.SUM ||
                aggType === AggregationType.COMPOUND_SUM) &&
                metrics.includes(payloadField));
          }
        }
        // If it's a dataset query with no metrics filter, typeMatch and fieldMatch remain true.

        const attributionMatch = attribution
          ? attrType === attribution.type && attrValue === attribution.value
          : attrType === TOTAL_ATTRIBUTION && attrValue === TOTAL_ATTRIBUTION;

        const sourceFilter = filter?.sources as any;
        const sourceMatch = !sourceFilter?.length ||
          sourceFilter.some((s: { id: string }) => s.id === sourceId);
        const eventMatch = !filter?.events?.length ||
          filter.events.includes(eventType);

        if (
          typeMatch && fieldMatch && attributionMatch && sourceMatch &&
          eventMatch
        ) {
          const timestamp = new Date(parseInt(score, 10));
          const category = metric?.type === AggregationType.CATEGORY &&
              payloadCategory !== "null"
            ? payloadCategory
            : undefined;

          filteredMetrics.push({
            timestamp,
            member,
            value: parseFloat(incrementValue),
            category,
          });
        }
      }

      if (membersWithScores.length / 2 < BATCH_SIZE) {
        hasMore = false; // We've fetched the last batch for this collection.
      } else {
        offset += BATCH_SIZE;
      }
    }
  }

  if (!metric) { // Return raw filtered data for dataset queries
    return filteredMetrics;
  }

  // 3. For analytics queries, aggregate the filtered results into IReportDataPoint format.
  const mergedMap = new Map<string, IReportDataPoint>();
  for (const metricData of filteredMetrics) {
    // Normalize the timestamp to the query's granularity to ensure correct grouping.
    const truncatedTimestamp = truncateDate(metricData.timestamp, granularity);

    // Create a unique key for each time bucket (and category, if applicable).
    const key = metric?.type === AggregationType.CATEGORY
      ? `${truncatedTimestamp.toISOString()}|${metricData.category}`
      : truncatedTimestamp.toISOString();

    if (mergedMap.has(key)) {
      const existingPoint = mergedMap.get(key)!;
      existingPoint.value += metricData.value;
    } else {
      mergedMap.set(key, {
        timestamp: truncatedTimestamp,
        value: metricData.value,
        category: metricData.category,
      });
    }
  }

  // This part is only for single-metric analytics queries now.
  // We need to reshape the output to match the original return type.
  return Array.from(mergedMap.values()).map((dp) => ({
    member: "", // Not needed for aggregated analytics query
    ...dp,
  }));
}
