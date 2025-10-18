import { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { AuthStorage } from "./db/storage.ts";
import { IEventSource } from "@/core/mod.ts";
import { ApiKey } from "./types.ts";
import { HonoEnv } from "@/http/types.ts";

export function createAuthMiddleware(
  storage: AuthStorage,
  authEventSource: IEventSource,
  masterKey?: string,
): MiddlewareHandler {
  return async (c, next) => {
    const recordUsage = (
      statusCode: number,
      apiKeyData?: ApiKey | null,
    ) => {
      const status = statusCode >= 200 && statusCode < 400
        ? "success"
        : "error";
      authEventSource.record({
        uuid: crypto.randomUUID(),
        eventType: "api_request",
        payload: {
          status,
          statusCode: statusCode.toString(),
          path: c.req.path,
          method: c.req.method,
          owner: apiKeyData?.owner ?? "anonymous",
        },
        // We can tie usage back to the key owner
        attributions: apiKeyData
          ? [{ type: "owner", value: apiKeyData.owner }]
          : [],
      }).catch((err) => {
        console.error("Failed to record API usage:", err);
      });
    };

    // Check for master key first to bypass API key checks
    const providedMasterKey = c.req.header("X-Master-Key");
    if (masterKey && providedMasterKey === masterKey) {
      c.set("isMaster", true);
      await next();
      recordUsage(c.res.status);
      return;
    }

    // Fallback to standard API key authentication
    const apiKey = c.req.header("X-API-Key") ?? c.req.query("api_key");
    if (!apiKey) {
      recordUsage(401);
      return c.json({ error: "API key is required" }, 401);
    }

    const apiKeyData = await storage.getApiKey(apiKey);
    if (!apiKeyData) {
      recordUsage(401, { owner: "unknown" } as ApiKey);
      return c.json({ error: "Invalid API key" }, 401);
    }

    if (!apiKeyData.enabled) {
      recordUsage(401, apiKeyData);
      return c.json({ error: "Invalid API key" }, 401);
    }

    const { quotas } = apiKeyData;
    // Rate limiting
    const requestsInSecond = await storage.incrementUsage(apiKey, "second");
    if (requestsInSecond > quotas.requestsPerSecond) {
      recordUsage(429, apiKeyData);
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    const requestsInDay = await storage.incrementUsage(apiKey, "day");
    if (requestsInDay > quotas.requestsPerDay) {
      recordUsage(429, apiKeyData);
      return c.json({ error: "Daily quota exceeded" }, 429);
    }

    // Total requests
    if (apiKeyData.quotas.totalRequests > 0) {
      const totalRequests = await storage.incrementUsage(apiKey, "total");
      if (totalRequests > quotas.totalRequests) {
        recordUsage(403, apiKeyData);
        return c.json({ error: "Total requests quota exceeded" }, 403);
      }
    }

    c.set("apiKey", apiKeyData);
    await next();
    recordUsage(c.res.status, apiKeyData);
  };
}

export const canAccessReport = createMiddleware<
  HonoEnv & { Variables: { apiKey: ApiKey; isMaster: boolean } }
>(async (c, next) => {
  const apiKey = c.get("apiKey");
  const isMaster = c.get("isMaster");
  const authStorage = c.get("authStorage");
  const { id } = c.req.param() as { id: string };

  if (isMaster) {
    return next();
  }

  if (!apiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const isOwner = await authStorage.isReportOwner(apiKey.owner, id);
  if (!isOwner) {
    return c.json({ error: "Not Found" }, 404);
  }

  await next();
});

export const canAccessEventSource = createMiddleware<
  HonoEnv & { Variables: { apiKey: ApiKey; isMaster: boolean } }
>(async (c, next) => {
  const engine = c.get("engine");
  const apiKey = c.get("apiKey");
  const isMaster = c.get("isMaster");
  const { id } = c.req.param() as { id: string };

  if (isMaster) {
    return next();
  }

  if (!apiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const source = await engine.getEventSourceDefinitionById(id);
  if (!source || !source.owners?.includes(apiKey.owner)) {
    return c.json({ error: "Not Found" }, 404);
  }

  await next();
});

export const canAccessReportFromQuery = createMiddleware<
  HonoEnv & { Variables: { apiKey: ApiKey; isMaster: boolean } }
>(async (c, next) => {
  const authStorage = c.get("authStorage");
  const apiKey = c.get("apiKey");
  const isMaster = c.get("isMaster");
  const { reportId } = c.req.query();

  if (isMaster) {
    return next();
  }

  if (!apiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!reportId) {
    return c.json({ error: "reportId is required" }, 400);
  }

  const isOwner = await authStorage.isReportOwner(apiKey.owner, reportId);
  if (!isOwner) {
    return c.json({ error: "Not Found" }, 404);
  }

  await next();
});
