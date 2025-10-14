import { Hono } from "hono";
import * as v from "valibot";
import { describeRoute, resolver, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";
import { normalizeDoc, normalizeDocs } from "@/http/utils.ts";
import { ErrorResponse, SuccessResponse } from "@/http/schemas.ts";

const eventSources = new Hono<
  HonoEnv & { Variables: { apiKey: ApiKey; isMaster: boolean } }
>();

const EventTypeSchema = v.object({
  name: v.string(),
  description: v.optional(v.string()),
});

const RetentionPolicySchema = v.object({
  hotDays: v.number(),
  offloaderPlugin: v.optional(v.string()),
});

const EventSourceDefinitionSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  owners: v.optional(v.array(v.string())),
  eventTypes: v.optional(v.array(EventTypeSchema)),
  retention: v.optional(RetentionPolicySchema),
});

const CreateEventSourceSchema = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  owners: v.optional(v.array(v.string())),
  eventTypes: v.optional(v.array(EventTypeSchema)),
});

const UpdateEventSourceSchema = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  owners: v.optional(v.array(v.string())),
});

eventSources.post(
  "/",
  describeRoute({
    tags: ["Event Sources"],
    summary: "Create an Event Source",
    responses: {
      201: {
        description: "Event source created successfully",
        content: {
          "application/json": {
            schema: resolver(EventSourceDefinitionSchema),
          },
        },
      },
    },
  }),
  vValidator("json", CreateEventSourceSchema),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const definition = c.req.valid("json");

    const owners = [...new Set([...(definition.owners || []), apiKey.owner])];

    const newSource = await engine.createEventSource({ ...definition, owners });

    return c.json(newSource.getDefinition(), 201);
  },
);

eventSources.get(
  "/",
  describeRoute({
    tags: ["Event Sources"],
    summary: "List all Event Sources for the user",
    responses: {
      200: {
        description: "A list of event source definitions",
        content: {
          "application/json": {
            schema: resolver(v.array(EventSourceDefinitionSchema)),
          },
        },
      },
      401: ErrorResponse,
    },
  }),
  vValidator("query", v.object({ owners: v.optional(v.string()) })),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const { owners: ownersQuery } = c.req.valid("query");

    let query: any = {};
    if (isMaster && ownersQuery) {
      query = { owners: { $in: ownersQuery.split(",") } };
    } else if (!isMaster) {
      query = { owners: apiKey.owner };
    }

    const sources = await engine.EventSourceDefinitionModel.find(query).lean();

    return c.json(normalizeDocs(sources));
  },
);

eventSources.get(
  "/:id",
  describeRoute({
    tags: ["Event Sources"],
    summary: "Get an Event Source by ID",
    responses: {
      200: {
        description: "A single event source definition",
        content: {
          "application/json": {
            schema: resolver(EventSourceDefinitionSchema),
          },
        },
      },
      401: ErrorResponse,
      404: ErrorResponse,
    },
  }),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const { id } = c.req.param();
    const source = await engine.getEventSourceDefinitionById(id);

    if (!source || (!isMaster && !source.owners?.includes(apiKey.owner))) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(normalizeDoc(source));
  },
);

eventSources.patch(
  "/:id",
  describeRoute({
    tags: ["Event Sources"],
    summary: "Update an Event Source",
    responses: {
      200: {
        description: "Event source updated successfully",
        content: {
          "application/json": {
            schema: resolver(EventSourceDefinitionSchema),
          },
        },
      },
      401: ErrorResponse,
      404: ErrorResponse,
    },
  }),
  vValidator("json", UpdateEventSourceSchema),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const { id } = c.req.param();
    const updates = c.req.valid("json");

    const source = await engine.getEventSourceDefinitionById(id);
    if (!source || (!isMaster && !source.owners?.includes(apiKey.owner))) {
      return c.json({ error: "Not Found" }, 404);
    }

    const updatedSource = await engine.updateEventSource(id, updates);

    return c.json(normalizeDoc(updatedSource));
  },
);

eventSources.delete(
  "/:id",
  describeRoute({
    tags: ["Event Sources"],
    summary: "Delete an Event Source",
    responses: {
      200: SuccessResponse,
      401: ErrorResponse,
      404: ErrorResponse,
    },
  }),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const { id } = c.req.param();

    const source = await engine.getEventSourceDefinitionById(id);
    if (!source || (!isMaster && !source.owners?.includes(apiKey.owner))) {
      return c.json({ error: "Not Found" }, 404);
    }

    await engine.deleteEventSource(id);

    return c.json({ success: true });
  },
);

eventSources.get(
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
  vValidator("query", v.object({ limit: v.optional(v.string()) })),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const isMaster = c.get("isMaster");
    const { id } = c.req.param();
    const { limit } = c.req.valid("query");

    const source = await engine.getEventSourceDefinitionById(id);
    if (!source || (!isMaster && !source.owners?.includes(apiKey.owner))) {
      return c.json({ error: "Not Found" }, 404);
    }

    const recentEvents = await engine.getRecentEvents(
      id,
      limit ? parseInt(limit, 10) : undefined,
    );

    return c.json(normalizeDocs(recentEvents));
  },
);

export default eventSources;
