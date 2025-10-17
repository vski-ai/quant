import { Hono } from "hono";
import * as v from "valibot";
import { describeRoute, resolver, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";
import { normalizeDoc, normalizeDocs } from "@/http/utils.ts";
import { ErrorResponse, SuccessResponse } from "@/http/schemas.ts";
import {
  CreateEventSourceSchema,
  EventSourceDefinitionSchema,
  UpdateEventSourceSchema,
} from "@/http/schemas/event_sources.ts";
import { canAccessEventSource } from "@/http/auth/middleware.ts";

const definitions = new Hono<
  HonoEnv & { Variables: { apiKey: ApiKey; isMaster: boolean } }
>();

definitions.post(
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

    const owners = [
      ...new Set([...(definition.owners || []), apiKey?.owner]),
    ].filter(Boolean);

    const newSource = await engine.createEventSource({ ...definition, owners });

    return c.json(newSource.getDefinition(), 201);
  },
);

definitions.get(
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

definitions.get(
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
  canAccessEventSource,
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();
    const source = await engine.getEventSourceDefinitionById(id);
    return c.json(normalizeDoc(source));
  },
);

definitions.patch(
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
  canAccessEventSource,
  vValidator("json", UpdateEventSourceSchema),
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();
    const updates = c.req.valid("json");

    const updatedSource = await engine.updateEventSource(id, updates);

    return c.json(normalizeDoc(updatedSource));
  },
);

definitions.delete(
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
  canAccessEventSource,
  async (c) => {
    const engine = c.get("engine");
    const { id } = c.req.param();

    await engine.deleteEventSource(id);

    return c.json({ success: true });
  },
);

export default definitions;
