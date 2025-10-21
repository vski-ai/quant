import { Model } from "mongoose";
import {
  createAggregateModel,
  IAggregationSourceFilter,
} from "./Aggregation.ts";
import { getReportModel } from "./Report.ts";
import { truncateDate } from "../utils.ts";
import {
  AggregationType,
  Granularity,
  IQuery,
  IReportDataPoint,
  ITimeRange,
} from "../types.ts";
import { getPartitionedCollectionNames } from "./Partition.ts";
import { Engine } from "../engine.ts";
import { TOTAL_ATTRIBUTION } from "../constants.ts";
import {
  findCacheGaps,
  generateBaseCacheKey,
  generateCacheKey,
  getFromCache,
  saveToCache,
} from "./Cache.ts";
import { IReportCacheDoc } from "./ReportCache.ts";
import { createHash } from "node:crypto";

/**
 * Queries a single aggregate
 * collection based on a filter.
 */
export async function queryMongo(
  query: IQuery,
  model: Model<any>,
  filter?: IAggregationSourceFilter,
): Promise<IReportDataPoint[]> {
  const { metric, attribution, timeRange, granularity, groupBy } = query;

  if (Array.isArray(granularity)) {
    throw new Error("queryMongo does not support multiple granularities.");
  }

  const matchStage: Record<string, any> = {
    timestamp: { $gte: timeRange.start, $lte: timeRange.end },
  };

  if ((filter?.sources as any)?.length) {
    matchStage.sourceId = {
      $in: (filter?.sources as any).map((s: { id: 1 }) => s.id),
    };
  }

  if (filter?.events?.length) {
    matchStage.eventType = { $in: filter.events };
  }

  if (groupBy && groupBy.length > 0) {
    matchStage.aggregationType = AggregationType.COMPOUND_SUM;
    matchStage.payloadField = metric.field;
    matchStage.compoundCategoryKey = groupBy[0];
  } else {
    matchStage.aggregationType = metric.type;
    if (metric.type === AggregationType.COUNT) {
      matchStage.payloadField = null;
    } else if (metric.field) {
      matchStage.payloadField = metric.field;
    }
  }

  if (attribution) {
    matchStage.attributionType = attribution.type;
    matchStage.attributionValue = attribution.value;
  } else {
    // For general queries, we match the pre-aggregated totals.
    matchStage.attributionType = TOTAL_ATTRIBUTION;
    matchStage.attributionValue = TOTAL_ATTRIBUTION;
  }

  // Handle granularity grouping. Use $dateTrunc for simple units
  // and math for custom intervals.
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
        $subtract: [
          { $toLong: "$timestamp" },
          { $mod: [{ $toLong: "$timestamp" }, intervalMillis] },
        ],
      },
    };
  }

  const groupStage: Record<string, any> = {
    _id: { time: timeGroupExpression },
    value: { $sum: "$value" },
  };
  if (
    metric.type === AggregationType.CATEGORY || (groupBy && groupBy.length > 0)
  ) {
    groupStage._id.category = "$payloadCategory";
  }

  const projectStage: Record<string, any> = {
    _id: 0,
    timestamp: "$_id.time",
    value: 1,
  };
  if (
    metric.type === AggregationType.CATEGORY || (groupBy && groupBy.length > 0)
  ) {
    projectStage.category = "$_id.category";
  }

  const pipeline = [
    { $match: matchStage },
    { $group: groupStage },
    { $sort: { "_id.time": 1 as const } },
    { $project: projectStage },
  ];

  return await model.aggregate(pipeline).exec();
}

/**
 * Main function to retrieve a report. It now supports reports
 * that aggregate data from multiple underlying collections.
 * @param query The query defining the report to generate.
 * @returns A promise that resolves to an analytics report.
 */
export async function getReport(
  query: IQuery,
  engine: Engine,
): Promise<IReportDataPoint[]> {
  const cacheConfig = engine.config.cache;

  if (Array.isArray(query.granularity)) {
    throw new Error("getReport does not support multiple granularities.");
  }

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

      const { cachedData, gaps } = findCacheGaps(
        query.timeRange,
        overlappingChunks as any,
      );

      if (gaps.length === 0) {
        // The entire range is covered by the cache!
        const finalReport = mergeAndAggregateResults(
          cachedData as any,
          query.granularity as Granularity,
          query.metric.type,
        );
        await engine.pluginManager.executeActionHook("afterReportGenerated", {
          report: finalReport,
          query,
        });
        return finalReport;
      }

      // Fetch data for the gaps
      const gapPromises = gaps.map(async (gapRange) => {
        const gapQuery = { ...query, timeRange: gapRange };
        // Fetch the data for the gap
        const gapData = await getReportFromSources(gapQuery, engine);
        // Asynchronously save this new chunk to the cache for future use
        if (gapData.length > 0) {
          await saveToCache(gapQuery, gapData, engine);
        }
        return gapData;
      });

      const gapResults = (await Promise.all(gapPromises)).flat();

      // Merge cached data with newly fetched gap data
      const finalReport = mergeAndAggregateResults(
        [...cachedData as any, ...gapResults],
        query.granularity as Granularity,
        query.metric.type,
      );
      await engine.pluginManager.executeActionHook("afterReportGenerated", {
        report: finalReport,
        query,
      });
      return finalReport;
    } else {
      // --- Standard (non-partial) caching logic ---
      cacheKey = generateCacheKey(query);
      if (!query.rebuildCache) {
        const cachedReport = await getFromCache(engine, cacheKey);
        if (cachedReport) {
          await engine.pluginManager.executeActionHook("afterReportGenerated", {
            report: cachedReport as any,
            query,
          });
          return cachedReport as any;
        }
      }
    }
  }

  // --- Cache Miss or Caching Disabled ---
  const finalResults = await getReportFromSources(query, engine);

  // If caching is enabled, store the result.
  if (shouldTryCache) {
    await saveToCache(query, finalResults, engine);
  }

  // --- Plugin Hook: afterReportGenerated ---
  await engine.pluginManager.executeActionHook("afterReportGenerated", {
    report: finalResults,
    query: query,
  });

  return finalResults;
}

/**
 * Merges results from multiple collections. This is necessary because data for the same
 * time bucket might come from different sources and needs to be summed together.
 */
export function mergeAndAggregateResults(
  results: IReportDataPoint[],
  granularity: Granularity,
  metricType: AggregationType,
): IReportDataPoint[] {
  if (results.length === 0) return [];

  const mergedMap = new Map<string, IReportDataPoint>();

  for (const point of results) {
    // Normalize the timestamp to the query's granularity to ensure correct grouping.
    const truncatedTimestamp = truncateDate(point.timestamp, granularity);
    // Create a unique key for each time bucket (and category, if applicable).
    const key = metricType === AggregationType.CATEGORY
      ? `${truncatedTimestamp.toISOString()}|${point.category}`
      : truncatedTimestamp.toISOString();

    if (mergedMap.has(key)) {
      const existingPoint = mergedMap.get(key)!;
      existingPoint.value += point.value;
    } else {
      // Clone the point to avoid mutating the original array objects
      const newPoint = { ...point, timestamp: truncatedTimestamp };
      mergedMap.set(key, newPoint);
    }
  }

  const finalResults = Array.from(mergedMap.values());

  // Sort the final results chronologically.
  finalResults.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return finalResults;
}

async function getReportFromSources(
  query: IQuery,
  engine: Engine,
): Promise<IReportDataPoint[]> {
  // --- Plugin Hook: beforeReportGenerated ---
  // Note: This hook is intentionally run on the sub-query for gaps.
  // The top-level hook is run at the end of the main getReport function.
  const modifiedQuery = await engine.pluginManager.executeWaterfallHook(
    "beforeReportGenerated",
    query,
  );

  // 1. Find the report configuration.
  const ReportModel = getReportModel(engine.connection);
  const reportConfig = await ReportModel.findById(modifiedQuery.reportId)
    .lean();

  if (!reportConfig) {
    throw new Error(`Report with ID "${modifiedQuery.reportId}" not found.`);
  }

  // 2. Find all aggregation sources linked to this report.
  const aggregationSources = await engine.listAggregationSources(
    reportConfig._id.toString(),
  );

  if (!aggregationSources || aggregationSources.length === 0) {
    return []; // No sources, return an empty report.
  }

  // 3. Build and execute queries for historical (Mongo) data.
  const mongoQueryPromises = aggregationSources.flatMap((source) => {
    const collectionNames = source.partition?.enabled
      ? getPartitionedCollectionNames(
        source.targetCollection,
        modifiedQuery.timeRange,
        source.granularity!,
        source.partition.length,
      )
      : [source.targetCollection];

    return collectionNames.map(async (collectionName) => {
      const model = await createAggregateModel(
        engine.connection,
        collectionName,
      );
      return await queryMongo(modifiedQuery, model, source.filter);
    });
  });

  const mongoResults = (await Promise.all(mongoQueryPromises)).flat();

  // 4. Merge results from different collections (if any).
  // Note: The final merge for partial cache hits happens in the main getReport function.
  return mergeAndAggregateResults(
    mongoResults,
    modifiedQuery.granularity as Granularity,
    modifiedQuery.metric.type,
  );
}
