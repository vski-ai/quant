import { Hono } from "hono";
import { HonoEnv } from "../types.ts";
import events from "./events.ts";
import reports from "./reports.ts";
import eventSources from "./event_sources.ts";
import aggregationSources from "./aggregation_sources.ts";

const app = new Hono<HonoEnv>();

// Mount resource-specific routers
app.route("/events", events);
app.route("/event-source", eventSources);
app.route("/aggregation-source", aggregationSources);
app.route("/report", reports);

export const api = app;
