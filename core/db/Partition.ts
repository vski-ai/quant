import { Granularity, ITimeRange } from "../types.ts";

/**
 * Converts a Granularity string into its millisecond equivalent.
 * @param granularity The granularity string (e.g., 'second', '5minute').
 * @returns The number of milliseconds for that granularity.
 */
function granularityToMs(granularity: Granularity): number {
  if (granularity.endsWith("ms")) {
    return parseInt(granularity, 10);
  }
  if (granularity.endsWith("second")) {
    const val = parseInt(granularity, 10) || 1;
    return val * 1000;
  }
  if (granularity.endsWith("minute")) {
    const val = parseInt(granularity, 10) || 1;
    return val * 60 * 1000;
  }
  if (granularity.endsWith("hour")) {
    const val = parseInt(granularity, 10) || 1;
    return val * 60 * 60 * 1000;
  }
  if (granularity.endsWith("day")) {
    const val = parseInt(granularity, 10) || 1;
    return val * 24 * 60 * 60 * 1000;
  }
  // Default case for 'second'
  return 1000;
}

/**
 * Calculates the total duration of a single partition bucket in milliseconds.
 * @param granularity The granularity of each timestamp in the bucket.
 * @param length The number of timestamps that fit in the bucket.
 * @returns The duration of the bucket in milliseconds.
 */
export function getBucketDuration(
  granularity: Granularity,
  length: number,
): number {
  return granularityToMs(granularity) * length;
}

/**
 * Calculates the ordinal index of a bucket for a given date.
 * The index is the number of full buckets that have passed since the Unix epoch.
 * @param date The date to find the bucket for.
 * @param bucketDurationMs The total duration of one bucket in milliseconds.
 * @returns The ordinal index of the bucket.
 */
export function getBucketIndex(date: Date, bucketDurationMs: number): number {
  return Math.floor(date.getTime() / bucketDurationMs);
}

/**
 * Generates a partitioned collection name based on an ordinal bucketing scheme.
 * @param prefix The base name for the collection.
 * @param date The date for which to generate the collection name.
 * @param granularity The granularity of timestamps within the bucket.
 * @param length The number of timestamps per bucket.
 * @returns The partitioned collection name (e.g., 'aggr_my_events_1759').
 */
export function getPartitionedCollectionName(
  prefix: string,
  date: Date,
  granularity: Granularity,
  length: number,
): string {
  const bucketDurationMs = getBucketDuration(granularity, length);
  const index = getBucketIndex(date, bucketDurationMs);
  return `${prefix}_${index}`;
}

/**
 * Generates a list of collection names for a given time range and ordinal partitioning scheme.
 * @param prefix The base name for the collection.
 * @param timeRange The start and end dates for the query.
 * @param granularity The granularity of timestamps within the bucket.
 * @param length The number of timestamps per bucket.
 * @returns An array of collection names.
 */
export function getPartitionedCollectionNames(
  prefix: string,
  timeRange: ITimeRange,
  granularity: Granularity,
  length: number,
): string[] {
  const bucketDurationMs = getBucketDuration(granularity, length);
  const startIndex = getBucketIndex(
    new Date(timeRange.start),
    bucketDurationMs,
  );
  const endIndex = getBucketIndex(new Date(timeRange.end), bucketDurationMs);

  const names = new Set<string>();
  for (let i = startIndex; i <= endIndex; i++) {
    names.add(`${prefix}_${i}`);
  }
  return Array.from(names);
}
