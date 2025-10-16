import { Model } from "mongoose";
import { getReportModel } from "./Report.ts";
import { AggregationType, IDatasetQuery } from "../types.ts";
import { getPartitionedCollectionNames } from "./Partition.ts";
import { Engine } from "../engine.ts";
import { TOTAL_ATTRIBUTION } from "../constants.ts";
import { createAggregateModel } from "./Aggregation.ts";
import { IAggregationSourceFilter } from "./Aggregation.ts";

export interface IGroupsAggregationQuery extends IDatasetQuery {
  groupBy: string[];
  fields?: string[];
}

export async function getGroupsAggregation(
  query: IGroupsAggregationQuery,
  engine: Engine,
): Promise<any[]> {
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
      return queryMongoForGroups(query, model, source.filter!);
    });
  });

  const mongoResults = await Promise.all(mongoQueryPromises).then((res) =>
    res.flat()
  );

  return mongoResults;
}

export async function queryMongoForGroups(
  query: IGroupsAggregationQuery,
  model: Model<any>,
  filter: IAggregationSourceFilter,
): Promise<any[]> {
  const { metrics = [], attribution, timeRange, granularity, groupBy } = query;

  const sumMetrics = metrics.filter((m) => !m.endsWith("_count"));
  const countMetrics = metrics.filter((m) => m.endsWith("_count"));

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

  if (attribution) {
    matchStage.attributionType = attribution.type;
    matchStage.attributionValue = attribution.value;
  } else {
    matchStage.attributionType = TOTAL_ATTRIBUTION;
    matchStage.attributionValue = TOTAL_ATTRIBUTION;
  }

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

  const facet: any = {};

  if (sumMetrics.length > 0) {
    facet.sumMetrics = [
      {
        $match: {
          ...matchStage,
          aggregationType: AggregationType.SUM,
          payloadField: { $in: sumMetrics },
        },
      },
      {
        $group: {
          _id: {
            time: timeGroupExpression,
            metric: "$payloadField",
          },
          value: { $sum: "$value" },
        },
      },
      {
        $project: {
          _id: 0,
          timestamp: "$_id.time",
          metric: "$_id.metric",
          value: 1,
        },
      },
    ];

    facet.sumGroups = [
      {
        $match: {
          ...matchStage,
          aggregationType: AggregationType.COMPOUND_SUM,
          compoundCategoryKey: { $in: groupBy },
          payloadField: { $in: sumMetrics },
        },
      },
      {
        $group: {
          _id: {
            time: timeGroupExpression,
            categoryKey: "$compoundCategoryKey",
            categoryValue: "$payloadCategory",
            metric: "$payloadField",
          },
          value: { $sum: "$value" },
        },
      },
      {
        $project: {
          _id: 0,
          timestamp: "$_id.time",
          category: "$_id.categoryKey",
          name: "$_id.categoryValue",
          metric: "$_id.metric",
          value: 1,
        },
      },
    ];
  }

  if (countMetrics.length > 0) {
    facet.countMetrics = [
      {
        $match: {
          ...matchStage,
          aggregationType: AggregationType.COUNT,
          eventType: { $in: countMetrics.map((m) => m.replace("_count", "")) },
        },
      },
      {
        $group: {
          _id: {
            time: timeGroupExpression,
            metric: "$eventType",
          },
          value: { $sum: "$value" },
        },
      },
      {
        $project: {
          _id: 0,
          timestamp: "$_id.time",
          metric: "$_id.metric",
          value: 1,
        },
      },
    ];

    facet.categoryGroups = [
      {
        $match: {
          ...matchStage,
          aggregationType: AggregationType.CATEGORY,
          payloadField: { $in: groupBy },
        },
      },
      {
        $group: {
          _id: {
            time: timeGroupExpression,
            categoryKey: "$payloadField",
            categoryValue: "$payloadCategory",
          },
          value: { $sum: "$value" },
        },
      },
      {
        $project: {
          _id: 0,
          timestamp: "$_id.time",
          category: "$_id.categoryKey",
          name: "$_id.categoryValue",
          value: 1,
        },
      },
    ];
  }

  const pipeline: any[] = [
    { $facet: facet },
  ];

  const results = await model.aggregate(pipeline).exec();

  const mergedResults: any = {};

  if (results[0].sumMetrics) {
    for (const result of results[0].sumMetrics) {
      const timestamp = result.timestamp.toISOString();
      if (!mergedResults[timestamp]) {
        mergedResults[timestamp] = { timestamp: result.timestamp };
      }
      mergedResults[timestamp][`${result.metric}_sum`] = result.value;
    }
  }

  if (results[0].sumGroups) {
    for (const result of results[0].sumGroups) {
      const timestamp = result.timestamp.toISOString();
      if (!mergedResults[timestamp]) {
        mergedResults[timestamp] = { timestamp: result.timestamp };
      }

      const groupField = `group_by_${result.category}`;
      if (!mergedResults[timestamp][groupField]) {
        mergedResults[timestamp][groupField] = [];
      }

      let group = mergedResults[timestamp][groupField].find((g: any) =>
        g.name === result.name
      );
      if (!group) {
        group = { name: result.name };
        mergedResults[timestamp][groupField].push(group);
      }
      group[`${result.metric}_sum`] = result.value;
    }
  }

  if (results[0].countMetrics) {
    for (const result of results[0].countMetrics) {
      const timestamp = result.timestamp.toISOString();
      if (!mergedResults[timestamp]) {
        mergedResults[timestamp] = { timestamp: result.timestamp };
      }
      mergedResults[timestamp][`${result.metric}_count`] = result.value;
    }
  }

  if (results[0].categoryGroups) {
    for (const result of results[0].categoryGroups) {
      const timestamp = result.timestamp.toISOString();
      if (!mergedResults[timestamp]) {
        mergedResults[timestamp] = { timestamp: result.timestamp };
      }

      const groupField = `group_by_${result.category}`;
      if (!mergedResults[timestamp][groupField]) {
        mergedResults[timestamp][groupField] = [];
      }

      let group = mergedResults[timestamp][groupField].find((g: any) =>
        g.name === result.name
      );
      if (!group) {
        group = { name: result.name };
        mergedResults[timestamp][groupField].push(group);
      }
      group[`test_event_count`] = result.value;
    }
  }

  return Object.values(mergedResults);
}
