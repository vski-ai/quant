import { Hono } from "hono";
import * as v from "valibot";
import { describeRoute, resolver, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";
import { normalizeDocs } from "@/http/utils.ts";
import { ErrorResponse } from "@/http/schemas.ts";
import { canAccessEventSource } from "@/http/auth/middleware.ts";

const events = new Hono<
  HonoEnv & { Variables: { apiKey: ApiKey; isMaster: boolean } }
>();

events.get(
  "/:id/events",
  describeRoute({
    tags: ["Event Sources"],
    summary: "Get recent events for an Event Source",
    responses: {
      200: {
        description: "A list of recent events",
        content: {
          "application/json": {
            schema: resolver(v.array(v.any())),
          },
        },
      },
      401: ErrorResponse,
      404: ErrorResponse,
    },
  }),
  canAccessEventSource,
  vValidator("query", v.object({ limit: v.optional(v.string()) })),
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();
    const { limit } = c.req.valid("query");

    const recentEvents = await engine.getRecentEvents(
      id,
      limit ? parseInt(limit, 10) : undefined,
    );

    return c.json(normalizeDocs(recentEvents));
  },
);

export default events;
