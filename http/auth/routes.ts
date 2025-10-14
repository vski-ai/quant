import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import * as v from "valibot";
import { describeRoute, resolver, validator as vValidator } from "hono-openapi";

import type { AuthStorage } from "./db/storage.ts";
import type { ApiKey } from "./types.ts";
import { ApiKeyNotFoundError } from "./errors.ts";
import { HonoEnv } from "@/http/types.ts";
import { ErrorResponse, SuccessResponse } from "@/http/schemas.ts";
import { AggregationType } from "@/core/mod.ts";
import { start } from "node:repl";

const QuotaSchema = v.object({
  requestsPerSecond: v.pipe(v.number(), v.integer(), v.minValue(1)),
  requestsPerDay: v.pipe(v.number(), v.integer(), v.minValue(1)),
  totalRequests: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

const CreateKeySchema = v.object({
  owner: v.pipe(v.string(), v.minLength(1)),
  name: v.optional(v.pipe(v.string(), v.minLength(1))),
  quotas: QuotaSchema,
});

const UpdateKeySchema = v.object({
  owner: v.optional(v.pipe(v.string(), v.minLength(1))),
  name: v.optional(v.pipe(v.string(), v.minLength(1))),
  quotas: v.optional(v.partial(QuotaSchema)),
  enabled: v.optional(v.boolean()),
});

const ApiKeySchema = v.object({
  key: v.string(),
  owner: v.string(),
  name: v.optional(v.string()),
  quotas: QuotaSchema,
  enabled: v.boolean(),
});

const UsageSchema = v.object({
  second: v.number(),
  day: v.number(),
  total: v.number(),
});

const ReportQuerySchema = v.object({
  metric: v.optional(v.object({
    type: v.enum(AggregationType),
    field: v.optional(v.string()),
  })),
  timeRange: v.object({
    start: v.string(),
    end: v.string(),
  }),
  granularity: v.string(),
  owner: v.optional(v.string()),
});

const DatasetQuerySchema = v.object({
  metrics: v.optional(v.array(v.string())),
  timeRange: v.object({
    start: v.string(),
    end: v.string(),
  }),
  granularity: v.string(),
});

export function createAuthRoutes(
  storage: AuthStorage,
  authReportId: string,
) {
  const admin = new Hono<
    HonoEnv & {
      Variables: {
        isMaster: boolean;
        apiKey: ApiKey;
        engine: any;
        authReportId: string;
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
        201: {
          description: "API key created successfully",
          content: {
            "application/json": {
              schema: resolver(ApiKeySchema),
            },
          },
        },
        400: ErrorResponse,
        401: ErrorResponse,
      },
    }),
    vValidator("json", CreateKeySchema),
    async (c) => {
      if (!c.get("isMaster")) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { owner, quotas, name } = c.req.valid("json");
      const newKey: ApiKey = {
        key: `qnt_${randomUUID().replaceAll("-", "")}`,
        owner,
        name,
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
    "/keys/:id",
    describeRoute({
      tags: ["auth"],
      responses: {
        200: {
          description: "API key updated successfully",
          content: {
            "application/json": {
              schema: resolver(ApiKeySchema),
            },
          },
        },
        400: ErrorResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
    }),
    vValidator("json", UpdateKeySchema),
    async (c) => {
      if (!c.get("isMaster")) {
        return c.json({ message: "Unauthorized" }, 401);
      }

      const id = c.req.param("id");
      const data = c.req.valid("json");

      try {
        await storage.updateApiKey(id, data as ApiKey);
        const updatedKey = await storage.getApiKey(id);
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
    "/keys/:id",
    describeRoute({
      tags: ["auth"],
      responses: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
    }),
    async (c) => {
      if (!c.get("isMaster")) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      await storage.deleteApiKey(id);
      return c.json({ success: true });
    },
  );

  /**
   * Get an API key's details
   */
  admin.get(
    "/keys/:id",
    describeRoute({
      tags: ["auth"],
      responses: {
        200: {
          description: "API key details",
          content: {
            "application/json": {
              schema: resolver(ApiKeySchema),
            },
          },
        },
        401: ErrorResponse,
        404: ErrorResponse,
      },
    }),
    async (c) => {
      const id = c.req.param("id");
      const apiKey = await storage.getApiKey(id);
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
        200: {
          description: "Usage statistics",
          content: {
            "application/json": {
              schema: resolver(UsageSchema),
            },
          },
        },
        400: ErrorResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
    }),
    async (c) => {
      const apiKeyData = c.get("apiKey");
      const apiKeyToQuery = apiKeyData?.key;

      if (!apiKeyToQuery) {
        // This case should ideally not be hit if middleware is correct
        return c.json({ error: "Could not determine API key" }, 401);
      }

      const usage = await storage.getAllUsageFor(apiKeyToQuery);
      return c.json(usage);
    },
  );

  /**
   * Get usage report for an API key
   */
  admin.post(
    "/usage/report",
    describeRoute({
      tags: ["auth"],
      responses: {
        200: {
          description: "Usage report data",
          content: {
            "application/json": {
              schema: resolver(v.array(v.object({
                timestamp: v.string(),
                value: v.number(),
                category: v.optional(v.string()),
              }))),
            },
          },
        },
        401: ErrorResponse,
      },
    }),
    vValidator("json", ReportQuerySchema),
    vValidator("query", v.object({ realtime: v.optional(v.string()) })),
    async (c) => {
      const apiKeyData = c.get("apiKey");
      const engine = c.get("engine");
      const body = c.req.valid("json");
      const { realtime } = c.req.valid("query");
      const isMaster = c.get("isMaster");

      let owner = apiKeyData?.owner;
      if (isMaster) {
        owner = body.owner!;
      }

      if (!owner) {
        return c.json({ error: "Could not determine owner" }, 400);
      }

      const useRealtime = realtime === "true";

      const query = {
        reportId: authReportId,
        metric: body.metric ?? { type: AggregationType.COUNT },
        timeRange: {
          start: new Date(body.timeRange.start),
          end: new Date(body.timeRange.end),
        },
        granularity: body.granularity,
        attribution: { type: "owner", value: owner },
      };

      if (useRealtime) {
        const realtimeData = await engine.getRealtimeReport(query);
        return c.json(realtimeData);
      }
      const reportData = await engine.getReport(query);
      return c.json(reportData);
    },
  );

  /**
   * Get usage dataset for an API key
   */
  admin.post(
    "/usage/dataset",
    describeRoute({
      tags: ["auth"],
      responses: {
        200: {
          description: "Usage dataset data",
          content: {
            "application/json": {
              schema: resolver(v.array(v.object({
                timestamp: v.string(),
              }))), // A generic object as dataset is dynamic
            },
          },
        },
        401: ErrorResponse,
      },
    }),
    vValidator("json", DatasetQuerySchema),
    vValidator("query", v.object({ realtime: v.optional(v.string()) })),
    async (c) => {
      const apiKeyData = c.get("apiKey");
      const engine = c.get("engine");
      const body = c.req.valid("json");
      const { realtime } = c.req.valid("query");

      const useRealtime = realtime === "true";

      const query = {
        reportId: authReportId,
        metrics: body.metrics,
        timeRange: {
          start: new Date(body.timeRange.start),
          end: new Date(body.timeRange.end),
        },
        granularity: body.granularity,
        attribution: { type: "owner", value: apiKeyData.owner },
      };

      if (useRealtime) {
        const realtimeDataset = await engine.getRealtimeDataset(query);
        return c.json(realtimeDataset);
      }
      const datasetData = await engine.getDataset(query);
      return c.json(datasetData);
    },
  );

  /**
   * List API keys, optionally filtering by owner
   */
  admin.get(
    "/keys",
    describeRoute({
      tags: ["auth"],
      responses: {
        200: {
          description: "A list of API keys",
          content: {
            "application/json": {
              schema: resolver(v.array(ApiKeySchema)),
            },
          },
        },
        401: ErrorResponse,
      },
    }),
    vValidator("query", v.object({ owner: v.optional(v.string()) })),
    async (c) => {
      if (!c.get("isMaster")) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { owner } = c.req.valid("query");
      const keys = await storage.listApiKeys({ owner });
      return c.json(keys);
    },
  );

  return admin;
}
