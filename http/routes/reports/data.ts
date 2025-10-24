import { Hono } from "hono";
import * as v from "valibot";
import { describeRoute, resolver, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";
import { ErrorResponse } from "@/http/schemas.ts";
import {
  DatasetQuerySchema,
  ReportDataSchema,
  ReportQuerySchema,
} from "@/http/schemas/reports.ts";
import { canAccessReport } from "@/http/auth/middleware.ts";
import { useSchema } from "@/http/schemas/schema_hook.ts";

const data = new Hono<
  HonoEnv & { Variables: { apiKey: ApiKey; isMaster: boolean } }
>();

data.post(
  "/:id/data",
  describeRoute({
    tags: ["Reports"],
    summary: "Query a Report's data",
    responses: {
      200: {
        description: "Report data",
        content: {
          "application/json": {
            schema: resolver(ReportDataSchema),
          },
        },
      },
      404: ErrorResponse,
    },
  }),
  canAccessReport,
  useSchema(ReportQuerySchema, (Schema) => vValidator("json", Schema)),
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();
    const query = c.req.valid("json");

    const reportData = await engine.getReport({
      reportId: id,
      ...(query as any),
      timeRange: {
        start: new Date(query.timeRange.start),
        end: new Date(query.timeRange.end),
      },
    });

    return c.json(reportData);
  },
);

data.post(
  "/:id/dataset",
  describeRoute({
    tags: ["Reports"],
    summary: "Query a Report's dataset",
    responses: {
      200: {
        description: "Dataset data",
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
  useSchema(DatasetQuerySchema, (Schema) => vValidator("json", Schema)),
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();
    const query = c.req.valid("json");

    const datasetData = await engine.getDataset({
      reportId: id,
      ...(query as any),
      timeRange: {
        start: new Date(query.timeRange.start),
        end: new Date(query.timeRange.end),
      },
    });

    return c.json(datasetData);
  },
);

data.post(
  "/:id/realtime/data",
  describeRoute({
    tags: ["Reports"],
    summary: "Query a Report's data in realtime",
    responses: {
      200: {
        description: "Report data",
        content: {
          "application/json": {
            schema: resolver(ReportDataSchema),
          },
        },
      },
      404: ErrorResponse,
    },
  }),
  canAccessReport,
  useSchema(ReportQuerySchema, (schema) => vValidator("json", schema)),
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();
    const query = c.req.valid("json");

    const reportData = await engine.getRealtimeReport({
      reportId: id,
      ...(query as any),
      timeRange: {
        start: new Date(query.timeRange.start),
        end: new Date(query.timeRange.end),
      },
    });

    return c.json(reportData);
  },
);

data.post(
  "/:id/realtime/dataset",
  describeRoute({
    tags: ["Reports"],
    summary: "Query a Report's dataset in realtime",
    responses: {
      200: {
        description: "Dataset data",
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
  useSchema(DatasetQuerySchema, (schema) => vValidator("json", schema)),
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();
    const query = c.req.valid("json");

    const datasetData = await engine.getRealtimeDataset({
      reportId: id,
      ...(query as any),
      timeRange: {
        start: new Date(query.timeRange.start),
        end: new Date(query.timeRange.end),
      },
    });

    return c.json(datasetData);
  },
);

data.post(
  "/:id/realtime/groups",
  describeRoute({
    tags: ["Reports"],
    summary: "Query a Report's groups in realtime",
    responses: {
      200: {
        description: "Groups data",
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
  vValidator("json", DatasetQuerySchema),
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();
    const query = c.req.valid("json");

    const groupsData = await engine.getRealtimeGroupsAggregation({
      reportId: id,
      ...(query as any),
      timeRange: {
        start: new Date(query.timeRange.start),
        end: new Date(query.timeRange.end),
      },
    });

    return c.json(groupsData);
  },
);

export default data;
