import { Hono } from "hono";
import * as v from "valibot";
import { describeRoute, validator as vValidator } from "hono-openapi";
import { HonoEnv } from "@/http/types.ts";
import { ApiKey } from "@/http/auth/types.ts";

const eventSources = new Hono<HonoEnv & { Variables: { apiKey: ApiKey } }>();

const EventTypeSchema = v.object({
  name: v.string(),
  description: v.optional(v.string()),
});

const CreateEventSourceSchema = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  eventTypes: v.optional(v.array(EventTypeSchema)),
});

eventSources.post(
  "/",
  describeRoute({ tags: ["Event Sources"], summary: "Create an Event Source" }),
  vValidator("json", CreateEventSourceSchema),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const authStorage = c.get("authStorage");
    const definition = c.req.valid("json");

    const newSource = await engine.createEventSource(definition);
    await authStorage.associateEventSource(
      apiKey.owner,
      newSource.getDefinition().id!,
    );
    return c.json(newSource.getDefinition(), 201);
  },
);

eventSources.get(
  "/",
  describeRoute({
    tags: ["Event Sources"],
    summary: "List all Event Sources for the user",
  }),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const authStorage = c.get("authStorage");

    const ownedIds = await authStorage.getOwnedEventSourceIds(apiKey.owner);
    const allSources = await engine.listEventSources();
    return c.json(allSources.filter((s) => ownedIds.includes(s.id)));
  },
);

eventSources.get(
  "/:name",
  describeRoute({
    tags: ["Event Sources"],
    summary: "Get an Event Source by name",
  }),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const authStorage = c.get("authStorage");
    const { name } = c.req.param();
    const source = await engine.getEventSource(name);

    if (
      !source ||
      !await authStorage.isEventSourceOwner(
        apiKey.owner,
        source.getDefinition().id!,
      )
    ) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(source.getDefinition());
  },
);

eventSources.get(
  "/:name/event-types",
  describeRoute({
    tags: ["Event Sources"],
    summary: "List Event Types for a Source",
  }),
  async (c) => {
    const engine = c.get("engine");
    const apiKey = c.get("apiKey");
    const authStorage = c.get("authStorage");
    const { name } = c.req.param();
    const source = await engine.getEventSource(name);

    if (
      !source ||
      !await authStorage.isEventSourceOwner(
        apiKey.owner,
        source.getDefinition().id!,
      )
    ) {
      return c.json({ error: "Not Found" }, 404);
    }
    const types = await engine.listEventTypesForSource(name);
    return c.json(types);
  },
);

export default eventSources;
