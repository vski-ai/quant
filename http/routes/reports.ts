import { Hono } from "hono";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";
import definitions from "@/http/routes/reports/definitions.ts";
import data from "@/http/routes/reports/data.ts";
import flatGroups from "@/http/routes/reports/flat_groups.ts";

const reports = new Hono<
  HonoEnv & { Variables: { apiKey: ApiKey; isMaster: boolean } }
>();

reports.route("/", definitions);
reports.route("/", data);
reports.route("/", flatGroups);

export default reports;
