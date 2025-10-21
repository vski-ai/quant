import init, { build_hierarchy } from "../rust/pkg/quant_core.js";

await init();

export function buildHierarchy(
  leafAggregates: any[],
  groupBy: string[],
  metric: string,
  sortBy?: string,
  wasm?: boolean,
): any[] {
  if (wasm) {
    return build_hierarchy(leafAggregates, groupBy, metric, sortBy) as any;
  }
  return buildHierarchyTs(leafAggregates, groupBy, metric, sortBy);
}

export function buildHierarchyTs(
  leafAggregates: any[],
  groupBy: string[],
  metric: string,
  sortBy?: string,
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
          timestamp: 0,
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
  let counter = 0;
  function flatten(nodes: Map<any, any>, parentIds: string[]) {
    let sortedNodes = Array.from(nodes.entries());

    sortedNodes = sortedNodes.sort(([, a], [, b]) => {
      const field = sortBy ?? "groupValue";
      const valA = field === "groupValue" ? a.groupValue : a.groupPath[field];
      const valB = field === "groupValue" ? b.groupValue : b.groupPath[field];

      if (typeof valA === "string" && typeof valB === "string") {
        return valA.localeCompare(valB);
      }
      if (valA < valB) return -1;
      if (valA > valB) return 1;
      return 0;
    });

    for (const [, node] of sortedNodes) {
      const id = `ji-${++counter}`;
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
