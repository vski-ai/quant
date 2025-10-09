import { Hono } from "hono";
import { HonoEnv } from "../types.ts";
import events from "./events.ts";

const app = new Hono<HonoEnv>();

// Mount resource-specific routers
app.route("/events", events);
// Future routes like 'reports' or 'management' can be mounted here

export const api = app;
