import { MiddlewareHandler } from "hono";
import { AuthStorage } from "./db/storage.ts";

export function createAuthMiddleware(
  storage: AuthStorage,
  masterKey?: string,
): MiddlewareHandler {
  return async (c, next) => {
    // Check for master key first to bypass API key checks
    const providedMasterKey = c.req.header("X-Master-Key");
    if (masterKey && providedMasterKey === masterKey) {
      c.set("isMaster", true);
      await next();
      return;
    }

    // Fallback to standard API key authentication
    const apiKey = c.req.header("X-API-Key");

    if (!apiKey) {
      return c.json({ error: "API key is required" }, 401);
    }

    const apiKeyData = await storage.getApiKey(apiKey);

    if (!apiKeyData || !apiKeyData.enabled) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    const { quotas } = apiKeyData;

    // Rate limiting
    const requestsInSecond = await storage.incrementUsage(apiKey, "second");
    if (requestsInSecond > quotas.requestsPerSecond) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    const requestsInDay = await storage.incrementUsage(apiKey, "day");
    if (requestsInDay > quotas.requestsPerDay) {
      return c.json({ error: "Daily quota exceeded" }, 429);
    }

    // Total requests
    if (apiKeyData.quotas.totalRequests > 0) {
      const totalRequests = await storage.incrementUsage(apiKey, "total");
      if (totalRequests > quotas.totalRequests) {
        return c.json({ error: "Total requests quota exceeded" }, 403);
      }
    }

    c.set("apiKey", apiKeyData);

    await next();
  };
}
