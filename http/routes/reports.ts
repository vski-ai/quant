import { Hono } from "hono";
import * as v from "valibot";
import { describeRoute, resolver, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";
import { normalizeDoc, normalizeDocs } from "@/http/utils.ts";
import { ErrorResponse, SuccessResponse } from "@/http/schemas.ts";

const reports = new Hono<HonoEnv & { Variables: { apiKey: ApiKey } }>();

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
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const authStorage = c.get("authStorage");
    const definition = c.req.valid("json");
    const newReport = await engine.createReport(definition);
    await authStorage.associateReport(apiKey.owner, newReport._id.toString());
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
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const authStorage = c.get("authStorage");

    const ownedIds = await authStorage.getOwnedReportIds(apiKey.owner);
    const allReports = await engine.listReportDefinitions();
    const ownedReports = allReports.filter((r) =>
      ownedIds.includes(r._id.toString())
    );
    return c.json(normalizeDocs(ownedReports));
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
    const authStorage = c.get("authStorage");
    const { id } = c.req.param();

    if (!await authStorage.isReportOwner(apiKey.owner, id)) {
      return c.json({ error: "Not Found" }, 404);
    }
    const report = await engine.getReportDefinition(id);
    return report
      ? c.json(normalizeDoc(report))
      : c.json({ error: "Not Found" }, 404);
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
    const authStorage = c.get("authStorage");
    const { id } = c.req.param();
    const updates = c.req.valid("json");

    if (!await authStorage.isReportOwner(apiKey.owner, id)) {
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
    const authStorage = c.get("authStorage");
    const { id } = c.req.param();

    if (!await authStorage.isReportOwner(apiKey.owner, id)) {
      return c.json({ error: "Not Found" }, 404);
    }

    await engine.deleteReport(id);
    await authStorage.disassociateReport(apiKey.owner, id);
    return c.json({ success: true }, 200);
  },
);

export default reports;
