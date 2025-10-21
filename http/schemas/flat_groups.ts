import * as v from "valibot";
import { granularity } from "@/core/types.ts";

export const FlatGroupsQuerySchema = v.object({
  metrics: v.optional(v.array(v.string())),
  groupBy: v.array(v.string()),
  timeRange: v.object({
    start: v.string(),
    end: v.string(),
  }),
  granularity: v.picklist(granularity),
  sortBy: v.optional(v.string()),
  sortOrder: v.optional(v.picklist(["asc", "desc"])),
  wasm: v.optional(v.boolean()),
});
