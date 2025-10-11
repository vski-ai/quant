import { Redis } from "ioredis";
import { Hono } from "hono";
import { createAuthStorage } from "./db/storage.ts"; // This now points to the orchestrator
import { createAuthMiddleware } from "./middleware.ts";
import { createReporter, ReporterConfig } from "./reporter.ts";
import { HonoEnv, IHttpPlugin } from "../types.ts";
import { createAuthRoutes } from "./routes.ts";
export * from "./core.plugin.ts";
export type AuthConfig = {
  redis?: Redis;
  reporter?: ReporterConfig;
  masterKey?: string;
};

export function createHttpAuthPlugin(config: AuthConfig = {}): IHttpPlugin {
  return {
    name: "HttpAuthPlugin",
    version: "0.0.1",
    async register(app: Hono<HonoEnv>, engine) {
      const storage = createAuthStorage(
        engine.connection,
        config.redis ?? engine.redisClient,
      );
      const middleware = createAuthMiddleware(storage, config.masterKey);
      if (config.reporter) {
        const reporter = createReporter(storage, config.reporter);
        reporter.start();
      }

      // Make auth storage available in the context for other routes
      app.use(async (c, next) => {
        c.set("authStorage", storage);
        await next();
      });

      app.use(middleware);

      // Register admin routes if master key is provided
      if (config.masterKey) {
        const admin = createAuthRoutes(storage);
        app.route("auth", admin);
      }
      return await Promise.resolve();
    },
  };
}
