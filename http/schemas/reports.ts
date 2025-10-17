import * as v from "valibot";
import { AggregationType, granularity } from "@/core/types.ts";

export const ReportDefinitionSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  active: v.boolean(),
  createdAt: v.string(), // Will be ISO strings after serialization
  updatedAt: v.string(),
});

export const ReportMetadataSchema = v.object({
  metrics: v.array(v.string()),
  groupableFields: v.array(v.string()),
  eventSources: v.array(v.string()),
  eventTypes: v.array(v.string()),
});

export const ReportSchema = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  active: v.optional(v.boolean(), true),
});

export const ReportQuerySchema = v.object({
  metric: v.object({
    type: v.enum(AggregationType),
    field: v.optional(v.string()),
  }),
  timeRange: v.object({
    start: v.string(),
    end: v.string(),
  }),
  granularity: v.picklist(granularity),
  attribution: v.optional(v.object({
    type: v.string(),
    value: v.string(),
  })),
  groupBy: v.optional(v.array(v.string())),
});

export const DatasetQuerySchema = v.object({
  metrics: v.array(v.string()),
  timeRange: v.object({
    start: v.string(),
    end: v.string(),
  }),
  granularity: v.picklist(granularity),
  attribution: v.optional(v.object({
    type: v.string(),
    value: v.string(),
  })),
  groupBy: v.optional(v.array(v.string())),
});

export const ReportDataPointSchema = v.object({
  timestamp: v.string(),
  value: v.number(),
  category: v.optional(v.string()),
});

export const ReportDataSchema = v.array(ReportDataPointSchema);
