import { Hono } from "hono";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";
import definitions from "@/http/routes/event_sources/definitions.ts";
import events from "@/http/routes/event_sources/events.ts";

const eventSources = new Hono<
  HonoEnv & { Variables: { apiKey: ApiKey; isMaster: boolean } }
>();

eventSources.route("/", definitions);
eventSources.route("/", events);

export default eventSources;
