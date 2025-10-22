import type { extendSchema } from "@/http/schemas/schema_hook.ts";
import type { IHttpPlugin } from "../http/types.ts";
import { FlatGroupsQuerySchema } from "@/http/schemas/flat_groups.ts";
import {
  DatasetQuerySchema,
  ReportQuerySchema,
} from "@/http/schemas/reports.ts";
import { any, array, number, object, optional, record, string } from "valibot";

export class HTTPFilterPlugin implements IHttpPlugin {
  constructor(
    public name: string = "Filters Plugin",
    public version: string = "0.0.1",
  ) {}

  schema(extend: typeof extendSchema) {
    const Extension = object({
      limit: optional(number()),
      offset: optional(number()),
      filter: optional(record(
        string(),
        array(object({
          operator: string(),
          value: any(),
          OR: optional(any()),
        })),
      )),
    });

    extend(FlatGroupsQuerySchema, Extension);
    extend(ReportQuerySchema, Extension);
    extend(DatasetQuerySchema, Extension);
  }

  async register() {}
}
