import { Hono } from "hono";
import { HonoEnv, IHttpPlugin } from "../types.ts";
import events from "./events.ts";
import reports from "./reports.ts";
import eventSources from "./event_sources.ts";
import aggregationSources from "./aggregation_sources.ts";
import { Engine } from "@/core/mod.ts";

export async function createApiRouter(engine: Engine, plugins: IHttpPlugin[]) {
  const app = new Hono<HonoEnv>();

  // Register HTTP plugins first to ensure middleware is applied before routes
  for (const plugin of plugins) {
    await plugin.register(app as any, engine);
    console.log(`[HTTP] Registered plugin: ${plugin.name}@${plugin.version}`);
  }

  // Mount resource-specific routers
  app.route("/events", events);
  app.route("/event-sources", eventSources);
  app.route("/aggregation-sources", aggregationSources);
  app.route("/reports", reports);
  return app;
}
