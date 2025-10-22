import type { extendSchema } from "@/http/schemas/schema_hook.ts";
import type { IHttpPlugin } from "../http/types.ts";
import { FlatGroupsQuerySchema } from "@/http/schemas/flat_groups.ts";
import {
  DatasetQuerySchema,
  ReportQuerySchema,
} from "@/http/schemas/reports.ts";
import { object, optional, record, string } from "valibot";

export class HTTPFormulaPlugin implements IHttpPlugin {
  constructor(
    public name: string = "Formula Plugin",
    public version: string = "0.0.1",
  ) {}

  async schema(extend: typeof extendSchema) {
    const Extension = object({
      compute: optional(record(string(), string())),
    });

    extend(FlatGroupsQuerySchema, Extension);
    extend(ReportQuerySchema, Extension);
    extend(DatasetQuerySchema, Extension);
  }
  async register() {}
}
