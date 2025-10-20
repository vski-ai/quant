import { Model } from "mongoose";
import { IAggregationSourceFilter } from "./Aggregation.ts";
import { getReportModel } from "./Report.ts";
import {
  AggregationType,
  Granularity,
  IDatasetDataPoint,
  IDatasetQuery,
  ITimeRange,
} from "../types.ts";
import { getPartitionedCollectionNames } from "./Partition.ts";
import { Engine } from "../engine.ts";
import { TOTAL_ATTRIBUTION } from "../constants.ts";
import { createAggregateModel } from "./Aggregation.ts";
import { createHash } from "node:crypto";
import { IReportCacheDoc } from "./ReportCache.ts";

/**
 * Queries a MongoDB aggregate collection to fetch data for a dataset report.
 * @param query The dataset query.
 * @param model The Mongoose model for the aggregate collection.
 * @param filter The source/event filter for the report.
 * @returns A promise resolving to an array of raw data points.
 */
export async function queryMongoForDataset(
  query: IDatasetQuery,
  model: Model<any>,
  filter: IAggregationSourceFilter,
): Promise<{
  timestamp: Date;
  metricKey?: string;
  value?: number;
  boolean_groups?: { name: string; value: boolean; timestamp: Date }[];
}[]> {
  const { metrics, attribution, timeRange, granularity } = query;

  if (Array.isArray(granularity)) {
    throw new Error(
      "queryMongoForDataset does not support multiple granularities.",
    );
  }

  const matchStage: Record<string, any> = {
    timestamp: { $gte: timeRange.start, $lte: timeRange.end },
  };

  if (filter.sources.length) {
    matchStage.sourceId = {
      $in: (filter.sources as any).map((s: any) => s.id),
    };
  }
  if (filter.events.length) {
    matchStage.eventType = { $in: filter.events };
  }

  const standardMetricsPipeline: any[] = [
    { $match: { aggregationType: { $ne: AggregationType.BOOLEAN } } },
  ];

  const metricsMatch: Record<string, any> = {};
  if (Array.isArray(metrics) && metrics.length > 0) {
    metricsMatch.$or = [
      { payloadField: { $in: metrics } }, // SUM metrics for specified fields
      {
        aggregationType: {
          $in: [
            AggregationType.COUNT,
          ],
        },
      },
    ];
    // Only add the metricsMatch stage if a filter is specified.
    standardMetricsPipeline.push({ $match: metricsMatch });
  }

  if (attribution) {
    matchStage.attributionType = attribution.type;
    matchStage.attributionValue = attribution.value;
  } else {
    matchStage.attributionType = TOTAL_ATTRIBUTION;
    matchStage.attributionValue = TOTAL_ATTRIBUTION;
  }

  // Granularity grouping logic (same as in ReportQuery)
  let timeGroupExpression: any;
  if (["second", "minute", "hour", "day"].includes(granularity)) {
    timeGroupExpression = {
      $dateTrunc: { date: "$timestamp", unit: granularity },
    };
  } else {
    const unit = granularity.endsWith("minute")
      ? "minute"
      : (granularity.endsWith("hour") ? "hour" : "day");
    const value = parseInt(granularity.replace(unit, ""), 10);
    let intervalMillis: number;
    if (unit === "minute") intervalMillis = value * 60 * 1000;
    else if (unit === "hour") intervalMillis = value * 60 * 60 * 1000;
    else intervalMillis = value * 24 * 60 * 60 * 1000;
    timeGroupExpression = {
      $toDate: {
        $subtract: [{ $toLong: "$timestamp" }, {
          $mod: [{ $toLong: "$timestamp" }, intervalMillis],
        }],
      },
    };
  }

  const pipeline: any[] = [
    { $match: matchStage }, // Initial match for time range, source, event, attribution
    {
      $facet: {
        // Branch 1: Process standard aggregated metrics
        standardMetrics: [...standardMetricsPipeline, {
          $group: {
            _id: {
              time: timeGroupExpression,
              type: "$aggregationType",
              field: "$payloadField",
              eventType: "$eventType",
              categoryKey: "$compoundCategoryKey",
              categoryValue: "$payloadCategory",
            },
            value: { $sum: "$value" },
          },
        }, {
          $project: {
            _id: 0,
            timestamp: "$_id.time",
            value: "$value",
            metricKey: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ["$_id.type", AggregationType.COUNT] },
                    then: { $concat: ["$_id.eventType", "_count"] },
                  },
                  {
                    case: { $eq: ["$_id.type", AggregationType.SUM] },
                    then: { $concat: ["$_id.field", "_sum"] },
                  },
                  {
                    case: { $eq: ["$_id.type", AggregationType.CATEGORY] },
                    then: {
                      $concat: ["$_id.field", "_by_", "$_id.categoryValue"],
                    },
                  },
                  {
                    case: {
                      $eq: ["$_id.type", AggregationType.COMPOUND_SUM],
                    },
                    then: {
                      $concat: [
                        "$_id.field",
                        "_sum_by_",
                        "$_id.categoryKey",
                        "_",
                        "$_id.categoryValue",
                      ],
                    },
                  },
                ],
                default: "unknown",
              },
            },
          },
        }],
        // Branch 2: Collect individual boolean events
        booleanEvents: [
          { $match: { aggregationType: AggregationType.BOOLEAN } },
          {
            $group: {
              _id: { time: timeGroupExpression },
              events: {
                $push: {
                  name: "$payloadField",
                  value: { $eq: ["$value", 1] },
                  timestamp: "$timestamp",
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              timestamp: "$_id.time",
              boolean_groups: "$events",
            },
          },
        ],
      },
    },
    // Merge the two branches
    {
      $project: {
        allData: { $concatArrays: ["$standardMetrics", "$booleanEvents"] },
      },
    },
    { $unwind: "$allData" },
    { $replaceRoot: { newRoot: "$allData" } },
  ];

  return await model.aggregate(pipeline).exec();
}

function sortObject<T>(obj: T): T {
  if (obj instanceof Date) {
    return obj.getTime() as any;
  }
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObject) as any;
  }
  if (obj.constructor !== Object) {
    return obj;
  }
  const sortedKeys = Object.keys(obj).sort();
  const newObj: any = {};
  for (const key of sortedKeys) {
    newObj[key] = sortObject((obj as any)[key]);
  }
  return newObj;
}

function generateCacheKey(query: IDatasetQuery): string {
  const stableQuery = sortObject({
    ...query,
    rebuildCache: undefined,
    cache: undefined,
  });
  const queryString = JSON.stringify(stableQuery);
  return createHash("sha256").update(queryString).digest("hex");
}

function generateBaseCacheKey(query: IDatasetQuery): string {
  // Hash of the query object *without* the timeRange.
  const stableQuery = sortObject({
    ...query,
    timeRange: undefined,
    rebuildCache: undefined,
    cache: undefined,
  });
  const queryString = JSON.stringify(stableQuery);
  return createHash("sha256").update(queryString).digest("hex");
}

async function getFromCache(
  engine: Engine,
  key: string,
): Promise<IDatasetDataPoint[] | null> {
  const cached = await engine.ReportCacheModel.findOne({ cacheKey: key })
    .lean();
  const ttlSeconds = engine.config.cache?.ttlSeconds;

  if (cached && ttlSeconds && ttlSeconds > 0) {
    const isExpired =
      (Date.now() - cached.createdAt.getTime()) > (ttlSeconds * 1000);
    if (isExpired) {
      return null; // Treat as a cache miss if the document is logically expired
    }
  }
  if (cached) {
    return cached.data as IDatasetDataPoint[];
  }
  return null;
}

/**
 * Finds gaps in a requested time range compared to cached chunks for datasets.
 */
function findDatasetCacheGups(
  requestedRange: ITimeRange,
  cachedChunks: IReportCacheDoc[],
): {
  cachedData: IDatasetDataPoint[];
  gaps: ITimeRange[];
} {
  if (cachedChunks.length === 0) {
    return { cachedData: [], gaps: [requestedRange] };
  }

  // Sort cached chunks by start time
  cachedChunks.sort((a, b) =>
    a.timeRange.start.getTime() - b.timeRange.start.getTime()
  );

  const gaps: ITimeRange[] = [];
  let lastCoveredTime = requestedRange.start.getTime();
  const cachedData = cachedChunks.flatMap((chunk) =>
    chunk.data as IDatasetDataPoint[]
  );

  for (const chunk of cachedChunks) {
    const chunkStart = chunk.timeRange.start.getTime();
    const chunkEnd = chunk.timeRange.end.getTime();

    // If there's a gap between the last covered time and the start of this chunk
    if (chunkStart > lastCoveredTime) {
      gaps.push({
        start: new Date(lastCoveredTime),
        end: new Date(chunkStart),
      });
    }

    // Move the "last covered time" pointer forward
    if (chunkEnd > lastCoveredTime) {
      lastCoveredTime = chunkEnd;
    }
  }

  // If there's a final gap at the end of the requested range
  if (requestedRange.end.getTime() > lastCoveredTime) {
    gaps.push({
      start: new Date(lastCoveredTime),
      end: requestedRange.end,
    });
  }

  return { cachedData, gaps };
}

/**
 * Retrieves a dataset report, aggregating multiple metrics from historical data.
 *
 * @param query The query defining the dataset to generate.
 * @param engine The engine instance.
 * @returns A promise that resolves to a dataset report.
 */
export async function getDataset(
  query: IDatasetQuery,
  engine: Engine,
): Promise<IDatasetDataPoint[]> {
  const cacheConfig = engine.config.cache;

  let shouldTryCache = false;
  if (cacheConfig?.enabled) {
    if (cacheConfig.controlled) {
      // In controlled mode, only cache if query.cache is explicitly true.
      if (query.cache === true) {
        shouldTryCache = true;
      }
    } else {
      // In default (uncontrolled) mode, always try to cache.
      shouldTryCache = true;
    }
  }

  let cacheKey: string | undefined;

  if (shouldTryCache) {
    if (cacheConfig?.partialHits) {
      const baseKey = generateBaseCacheKey(query);
      const overlappingChunks = await engine.ReportCacheModel.find({
        baseKey,
        "timeRange.start": { $lt: query.timeRange.end },
        "timeRange.end": { $gt: query.timeRange.start },
      }).lean();

      const { cachedData, gaps } = findDatasetCacheGups(
        query.timeRange,
        overlappingChunks,
      );

      if (gaps.length === 0) {
        // The entire range is covered by the cache!
        return mergeAndFormatDataset(cachedData as any, query);
      }

      // Fetch data for the gaps
      const gapPromises = gaps.map(async (gapRange) => {
        const gapQuery = { ...query, timeRange: gapRange };
        const gapData = await getDatasetFromSources(gapQuery, engine);
        if (gapData.length > 0) {
          // Save the raw data to cache, not the formatted data
          await saveDatasetToCache(gapQuery, gapData, engine);
        }
        return gapData;
      });

      const gapResults = (await Promise.all(gapPromises)).flat();

      return mergeAndFormatDataset(
        [...cachedData as any, ...gapResults],
        query,
      );
    } else {
      // --- Standard (non-partial) caching logic ---
      cacheKey = generateCacheKey(query);
      if (!query.rebuildCache) {
        const cachedDataset = await getFromCache(engine, cacheKey);
        if (cachedDataset) {
          return cachedDataset;
        }
      }
    }
  }

  // --- Cache Miss or Caching Disabled ---
  const rawResults = await getDatasetFromSources(query, engine);

  // If caching is enabled, store the result.
  if (shouldTryCache) {
    // Save the formatted data for standard caching
    await saveDatasetToCache(
      query,
      mergeAndFormatDataset(rawResults as any, query),
      engine,
    );
  }

  return mergeAndFormatDataset(rawResults as any, query);
}

async function saveDatasetToCache(
  query: IDatasetQuery,
  data: any[],
  engine: Engine,
) {
  const cacheConfig = engine.config.cache;
  if (!cacheConfig?.enabled) return;

  if (cacheConfig.partialHits) {
    const baseKey = generateBaseCacheKey(query);
    await engine.ReportCacheModel.create({
      baseKey,
      timeRange: query.timeRange,
      reportId: query.reportId,
      data,
    });
  } else {
    const cacheKey = generateCacheKey(query);
    await engine.ReportCacheModel.findOneAndUpdate(
      { cacheKey: cacheKey },
      {
        cacheKey: cacheKey,
        baseKey: cacheKey,
        timeRange: query.timeRange,
        data,
        reportId: query.reportId,
      },
      { upsert: true, new: true },
    ).exec();
  }
}

async function getDatasetFromSources(
  query: IDatasetQuery,
  engine: Engine,
): Promise<{
  timestamp: Date;
  metricKey?: string;
  value?: number;
}[]> {
  const ReportModel = getReportModel(engine.connection);
  const reportConfig = await ReportModel.findById(query.reportId).lean();
  if (!reportConfig) {
    throw new Error(`Report with ID "${query.reportId}" not found.`);
  }

  const aggregationSources = await engine.listAggregationSources(
    reportConfig._id.toString(),
  );
  if (!aggregationSources || aggregationSources.length === 0) {
    return [];
  }

  const mongoQueryPromises = aggregationSources.flatMap((source) => {
    const collectionNames = source.partition?.enabled
      ? getPartitionedCollectionNames(
        source.targetCollection,
        query.timeRange,
        source.granularity!,
        source.partition.length,
      )
      : [source.targetCollection];
    return collectionNames.map(async (collectionName) => {
      const model = await createAggregateModel(
        engine.connection,
        collectionName,
      );
      return queryMongoForDataset(query, model, source.filter!);
    });
  });

  const mongoResults = await Promise.all(mongoQueryPromises).then((res) =>
    res.flat()
  );
  return mongoResults;
}

/**
 * Merges and formats raw metric data into the final dataset structure.
 * @param results Raw data points from Mongo and Redis queries.
 * @returns An array of formatted dataset points.
 */
function mergeAndFormatDataset(
  results: {
    timestamp: Date;
    metricKey: string;
    boolean_groups?: any[];
    value: number;
  }[],
  query: IDatasetQuery,
): IDatasetDataPoint[] {
  const mergedMap = new Map<string, IDatasetDataPoint>();

  for (const point of results) {
    const isoTimestamp = point.timestamp.toISOString();

    // Get or create the data point for this timestamp.
    let dataPoint = mergedMap.get(isoTimestamp);
    if (!dataPoint) {
      dataPoint = {
        timestamp: point.timestamp,
      };
      mergedMap.set(isoTimestamp, dataPoint);
    }

    // Add the metric from the current point to the data point object.
    if (point.metricKey) {
      const currentValue = (dataPoint[point.metricKey] as number) || 0;
      dataPoint[point.metricKey] = currentValue + point.value;
    }
    if (point.boolean_groups) {
      dataPoint.$boolean_groups = (dataPoint.$boolean_groups || []).concat(
        point.boolean_groups,
      );
    }
  }
  const finalResults = Array.from(mergedMap.values());

  // Sort the final results chronologically.
  finalResults.sort((a, b) => {
    if (query.sortBy) {
      const aValue = a[query.sortBy] as any;
      const bValue = b[query.sortBy] as any;

      if (aValue < bValue) {
        return query.sortDirection === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return query.sortDirection === "asc" ? 1 : -1;
      }
      return 0;
    }
    return a.timestamp.getTime() - b.timestamp.getTime();
  });
  return finalResults;
}
