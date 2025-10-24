import { Hono } from "hono";
import * as v from "valibot";
import { describeRoute, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";
import { EventSource } from "@/core/event_source.ts";

const events = new Hono<HonoEnv>();

const RecordEventSchema = v.object({
  type: v.string(),
  uuid: v.pipe(v.string(), v.uuid()),
  payload: v.optional(v.record(v.string(), v.any())),
  attributions: v.optional(v.array(v.object({
    type: v.string(),
    value: v.string(),
  }))),
  timestamp: v.optional(v.string()),
});

events.post(
  "/:sourceId/events",
  describeRoute({
    tags: ["Events", "Event Sources"],
    responses: {
      200: { description: "Event recorded successfully" },
      400: { description: "Invalid request body or parameters" },
      404: { description: "Source not found" },
    },
  }),
  vValidator("json", v.union([v.array(RecordEventSchema), RecordEventSchema])),
  async (c) => {
    const engine = c.get("engine");
    const { sourceId } = c.req.param();
    const sourceDef = await engine.getEventSourceDefinitionById(sourceId);
    if (!sourceDef) {
      return c.json({ error: "Source not found" }, 404);
    }

    const data = c.req.valid<any>(
      "json",
    );
    const events = Array.isArray(data) ? data : [data];

    const eventSource = new EventSource(engine, sourceDef);

    const recordedEvent = await eventSource.record(
      events.map(({ uuid, type: eventType, timestamp, payload, ...rest }) => {
        return {
          uuid,
          eventType,
          payload: payload ?? {},
          timestamp: timestamp ? new Date(timestamp) : undefined,
          ...rest,
        };
      }),
    );
    return c.json(recordedEvent);
  },
);

export default events;
