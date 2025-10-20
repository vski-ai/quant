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

export interface IFlatGroupsAggregationQuery extends IDatasetQuery {
  groupBy: string[];
  fields?: string[];
  groupByGranularity?: Granularity[];
}

async function getLeafAggregatesForQuery(
  query: IFlatGroupsAggregationQuery,
  engine: Engine,
  aggregationSources: IAggregationSource[],
): Promise<any[]> {
  const sources = aggregationSources.filter(
    (s) => s.granularity === query.granularity,
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
      return queryMongoForFlatGroups(query, model, source.filter!);
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
    const leafAggregates = (await Promise.all(
      query.groupByGranularity.map(async (granularity) => {
        const newQuery = { ...query, granularity };
        const aggregates = await getLeafAggregatesForQuery(
          newQuery,
          engine,
          aggregationSources,
        );
        return aggregates.map((agg) => ({
          ...agg,
          group: { ...agg.group, granularity },
        }));
      }),
    )).flat();

    const groupBy = ["granularity", ...query.groupBy];
    return buildHierarchy(leafAggregates, groupBy, query.metrics![0]);
  }

  const leafAggregates = await getLeafAggregatesForQuery(
    query,
    engine,
    aggregationSources,
  );

  if (!query.metrics || query.metrics.length === 0) {
    return [];
  }

  return buildHierarchy(leafAggregates, query.groupBy, query.metrics[0]);
}

async function queryMongoForFlatGroups(
  query: IFlatGroupsAggregationQuery,
  model: Model<any>,
  filter: IAggregationSourceFilter,
): Promise<any[]> {
  const { metrics = [], timeRange, attribution, granularity } = query;
  const metric = metrics.filter((m) => !m.endsWith("_count"))[0];

  const matchStage: Record<string, any> = {
    timestamp: { $gte: timeRange.start, $lte: timeRange.end },
    aggregationType: AggregationType.LEAF_SUM,
    payloadField: metric,
    granularity: granularity,
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
        timestamp: "$timestamp",
      },
    },
  ];

  return model.aggregate(pipeline).exec();
}

function buildHierarchy(
  leafAggregates: any[],
  groupBy: string[],
  metric: string,
): any[] {
  const tree = new Map();

  for (const leaf of leafAggregates) {
    if (!leaf.group) continue;

    let currentChildren = tree;
    let parentNode = null;

    for (let i = 0; i < groupBy.length; i++) {
      const groupField = groupBy[i];
      const groupValue = leaf.group[groupField];
      if (groupValue === undefined) continue;

      let currentNode = currentChildren.get(groupValue);
      if (!currentNode) {
        currentNode = {
          children: new Map(),
          value: 0,
          timestamp: new Date(0),
          groupField: groupField,
          groupValue: groupValue,
          level: i,
          parent: parentNode,
          groupPath: {
            ...(parentNode?.groupPath || {}),
            [groupField]: groupValue,
          },
        };
        currentChildren.set(groupValue, currentNode);
      }
      currentNode.value += leaf.value;
      if (leaf.timestamp > currentNode.timestamp) {
        currentNode.timestamp = leaf.timestamp;
      }
      parentNode = currentNode;
      currentChildren = currentNode.children;
    }
  }

  const flatList: any[] = [];
  function flatten(nodes: Map<any, any>, parentIds: string[]) {
    for (const [, node] of nodes.entries()) {
      const id = crypto.randomUUID();
      const output: any = {
        id,
        $parent_id: parentIds.length > 0 ? parentIds : null,
        $group_by: node.groupField,
        $group_level: node.level,
        [metric]: node.value,
        timestamp: node.timestamp,
        $is_group_root: node.children.size > 0,
      };
      for (const field of groupBy) {
        output[field] = node.groupPath[field] ?? null;
      }

      flatList.push(output);
      flatten(node.children, [...parentIds, id]);
    }
  }

  flatten(tree, []);
  return flatList;
}
