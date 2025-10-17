import * as v from "valibot";
import { AggregationType, granularity } from "@/core/types.ts";

export const AggregationDefinitionSchema = v.object({
  type: v.enum(AggregationType),
  payloadField: v.optional(v.string()),
  categoryField: v.optional(v.string()),
});

export const FullAggregationSourceSchema = v.object({
  id: v.string(),
  reportId: v.string(),
  targetCollection: v.string(),
  granularity: v.picklist(granularity),
  aggregations: v.optional(v.array(AggregationDefinitionSchema)),
  filter: v.optional(
    v.object({
      sources: v.array(v.object({ id: v.string(), name: v.string() })),
      events: v.array(v.string()),
    }),
  ),
});

export const AggregationSourceSchema = v.object({
  targetCollection: v.string(),
  granularity: v.optional(v.picklist<any>(granularity)),
  filter: v.optional(
    v.object({
      sources: v.array(v.object({ id: v.string(), name: v.string() })),
      events: v.array(v.string()),
    }),
  ),
  aggregations: v.optional(v.array(AggregationDefinitionSchema)),
});
