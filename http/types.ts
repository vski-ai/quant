import type { Engine } from "@/core/mod.ts";
import type { Hono } from "hono";

export type HonoEnv = {
  Variables: {
    engine: Engine;
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
