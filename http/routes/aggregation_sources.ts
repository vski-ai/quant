import { Hono } from "hono";
import * as v from "valibot";
import { describeRoute, resolver, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";
import { normalizeDoc, normalizeDocs } from "@/http/utils.ts";
import { ErrorResponse, SuccessResponse } from "@/http/schemas.ts";
import {
  AggregationSourceSchema,
  FullAggregationSourceSchema,
} from "@/http/schemas/aggregation_sources.ts";
import { canAccessReportFromQuery } from "@/http/auth/middleware.ts";

const aggregationSources = new Hono<
  HonoEnv & { Variables: { apiKey: ApiKey; isMaster: boolean } }
>();

aggregationSources.post(
  "/",
  describeRoute({
    tags: ["Aggregation Sources"],
    summary: "Add an Aggregation Source to a Report",
    responses: {
      201: {
        description: "Aggregation source created successfully",
        content: {
          "application/json": {
            schema: resolver(FullAggregationSourceSchema),
          },
        },
      },
      401: ErrorResponse,
      404: ErrorResponse,
    },
  }),
  vValidator("query", v.object({ reportId: v.string() })),
  vValidator("json", AggregationSourceSchema),
  canAccessReportFromQuery,
  async (c) => {
    const engine = c.get("engine");
    const { reportId } = c.req.valid("query");
    const sourceData = c.req.valid("json");

    const newSource = await engine.addAggregationSource(reportId, sourceData);
    return c.json(normalizeDoc(newSource), 201);
  },
);

aggregationSources.get(
  "/",
  describeRoute({
    tags: ["Aggregation Sources"],
    summary: "List Aggregation Sources for a Report",
    responses: {
      200: {
        description: "A list of aggregation sources for the report",
        content: {
          "application/json": {
            schema: resolver(v.array(FullAggregationSourceSchema)),
          },
        },
      },
      401: ErrorResponse,
      404: ErrorResponse,
    },
  }),
  vValidator("query", v.object({ reportId: v.string() })),
  canAccessReportFromQuery,
  async (c) => {
    const engine = c.get("engine");
    const { reportId } = c.req.valid("query");

    const sources = await engine.listAggregationSources(reportId);
    return c.json(normalizeDocs(sources));
  },
);

aggregationSources.delete(
  "/:sourceId",
  describeRoute({
    tags: ["Aggregation Sources"],
    summary: "Remove an Aggregation Source from a Report",
    responses: {
      200: SuccessResponse,
      401: ErrorResponse,
      403: ErrorResponse,
      404: ErrorResponse,
    },
  }),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const authStorage = c.get("authStorage");
    const { sourceId } = c.req.param();

    // This is a bit tricky. We need to find which report this source belongs to, to check ownership.
    const aggSource = await engine.AggregationSourceModel.findById(sourceId)
      .lean();
    if (!aggSource) {
      return c.json({ error: "Aggregation Source not found" }, 404);
    }

    if (
      !isMaster &&
      !await authStorage.isReportOwner(
        apiKey.owner,
        aggSource.reportId.toString(),
      )
    ) {
      return c.json({ error: "Unauthorized to delete this source" }, 403);
    }

    await engine.removeAggregationSource(sourceId);
    return c.json({ success: true }, 200);
  },
);

export default aggregationSources;
