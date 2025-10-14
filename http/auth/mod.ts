import { Redis } from "ioredis";
import { Hono } from "hono";
import { createAuthStorage } from "./db/storage.ts"; // This now points to the orchestrator
import { createAuthMiddleware } from "./middleware.ts";
import { HonoEnv, IHttpPlugin } from "../types.ts";
import { createAuthRoutes } from "./routes.ts";
export * from "./core.plugin.ts";

const INTERNAL_AUTH_SOURCE_NAME = "quant_internal_auth";
const INTERNAL_AUTH_REPORT_NAME = "API Key Usage";

export type AuthConfig = {
  redis?: Redis;
  masterKey?: string;
};

export function createHttpAuthPlugin(config: AuthConfig = {}): IHttpPlugin {
  return {
    name: "HttpAuthPlugin",
    version: "0.0.1",
    async register(app: Hono<HonoEnv>, engine) {
      // --- 1. Setup internal analytics for API usage ---
      const authEventSource = await engine.findOrCreateEventSource({
        name: INTERNAL_AUTH_SOURCE_NAME,
        eventTypes: [{ name: "api_request" }],
      });

      const authReport = await engine.findOrCreateReport({
        name: INTERNAL_AUTH_REPORT_NAME,
        active: true,
      });

      await engine.findOrCreateAggregationSource(authReport.id.toString(), {
        targetCollection: "aggr_api_usage",
        granularity: "second",
        filter: {
          sources: [authEventSource.getDefinition()],
          events: ["api_request"],
        },
      });

      // --- 2. Setup Middleware & Routes ---
      const storage = createAuthStorage(
        engine.connection,
        config.redis ?? engine.redisClient,
      );
      const middleware = createAuthMiddleware(
        storage,
        authEventSource,
        config.masterKey,
      );

      // Make auth storage available in the context for other routes
      app.use(async (c, next) => {
        c.set("authStorage", storage);
        c.set("authReportId", authReport.id.toString());
        await next();
      });

      app.use(
        middleware,
      );
      // Register admin routes if master key is provided
      if (config.masterKey) {
        const admin = createAuthRoutes(storage, authReport.id.toString());
        app.route("auth", admin);
      }
      return await Promise.resolve();
    },
  };
}
