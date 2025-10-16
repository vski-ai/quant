import { Hono } from "hono";
import * as v from "valibot";
import { describeRoute, resolver, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";
import { normalizeDoc, normalizeDocs } from "@/http/utils.ts";
import { ErrorResponse, SuccessResponse } from "@/http/schemas.ts";
import { AggregationType, granularity } from "@/core/types.ts";

const reports = new Hono<
  HonoEnv & { Variables: { apiKey: ApiKey; isMaster: boolean } }
>();

const ReportDefinitionSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  active: v.boolean(),
  createdAt: v.string(), // Will be ISO strings after serialization
  updatedAt: v.string(),
});

const ReportSchema = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  active: v.optional(v.boolean(), true),
});

const ReportQuerySchema = v.object({
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

const DatasetQuerySchema = v.object({
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

const ReportDataPointSchema = v.object({
  timestamp: v.string(),
  value: v.number(),
  category: v.optional(v.string()),
});

const ReportDataSchema = v.array(ReportDataPointSchema);

reports.post(
  "/",
  describeRoute({
    tags: ["Reports"],
    summary: "Create a Report Definition",
    responses: {
      201: {
        description: "Report created successfully",
        content: {
          "application/json": {
            schema: resolver(ReportDefinitionSchema),
          },
        },
      },
    },
  }),
  vValidator("json", ReportSchema),
  vValidator("query", v.object({ owner: v.optional(v.string()) })),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const authStorage = c.get("authStorage");
    const definition = c.req.valid("json");
    const { owner: ownerQuery } = c.req.valid("query");

    const newReport = await engine.createReport(definition);

    let owner = apiKey?.owner;
    if (isMaster && ownerQuery) {
      owner = ownerQuery;
    }

    if (owner) {
      await authStorage.associateReport(owner, newReport._id.toString());
    }

    return c.json(normalizeDoc(newReport), 201);
  },
);

reports.get(
  "/",
  describeRoute({
    tags: ["Reports"],
    summary: "List all Report Definitions for the user",
    responses: {
      200: {
        description: "A list of report definitions",
        content: {
          "application/json": {
            schema: resolver(v.array(ReportDefinitionSchema)),
          },
        },
      },
      401: ErrorResponse,
    },
  }),
  vValidator("query", v.object({ owners: v.optional(v.string()) })),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const authStorage = c.get("authStorage");
    const { owners: ownersQuery } = c.req.valid("query");

    let ownedIds: string[] = [];
    if (isMaster && ownersQuery) {
      ownedIds = await authStorage.getOwnedReportIds(ownersQuery);
    } else if (isMaster) {
      const reports = await engine.listReportDefinitions();
      return c.json(normalizeDocs(reports));
    } else if (apiKey) {
      ownedIds = await authStorage.getOwnedReportIds(apiKey.owner);
    }

    const ownedReports = await engine.listReportDefinitions(ownedIds);
    return c.json(normalizeDocs(ownedReports));
  },
);

reports.post(
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
  vValidator("json", ReportQuerySchema),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const authStorage = c.get("authStorage");
    const { id } = c.req.param();
    const query = c.req.valid("json");

    if (
      !isMaster && apiKey && !await authStorage.isReportOwner(apiKey.owner, id)
    ) {
      return c.json({ error: "Not Found" }, 404);
    }

    const reportData = await engine.getReport({
      reportId: id,
      ...query as any,
      timeRange: {
        start: new Date(query.timeRange.start),
        end: new Date(query.timeRange.end),
      },
    });

    return c.json(reportData);
  },
);

reports.post(
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
  vValidator("json", DatasetQuerySchema),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const authStorage = c.get("authStorage");
    const { id } = c.req.param();
    const query = c.req.valid("json");

    if (
      !isMaster && apiKey && !await authStorage.isReportOwner(apiKey.owner, id)
    ) {
      return c.json({ error: "Not Found" }, 404);
    }

    const datasetData = await engine.getDataset({
      reportId: id,
      ...query as any,
      timeRange: {
        start: new Date(query.timeRange.start),
        end: new Date(query.timeRange.end),
      },
    });

    return c.json(datasetData);
  },
);

reports.post(
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
  vValidator("json", ReportQuerySchema),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const authStorage = c.get("authStorage");
    const { id } = c.req.param();
    const query = c.req.valid("json");

    if (
      !isMaster && apiKey && !await authStorage.isReportOwner(apiKey.owner, id)
    ) {
      return c.json({ error: "Not Found" }, 404);
    }

    const reportData = await engine.getRealtimeReport({
      reportId: id,
      ...query as any,
      timeRange: {
        start: new Date(query.timeRange.start),
        end: new Date(query.timeRange.end),
      },
    });

    return c.json(reportData);
  },
);

reports.post(
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
  vValidator("json", DatasetQuerySchema),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const authStorage = c.get("authStorage");
    const { id } = c.req.param();
    const query = c.req.valid("json");

    if (
      !isMaster && apiKey && !await authStorage.isReportOwner(apiKey.owner, id)
    ) {
      return c.json({ error: "Not Found" }, 404);
    }

    const datasetData = await engine.getRealtimeDataset({
      reportId: id,
      ...query as any,
      timeRange: {
        start: new Date(query.timeRange.start),
        end: new Date(query.timeRange.end),
      },
    });

    return c.json(datasetData);
  },
);

reports.post(
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
  vValidator("json", DatasetQuerySchema),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const authStorage = c.get("authStorage");
    const { id } = c.req.param();
    const query = c.req.valid("json");

    if (
      !isMaster && apiKey && !await authStorage.isReportOwner(apiKey.owner, id)
    ) {
      return c.json({ error: "Not Found" }, 404);
    }

    const groupsData = await engine.getRealtimeGroupsAggregation({
      reportId: id,
      ...query as any,
      timeRange: {
        start: new Date(query.timeRange.start),
        end: new Date(query.timeRange.end),
      },
    });

    return c.json(groupsData);
  },
);

reports.get(
  "/:id",
  describeRoute({
    tags: ["Reports"],
    summary: "Get a Report Definition",
    responses: {
      200: {
        description: "A single report definition",
        content: {
          "application/json": {
            schema: resolver(ReportDefinitionSchema),
          },
        },
      },
      404: ErrorResponse,
    },
  }),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const authStorage = c.get("authStorage");
    const { id } = c.req.param();

    const report = await engine.getReportDefinition(id);

    if (!report) {
      return c.json({ error: "Not Found" }, 404);
    }

    if (!isMaster && apiKey) {
      const isOwner = await authStorage.isReportOwner(apiKey.owner, id);
      if (!isOwner) {
        return c.json({ error: "Not Found" }, 404);
      }
    }

    return c.json(normalizeDoc(report));
  },
);

reports.patch(
  "/:id",
  describeRoute({
    tags: ["Reports"],
    summary: "Update a Report Definition",
    responses: {
      200: {
        description: "Report updated successfully",
        content: {
          "application/json": {
            schema: resolver(ReportDefinitionSchema),
          },
        },
      },
      404: ErrorResponse,
    },
  }),
  vValidator("json", v.partial(ReportSchema)),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const authStorage = c.get("authStorage");
    const { id } = c.req.param();
    const updates = c.req.valid("json");

    if (
      !isMaster && apiKey && !await authStorage.isReportOwner(apiKey.owner, id)
    ) {
      return c.json({ error: "Not Found" }, 404);
    }

    const report = await engine.updateReport(id, updates);
    return c.json(normalizeDoc(report));
  },
);

reports.delete(
  "/:id",
  describeRoute({
    tags: ["Reports"],
    summary: "Delete a Report Definition",
    responses: {
      200: SuccessResponse,
      404: ErrorResponse,
    },
  }),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const authStorage = c.get("authStorage");
    const { id } = c.req.param();

    if (
      !isMaster && apiKey && !await authStorage.isReportOwner(apiKey.owner, id)
    ) {
      return c.json({ error: "Not Found" }, 404);
    }

    await engine.deleteReport(id);
    if (apiKey) {
      await authStorage.disassociateReport(apiKey.owner, id);
    }
    return c.json({ success: true }, 200);
  },
);

export default reports;
