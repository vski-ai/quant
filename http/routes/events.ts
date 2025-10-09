import { Hono } from "hono";
import * as v from "valibot";
import { describeRoute, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";

const events = new Hono<HonoEnv>();

const RecordEventSchema = v.object({
  type: v.string(),
  uuid: v.pipe(v.string(), v.uuid()),
  payload: v.optional(v.record(v.string(), v.any())),
  attributions: v.optional(v.array(v.object({
    type: v.string(),
    value: v.string(),
  }))),
});

events.post(
  "/:source/events",
  describeRoute({
    responses: {
      200: { description: "Event recorded successfully" },
      400: { description: "Invalid request body or parameters" },
      404: { description: "Source not found" },
    },
  }),
  vValidator("json", RecordEventSchema),
  async (c) => {
    const engine = c.get("engine");
    const { source } = c.req.param();
    const { uuid, type, payload, attributions } = c.req.valid<any>("json");

    const eventSource = await engine.getEventSource(source);
    if (!eventSource) {
      return c.json({ error: "Source not found" }, 404);
    }

    const recordedEvent = await eventSource.record(
      uuid,
      type,
      payload ?? {},
      attributions,
    );
    return c.json(recordedEvent);
  },
);

export default events;
