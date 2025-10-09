import { Model } from "mongoose";
import { IAggregationSourceFilter } from "./Aggregation.ts";
import { getReportModel } from "./Report.ts";
import { AggregationType, IDatasetDataPoint, IDatasetQuery } from "../types.ts";
import { getPartitionedCollectionNames } from "./Partition.ts";
import { Engine } from "../engine.ts";
import { TOTAL_ATTRIBUTION } from "../constants.ts";
import { createAggregateModel } from "./Aggregation.ts";

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

  const metricsMatch: Record<string, any> = {};
  if (metrics && metrics.length > 0) {
    metricsMatch.$or = [
      { payloadField: { $in: metrics } }, // SUM metrics for specified fields
      {
        aggregationType: {
          $in: [
            AggregationType.COUNT,
            AggregationType.COMPOUND_SUM,
          ],
        },
      },
    ];
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
        standardMetrics: [
          {
            $match: {
              aggregationType: { $ne: AggregationType.BOOLEAN },
              ...metricsMatch,
            },
          },
          {
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
          },
          {
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
          },
        ],
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
  // 1. Find the report configuration.
  const ReportModel = getReportModel(engine.connection);
  const reportConfig = await ReportModel.findById(query.reportId).lean();
  if (!reportConfig) {
    throw new Error(`Report with ID "${query.reportId}" not found.`);
  }

  // 2. Find all aggregation sources for the report.
  const aggregationSources = await engine.listAggregationSources(
    reportConfig._id.toString(),
  );
  if (!aggregationSources || aggregationSources.length === 0) {
    return [];
  }

  // 3. Query historical data from MongoDB for each source.
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
  const finalResults = mergeAndFormatDataset(
    mongoResults as any,
  );

  return finalResults;
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
): IDatasetDataPoint[] {
  if (results.length === 0) return [];

  const mergedMap = new Map<string, IDatasetDataPoint>();

  for (const point of results) {
    const isoTimestamp = point.timestamp.toISOString();

    if (mergedMap.has(isoTimestamp)) {
      const existingPoint = mergedMap.get(isoTimestamp)!;
      if (point.metricKey) {
        // Sum values if the same metric appears for the same timestamp
        existingPoint[point.metricKey] =
          ((existingPoint[point.metricKey] as number) || 0) + point.value;
      }
      if (point.boolean_groups) {
        // Concatenate boolean groups
        existingPoint.$boolean_groups = (existingPoint.$boolean_groups || [])
          .concat(point.boolean_groups);
      }
    } else {
      // Create a new entry for this timestamp
      const newPoint: IDatasetDataPoint = {
        timestamp: point.timestamp,
      };
      if (point.metricKey) newPoint[point.metricKey] = point.value;
      if (point.boolean_groups) newPoint.$boolean_groups = point.boolean_groups;
      mergedMap.set(isoTimestamp, newPoint);
    }
  }

  const finalResults = Array.from(mergedMap.values());

  // Sort the final results chronologically.
  finalResults.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return finalResults;
}
