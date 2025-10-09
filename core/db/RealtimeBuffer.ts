import {
  AggregationType,
  IAnalyticsQuery,
  IDatasetDataPoint,
  IDatasetQuery,
  IReportDataPoint,
} from "../types.ts";
import { IMetricUpdate } from "./AggregateQuery.ts";
import { IAggregationSourceFilter } from "./Aggregation.ts";
import { Redis } from "ioredis"; // Assuming ioredis, a popular choice
import { queryRedisBuffer } from "./RedisQuery.ts";
import { REDIS_NULL_VALUE } from "../constants.ts";
import { meter } from "../telemetry.ts";
import { truncateDate } from "../utils.ts";

const DEFAULT_BUFFER_AGE_MS = 5 * 60 * 1000; // 5 minutes
/**
 * Defines the contract for a buffer service that can temporarily store,
 * query, and flush metric updates.
 */
export interface IRealtimeService {
  redis: Redis;
  bufferAgeMs: number;
  /**
   * Adds a metric update to the buffer for a specific target collection.
   * @param targetCollection The destination collection for the metric.
   * @param metric The metric update to add.
   */
  add(targetCollection: string, metric: IMetricUpdate): Promise<void>;

  /**
   * Queries the buffer to provide a real-time report, including data
   * that has not yet been flushed to the database.
   * @param query The analytics query to execute against the buffer.
   * @param targetCollection The specific buffer collections to query.
   * @param filter The source/event filter for the report.
   * @returns A promise that resolves to an array of report data points.
   */
  query(
    query: IAnalyticsQuery,
    targetCollection?: string,
    filter?: IAggregationSourceFilter,
  ): Promise<IReportDataPoint[]>;

  queryDataset(
    query: IDatasetQuery,
    targetCollection?: string,
    filter?: IAggregationSourceFilter,
  ): Promise<IDatasetDataPoint[]>;
}

/**
 * An implementation of IBufferService using Redis as the backend.
 * This provides a distributed, scalable buffer for multiple workers.
 */
export class RealtimeBuffer implements IRealtimeService {
  private bufferSizeGauge = meter.createObservableGauge("buffer.size.bytes", {
    description: "The total size of the Redis buffer in bytes.",
    unit: "By",
  });

  constructor(
    public redis: Redis,
    private prefix = "metrics_buffer",
    public bufferAgeMs: number = DEFAULT_BUFFER_AGE_MS,
  ) {
    this.startMonitoringSize();
  }

  private getCollectionKey(targetCollection: string): string {
    return `${this.prefix}:${targetCollection}`;
  }

  private getCollectionsSetKey(): string {
    return `${this.prefix}:collections`;
  }

  async add(targetCollection: string, metric: IMetricUpdate): Promise<void> {
    const { query, incrementValue } = metric;
    const timestamp = new Date(query.timestamp).getTime(); // Score for the ZSET

    // Create a structured, colon-delimited string for the ZSET member.
    // This is more memory-efficient and faster to parse than JSON.
    // Format: <increment>:<aggType>:<field>:<category>:<compoundKey>:<attrType>:<attrValue>:<sourceId>:<eventType>:<granularity>:<random>
    const member = [
      incrementValue,
      query.aggregationType,
      query.payloadField || REDIS_NULL_VALUE,
      query.payloadCategory || REDIS_NULL_VALUE,
      query.compoundCategoryKey || REDIS_NULL_VALUE,
      query.attributionType || REDIS_NULL_VALUE,
      query.attributionValue || REDIS_NULL_VALUE,
      query.sourceId,
      query.eventType,
      query.granularity || REDIS_NULL_VALUE,
      (Math.random() * 10000000).toFixed(0), // Add random component to ensure uniqueness
    ].join(":");

    const collectionKey = this.getCollectionKey(targetCollection);

    // Use a pipeline to atomically add the member and set the expiration.
    const pipeline = this.redis.pipeline();
    pipeline.zadd(
      collectionKey,
      timestamp,
      member,
    );
    // Set the key to expire after bufferAgeMs, ensuring old data is cleaned up.
    pipeline.expire(collectionKey, Math.ceil(this.bufferAgeMs / 1000));
    // Keep track of which collections are active.
    pipeline.sadd(
      this.getCollectionsSetKey(),
      targetCollection,
    );
    await pipeline.exec();
  }

  private startMonitoringSize() {
    this.bufferSizeGauge.addCallback(async (result) => {
      try {
        const info = await this.redis.info("memory");
        // The 'info' command returns a string. We parse it to find 'used_memory'.
        const usedMemoryMatch = info.match(/used_memory:(\d+)/);
        if (usedMemoryMatch && usedMemoryMatch[1]) {
          const usedMemory = parseInt(usedMemoryMatch[1], 10);
          result.observe(usedMemory);
        }
      } catch (error) {
        console.error("Failed to get Redis memory info for telemetry:", error);
      }
    });
  }

  async query(
    query: IAnalyticsQuery,
    targetCollection?: string,
    filter?: IAggregationSourceFilter,
  ): Promise<IReportDataPoint[]> {
    const results: IReportDataPoint[] = await queryRedisBuffer(
      this.redis,
      this.prefix,
      query,
      targetCollection,
      filter,
    );
    // The aggregation and formatting are now handled inside queryRedisBuffer
    return results;
  }

  async queryDataset(
    query: IDatasetQuery,
    targetCollection?: string,
    filter?: IAggregationSourceFilter,
  ): Promise<IDatasetDataPoint[]> {
    const rawPoints = await queryRedisBuffer(
      // @ts-ignore: reason
      this.redis,
      this.prefix,
      query,
      targetCollection,
      filter,
    );

    const mergedMap = new Map<string, IDatasetDataPoint>();

    for (const point of rawPoints) {
      const parts = point.member.split(":");
      // Note: The original timestamp is in point.timestamp, not in the member string.
      const [
        _incrementValue,
        aggType,
        payloadField,
        payloadCategory,
        compoundCategoryKey,
        _attrType,
        _attrValue,
        _sourceId,
        eventType,
      ] = parts;

      // Truncate timestamp to group into time buckets
      const truncatedTimestamp = truncateDate(
        point.timestamp,
        query.granularity,
      );
      const isoTimestamp = truncatedTimestamp.toISOString();

      // Get or create the data point for this time bucket
      let dataPoint = mergedMap.get(isoTimestamp);
      if (!dataPoint) {
        dataPoint = { timestamp: truncatedTimestamp };
        mergedMap.set(isoTimestamp, dataPoint);
      }

      if (aggType === AggregationType.BOOLEAN) {
        // Handle boolean events by adding them to the special group
        if (!dataPoint.$boolean_groups) {
          dataPoint.$boolean_groups = [];
        }
        dataPoint.$boolean_groups.push({
          name: payloadField,
          value: point.value === 1,
          timestamp: point.timestamp, // The original, non-truncated timestamp
        });
      } else {
        // Handle standard metrics
        let metricKey = "unknown";

        // Reconstruct the metric key just like in the Mongo query
        if (aggType === AggregationType.COUNT) {
          metricKey = `${eventType}_count`;
        } else if (aggType === AggregationType.SUM) {
          metricKey = `${payloadField}_sum`;
        } else if (aggType === AggregationType.COMPOUND_SUM) {
          metricKey =
            `${payloadField}_sum_by_${compoundCategoryKey}_${payloadCategory}`;
        } else if (aggType === AggregationType.CATEGORY) {
          metricKey = `${payloadField}_by_${payloadCategory}`;
        }

        // Increment the value for the reconstructed metric key
        dataPoint[metricKey] = ((dataPoint[metricKey] as number) || 0) +
          point.value;
      }
    }

    const finalResults = Array.from(mergedMap.values());
    finalResults.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return finalResults;
  }
}
