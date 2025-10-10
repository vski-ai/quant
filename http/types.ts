import type { Engine } from "@/core/mod.ts";
import type { Hono } from "hono";
import { AuthStorage } from "./auth/db/storage.ts"; // This path is now correct for the new orchestrator

export type HonoEnv = {
  Variables: {
    engine: Engine;
    authStorage: AuthStorage;
  };
};

/**
 * Defines the shape for an HTTP plugin that can extend the Hono application.
 */
export interface IHttpPlugin {
  name: string;
  version: string;
  register(app: Hono, engine: Engine): Promise<void>;
}
