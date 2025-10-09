import { Redis } from "ioredis";
import { Hono } from "hono";
import { createAuthStorage } from "./storage.ts";
import { createAuthMiddleware } from "./middleware.ts";
import { createReporter, ReporterConfig } from "./reporter.ts";
import { IHttpPlugin } from "../types.ts";
import { createAuthRoutes } from "./routes.ts";

export type AuthConfig = {
  redis?: Redis;
  reporter?: ReporterConfig;
  masterKey?: string;
};

export function createAuthPlugin(config: AuthConfig = {}): IHttpPlugin {
  return {
    name: "Auth Plugin",
    version: "0.0.1",
    async register(app: Hono<any>, engine) {
      const storage = createAuthStorage(config.redis ?? engine.redisClient);
      const middleware = createAuthMiddleware(storage, config.masterKey);
      if (config.reporter) {
        const reporter = createReporter(storage, config.reporter);
        reporter.start();
      }

      // We only protect /api/*
      app.use("*", middleware);

      // Register admin routes if master key is provided
      if (config.masterKey) {
        const admin = createAuthRoutes(storage);
        app.route("auth", admin);
      }
      return await Promise.resolve();
    },
  };
}
