import type { Engine } from "@/core/mod.ts";
import type { Hono } from "hono";
import { AuthStorage } from "./auth/db/storage.ts"; // This path is now correct for the new orchestrator

export type HonoEnv = {
  Variables: {
    engine: Engine;
    authStorage: AuthStorage;
    authReportId: string;
  };
};

/**
 * Defines the shape for an HTTP plugin that can extend the Hono application.
 */
export interface IHttpPlugin {
  name: string;
  version: string;
  namespace?: "root" | "api";
  register(app: Hono<HonoEnv>, engine: Engine): Promise<void>;
}
