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
} from "../types.ts";

import { getPartitionedCollectionNames } from "./Partition.ts";
import { Engine } from "../engine.ts";
import { TOTAL_ATTRIBUTION } from "../constants.ts";

/**
 * Queries a single aggregate
 * collection based on a filter.
 */
export async function queryMongo(
  query: IQuery,
  model: Model<any>,
  filter?: IAggregationSourceFilter,
): Promise<IReportDataPoint[]> {
  const { metric, attribution, timeRange, granularity } = query;
  const matchStage: Record<string, any> = {
    aggregationType: metric.type,
    timestamp: { $gte: timeRange.start, $lte: timeRange.end },
  };

  if ((filter?.sources as any).length) {
    matchStage.sourceId = {
      $in: (filter?.sources as any).map((s: { id: 1 }) => s.id),
    };
  }

  if (filter?.events.length) {
    matchStage.eventType = { $in: filter.events };
  }

  if (metric.type === AggregationType.COUNT) {
    // For COUNT, we only match documents that represent the
    // event count itself, not field-based aggregations.
    matchStage.payloadField = null;
  } else if (metric.field) {
    matchStage.payloadField = metric.field;
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
  if (metric.type === AggregationType.CATEGORY) {
    groupStage._id.category = "$payloadCategory";
  }

  const projectStage: Record<string, any> = {
    _id: 0,
    timestamp: "$_id.time",
    value: 1,
  };
  if (metric.type === AggregationType.CATEGORY) {
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
  // --- Plugin Hook: beforeReportGenerated ---
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

  // 4. Build and execute queries for historical (Mongo) data, adjusting time range based on Redis flush.
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
      // No need to check time range here, as queryMongo handles it.
      return await queryMongo(modifiedQuery, model, source.filter);
    });
  });

  const mongoResults = await Promise.all(mongoQueryPromises).then((res) =>
    res.flat()
  );

  // 5. Merge results from all sources (Mongo + Redis) into a final report.
  const finalResults = mergeAndAggregateResults(
    mongoResults,
    modifiedQuery.granularity,
    modifiedQuery.metric.type,
  );

  // --- Plugin Hook: afterReportGenerated ---
  await engine.pluginManager.executeActionHook("afterReportGenerated", {
    report: finalResults,
    query: modifiedQuery,
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
