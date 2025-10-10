import { Hono } from "hono";
import * as v from "valibot";
import { describeRoute, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";

const reports = new Hono<HonoEnv & { Variables: { apiKey: ApiKey } }>();

const ReportSchema = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  active: v.optional(v.boolean(), true),
});

reports.post(
  "/",
  describeRoute({ tags: ["Reports"], summary: "Create a Report Definition" }),
  vValidator("json", ReportSchema),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const authStorage = c.get("authStorage");
    const definition = c.req.valid("json");

    const newReport = await engine.createReport(definition);
    await authStorage.associateReport(apiKey.owner, newReport.id);
    return c.json(newReport, 201);
  },
);

reports.get(
  "/",
  describeRoute({
    tags: ["Reports"],
    summary: "List all Report Definitions for the user",
  }),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const authStorage = c.get("authStorage");

    const ownedIds = await authStorage.getOwnedReportIds(apiKey.owner);
    const allReports = await engine.listReportDefinitions();
    return c.json(allReports.filter((r) => ownedIds.includes(r.id)));
  },
);

reports.get(
  "/:id",
  describeRoute({ tags: ["Reports"], summary: "Get a Report Definition" }),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const authStorage = c.get("authStorage");
    const { id } = c.req.param();

    if (!await authStorage.isReportOwner(apiKey.owner, id)) {
      return c.json({ error: "Not Found" }, 404);
    }
    const report = await engine.getReportDefinition(id);
    return report ? c.json(report) : c.json({ error: "Not Found" }, 404);
  },
);

reports.patch(
  "/:id",
  describeRoute({ tags: ["Reports"], summary: "Update a Report Definition" }),
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
    return c.json(report);
  },
);

reports.delete(
  "/:id",
  describeRoute({ tags: ["Reports"], summary: "Delete a Report Definition" }),
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
