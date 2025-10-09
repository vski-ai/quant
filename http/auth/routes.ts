import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import * as v from "valibot";
import { describeRoute, validator as vValidator } from "hono-openapi";

import type { AuthStorage } from "./storage.ts";
import type { ApiKey } from "./types.ts";
import { ApiKeyNotFoundError } from "./errors.ts";
import { HonoEnv } from "@/http/types.ts";

const QuotaSchema = v.object({
  requestsPerSecond: v.pipe(v.number(), v.integer(), v.minValue(1)),
  requestsPerDay: v.pipe(v.number(), v.integer(), v.minValue(1)),
  totalRequests: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

const CreateKeySchema = v.object({
  owner: v.pipe(v.string(), v.minLength(1)),
  quotas: QuotaSchema,
});

const UpdateKeySchema = v.object({
  owner: v.optional(v.pipe(v.string(), v.minLength(1))),
  quotas: v.optional(v.partial(QuotaSchema)),
  enabled: v.optional(v.boolean()),
});

export function createAuthRoutes(storage: AuthStorage) {
  const admin = new Hono<
    HonoEnv & {
      Variables: {
        isMaster: boolean;
        apiKey: ApiKey;
      };
    }
  >();

  /**
   * Create a new API key
   */
  admin.post(
    "/keys",
    describeRoute({
      tags: ["auth"],
      responses: {
        201: { description: "API key created successfully" },
        400: { description: "Invalid request body" },
        401: { description: "Unauthorized" },
      },
    }),
    vValidator("json", CreateKeySchema),
    async (c) => {
      if (!c.get("isMaster")) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { owner, quotas } = c.req.valid("json");
      const newKey: ApiKey = {
        key: `qnt_${randomUUID().replaceAll("-", "")}`,
        owner,
        quotas,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await storage.createApiKey(newKey);
      return c.json(newKey, 201);
    },
  );

  /**
   * Update an API key
   */
  admin.patch(
    "/keys/:key",
    describeRoute({
      tags: ["auth"],
      responses: {
        200: { description: "API key updated successfully" },
        400: { description: "Invalid request body" },
        401: { description: "Unauthorized" },
        404: { description: "API key not found" },
      },
    }),
    vValidator("json", UpdateKeySchema),
    async (c) => {
      if (!c.get("isMaster")) {
        return c.json({ message: "Unauthorized" }, 401);
      }

      const key = c.req.param("key");
      const data = c.req.valid("json");

      try {
        await storage.updateApiKey(key, data as ApiKey);
        const updatedKey = await storage.getApiKey(key);
        return c.json(updatedKey);
      } catch (error) {
        if (error instanceof ApiKeyNotFoundError) {
          return c.json({ error: "API key not found" }, 404);
        }
        throw error;
      }
    },
  );

  /**
   * Delete an API key
   */
  admin.delete(
    "/keys/:key",
    describeRoute({
      tags: ["auth"],
      responses: {
        200: { description: "API key deleted successfully" },
        401: { description: "Unauthorized (requires master api key)" },
      },
    }),
    async (c) => {
      if (!c.get("isMaster")) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const key = c.req.param("key");
      await storage.deleteApiKey(key);
      return c.json({ message: "API key deleted" });
    },
  );

  /**
   * Get an API key's details
   */
  admin.get(
    "/keys/:key",
    describeRoute({
      tags: ["auth"],
      responses: {
        200: { description: "API key details" },
        401: { description: "Unauthorized" },
        404: { description: "API key not found" },
      },
    }),
    async (c) => {
      const key = c.req.param("key");
      const apiKey = await storage.getApiKey(key);
      if (!apiKey) {
        return c.json({ error: "API key not found" }, 404);
      }
      return c.json(apiKey);
    },
  );

  /**
   * Get usage statistics for an API key
   */
  admin.get(
    "/usage",
    describeRoute({
      tags: ["auth"],
      responses: {
        200: { description: "Usage statistics" },
        400: {
          description:
            "Bad Request: apiKey query param is required for master key users",
        },
        401: { description: "Unauthorized" },
        404: { description: "API key not found" },
      },
    }),
    vValidator("query", v.object({ apiKey: v.optional(v.string()) })),
    async (c) => {
      const isMaster = c.get("isMaster");
      let apiKeyToQuery: string | undefined;

      if (isMaster) {
        apiKeyToQuery = c.req.query("apiKey");
        if (!apiKeyToQuery) {
          return c.json({
            error:
              "apiKey query parameter is required when using the master key",
          }, 400);
        }
      } else {
        const apiKeyData = c.get("apiKey");
        apiKeyToQuery = apiKeyData?.key;
      }

      if (!apiKeyToQuery) {
        // This case should ideally not be hit if middleware is correct
        return c.json({ error: "Could not determine API key" }, 401);
      }

      const usage = await storage.getAllUsageFor(apiKeyToQuery);
      return c.json(usage);
    },
  );

  return admin;
}
