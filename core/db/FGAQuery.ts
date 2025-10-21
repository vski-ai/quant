import { Model } from "mongoose";
import { getReportModel } from "./Report.ts";
import {
  AggregationType,
  Granularity,
  IAggregationSource,
  IDatasetDataPoint,
  IDatasetQuery,
} from "../types.ts";
import { getPartitionedCollectionNames } from "./Partition.ts";
import { Engine } from "../engine.ts";
import { TOTAL_ATTRIBUTION } from "../constants.ts";
import { createAggregateModel } from "./Aggregation.ts";
import { IAggregationSourceFilter } from "./Aggregation.ts";
import { buildHierarchy } from "./FGAHierarchy.ts";

export interface IFlatGroupsAggregationQuery extends IDatasetQuery {
  groupBy: string[];
  fields?: string[];
  groupByGranularity?: Granularity[];
  sortBy?: string;
  wasm?: boolean;
}

async function getLeafAggregatesForQuery(
  query: IFlatGroupsAggregationQuery,
  engine: Engine,
  aggregationSources: IAggregationSource[],
  granularities: Granularity[],
): Promise<any[]> {
  const sources = aggregationSources.filter(
    (s) => granularities.includes(s.granularity!),
  );

  const mongoQueryPromises = sources.flatMap((source) => {
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
      return queryMongoForFlatGroups(
        query,
        model,
        source.filter!,
        granularities,
      );
    });
  });

  const leafAggregates = await Promise.all(mongoQueryPromises).then((res) =>
    res.flat()
  );
  return leafAggregates;
}

export async function getFlatGroupsAggregation(
  query: IFlatGroupsAggregationQuery,
  engine: Engine,
): Promise<IDatasetDataPoint[]> {
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

  if (query.groupByGranularity && query.groupByGranularity.length > 0) {
    const leafAggregates = await getLeafAggregatesForQuery(
      query,
      engine,
      aggregationSources,
      query.groupByGranularity,
    );

    const groupBy = ["granularity", ...query.groupBy];
    return await buildHierarchy(
      leafAggregates,
      groupBy,
      query.metrics![0],
      query.sortBy,
      query.wasm,
    );
  }

  const leafAggregates = await getLeafAggregatesForQuery(
    query,
    engine,
    aggregationSources,
    [query.granularity!] as any,
  );

  if (!query.metrics || query.metrics.length === 0) {
    return [];
  }

  return await buildHierarchy(
    leafAggregates,
    query.groupBy,
    query.metrics[0],
    query.sortBy,
    query.wasm,
  );
}

async function queryMongoForFlatGroups(
  query: IFlatGroupsAggregationQuery,
  model: Model<any>,
  filter: IAggregationSourceFilter,
  granularities: Granularity[],
): Promise<any[]> {
  const { metrics = [], timeRange, attribution } = query;
  const metric = metrics.filter((m) => !m.endsWith("_count"))[0];

  const matchStage: Record<string, any> = {
    timestamp: { $gte: timeRange.start, $lte: timeRange.end },
    aggregationType: AggregationType.LEAF_SUM,
    payloadField: metric,
    granularity: { $in: granularities },
  };

  if (filter.sources.length) {
    matchStage.sourceId = { $in: filter.sources.map((s: any) => s.id) };
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

  const pipeline: any[] = [
    { $match: matchStage },
    {
      $group: {
        _id: "$leafKey",
        value: { $sum: "$value" },
        timestamp: { $max: "$timestamp" },
      },
    },
    {
      $project: {
        _id: 0,
        group: "$_id",
        value: "$value",
        timestamp: { $toLong: "$timestamp" },
      },
    },
  ];

  return model.aggregate(pipeline).exec();
}
