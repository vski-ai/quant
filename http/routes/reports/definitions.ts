import { Hono } from "hono";
import * as v from "valibot";
import { describeRoute, resolver, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";
import { normalizeDoc, normalizeDocs } from "@/http/utils.ts";
import { ErrorResponse, SuccessResponse } from "@/http/schemas.ts";
import {
  ReportDefinitionSchema,
  ReportMetadataSchema,
  ReportSchema,
} from "@/http/schemas/reports.ts";
import { canAccessReport } from "@/http/auth/middleware.ts";

const definitions = new Hono<
  HonoEnv & { Variables: { apiKey: ApiKey; isMaster: boolean } }
>();

definitions.post(
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

definitions.get(
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

definitions.get(
  "/:id/meta",
  describeRoute({
    tags: ["Reports"],
    summary: "Get a Report's metadata",
    responses: {
      200: {
        description: "Report metadata",
        content: {
          "application/json": {
            schema: resolver(ReportMetadataSchema),
          },
        },
      },
      404: ErrorResponse,
    },
  }),
  canAccessReport,
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();

    const metadata = await engine.getReportMetadata(id);

    if (!metadata) {
      return c.json({ error: "Not Found" }, 404);
    }

    return c.json(metadata);
  },
);

definitions.get(
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
  canAccessReport,
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();

    const report = await engine.getReportDefinition(id);

    if (!report) {
      return c.json({ error: "Not Found" }, 404);
    }

    return c.json(normalizeDoc(report));
  },
);

definitions.patch(
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
  canAccessReport,
  vValidator("json", v.partial(ReportSchema)),
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();
    const updates = c.req.valid("json");

    const report = await engine.updateReport(id, updates);
    return c.json(normalizeDoc(report));
  },
);

definitions.delete(
  "/:id",
  describeRoute({
    tags: ["Reports"],
    summary: "Delete a Report Definition",
    responses: {
      200: SuccessResponse,
      404: ErrorResponse,
    },
  }),
  canAccessReport,
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const authStorage = c.get("authStorage");
    const { id } = c.req.param();

    await engine.deleteReport(id);
    if (apiKey) {
      await authStorage.disassociateReport(apiKey.owner, id);
    }
    return c.json({ success: true }, 200);
  },
);

export default definitions;
