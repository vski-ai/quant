import { Hono } from "hono";
import * as v from "valibot";
import { describeRoute, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";
import { AggregationType, granularity } from "@/core/types.ts";

const aggregationSources = new Hono<
  HonoEnv & { Variables: { apiKey: ApiKey } }
>();

const AggregationSourceSchema = v.object({
  targetCollection: v.string(),
  granularity: v.optional(v.picklist<any>(granularity)),
  filter: v.optional(
    v.object({
      sources: v.array(v.object({ id: v.string(), name: v.string() })),
      events: v.array(v.string()),
    }),
  ),
  aggregations: v.array(v.object({
    type: v.enum(AggregationType),
    payloadField: v.optional(v.string()),
    categoryField: v.optional(v.string()),
  })),
});

aggregationSources.post(
  "/",
  describeRoute({
    tags: ["Aggregation Sources"],
    summary: "Add an Aggregation Source to a Report",
  }),
  vValidator("query", v.object({ reportId: v.string() })),
  vValidator("json", AggregationSourceSchema),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const authStorage = c.get("authStorage");
    const { reportId } = c.req.valid("query");
    const sourceData = c.req.valid("json");

    if (!await authStorage.isReportOwner(apiKey.owner, reportId)) {
      return c.json({ error: "Report not found" }, 404);
    }

    const newSource = await engine.addAggregationSource(reportId, sourceData);
    return c.json(newSource, 201);
  },
);

aggregationSources.get(
  "/",
  describeRoute({
    tags: ["Aggregation Sources"],
    summary: "List Aggregation Sources for a Report",
  }),
  vValidator("query", v.object({ reportId: v.string() })),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const authStorage = c.get("authStorage");
    const { reportId } = c.req.valid("query");

    if (!await authStorage.isReportOwner(apiKey.owner, reportId)) {
      return c.json({ error: "Report not found" }, 404);
    }

    const sources = await engine.listAggregationSources(reportId);
    return c.json(sources);
  },
);

aggregationSources.delete(
  "/:sourceId",
  describeRoute({
    tags: ["Aggregation Sources"],
    summary: "Remove an Aggregation Source from a Report",
  }),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const authStorage = c.get("authStorage");
    const { sourceId } = c.req.param();

    // This is a bit tricky. We need to find which report this source belongs to, to check ownership.
    const aggSource = await engine.AggregationSourceModel.findById(sourceId)
      .lean();
    if (!aggSource) {
      return c.json({ error: "Aggregation Source not found" }, 404);
    }

    if (
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
