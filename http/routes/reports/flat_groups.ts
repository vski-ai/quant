import { Hono } from "hono";
import { describeRoute, resolver, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";
import { ErrorResponse } from "@/http/schemas.ts";
import { canAccessReport } from "@/http/auth/middleware.ts";
import { FlatGroupsQuerySchema } from "@/http/schemas/flat_groups.ts";
import { useSchema } from "@/http/schemas/schema_hook.ts";
import * as v from "valibot";

const flatGroups = new Hono<
  HonoEnv & { Variables: { apiKey: ApiKey; isMaster: boolean } }
>();

flatGroups.post(
  "/:id/flat-groups",
  describeRoute({
    tags: ["Reports"],
    summary: "Query a Report's flat groups",
    responses: {
      200: {
        description: "Flat groups data",
        content: {
          "application/json": {
            schema: resolver(v.array(v.record(v.string(), v.any()))),
          },
        },
      },
      404: ErrorResponse,
    },
  }),
  canAccessReport,
  useSchema(FlatGroupsQuerySchema, (schema) => vValidator("json", schema)),
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();
    const query = c.req.valid("json");

    const flatGroupsData = await engine.getFlatGroupsAggregation({
      reportId: id,
      ...(query as any),
      timeRange: {
        start: new Date(query.timeRange.start),
        end: new Date(query.timeRange.end),
      },
    });

    return c.json(flatGroupsData);
  },
);

flatGroups.post(
  "/:id/realtime/flat-groups",
  describeRoute({
    tags: ["Reports"],
    summary: "Query a Report's flat groups in realtime",
    responses: {
      200: {
        description: "Flat groups data",
        content: {
          "application/json": {
            schema: resolver(v.array(v.record(v.string(), v.any()))),
          },
        },
      },
      404: ErrorResponse,
    },
  }),
  canAccessReport,
  vValidator("json", FlatGroupsQuerySchema),
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();
    const query = c.req.valid("json");

    const flatGroupsData = await engine.getRealtimeFlatGroupsAggregation({
      reportId: id,
      ...(query as any),
      timeRange: {
        start: new Date(query.timeRange.start),
        end: new Date(query.timeRange.end),
      },
    });

    return c.json(flatGroupsData);
  },
);

export default flatGroups;
