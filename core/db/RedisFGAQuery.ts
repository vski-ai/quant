import { buildHierarchy } from "./FGAHierarchy.ts";
import { IFlatGroupsAggregationQuery } from "./FGAQuery.ts";

interface LeafAggregate {
  group: Record<string, string | null>;
  value: number;
  timestamp: number;
}

export function getRealtimeFlatGroupsAggregation(
  query: IFlatGroupsAggregationQuery,
  rawPoints: any[],
): any[] {
  if (!rawPoints || rawPoints.length === 0) {
    return [];
  }

  const mergedMap = new Map<string, LeafAggregate>();

  for (const point of rawPoints) {
    const parts = point.member.split(":");
    // Backward compatibility for keys that don't have leafKey
    if (parts.length === 11) {
      parts.splice(5, 0, "null");
    }
    const [
      _incrementValue,
      aggType,
      _payloadField,
      _payloadCategory,
      _compoundCategoryKey,
      leafKey,
    ] = parts;

    if (aggType === "LEAF_SUM" && leafKey !== "null") {
      const group = JSON.parse(atob(leafKey));
      const key = JSON.stringify(group);
      const existing = mergedMap.get(key);

      if (existing) {
        existing.value += point.value;
        if (point.timestamp > existing.timestamp) {
          existing.timestamp = point.timestamp;
        }
      } else {
        mergedMap.set(key, {
          group,
          value: point.value,
          timestamp: point.timestamp,
        });
      }
    }
  }

  const leafAggregates = Array.from(mergedMap.values());

  if (!query.metrics || query.metrics.length === 0) {
    return [];
  }

  return buildHierarchy(
    leafAggregates,
    query.groupBy,
    query.metrics[0],
    query.sortBy,
  );
}
