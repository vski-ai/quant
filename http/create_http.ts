import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  GenerateSpecOptions,
  generateSpecs,
  openAPIRouteHandler,
} from "hono-openapi";
import { swaggerUI } from "@hono/swagger-ui";

import { api } from "./routes/index.ts";
import { httpErrorHandler } from "./middleware/errorHandler.ts";
import type { HonoEnv, IHttpPlugin } from "./types.ts";
import type { Engine } from "@/core/engine.ts";

export async function createHttp(
  engine: Engine,
  plugins: IHttpPlugin[] = [],
): Promise<Hono<HonoEnv>> {
  const app = new Hono<HonoEnv>();

  // Register global middleware
  app.use("*", logger());
  app.use("*", cors());
  app.onError(httpErrorHandler);

  // Provide engine to all downstream handlers via context
  app.use("*", async (c, next) => {
    c.set("engine", engine);
    await next();
  });

  // Register HTTP plugins
  for (const plugin of plugins) {
    await plugin.register(api as any, engine);
    console.log(`[HTTP] Registered plugin: ${plugin.name}@${plugin.version}`);
  }

  // Register API routes first
  app.route("/api", api);

  // --- OpenAPI Documentation ---
  // Serve the OpenAPI specification JSON
  const doc: Partial<GenerateSpecOptions> = {
    documentation: {
      info: {
        title: "Core API",
        version: "v1",
        description: "HTTP API for the quant core engine.",
      },
      components: {
        securitySchemes: {
          apiKey: {
            description: "API Key",
            type: "apiKey",
            name: "X-API-Key",
            in: "header",
          },
          masterApiKey: {
            description: "API Key",
            type: "apiKey",
            name: "X-Master-Key",
            in: "header",
          },
        },
      },
      security: [
        {
          apiKey: [],
        },
        {
          masterApiKey: [],
        },
      ],
    },
  };

  const spec = await generateSpecs(app, doc);
  await Deno.writeTextFile(
    [import.meta.dirname, "openapi.json"].join("/"),
    JSON.stringify(spec, null, 2),
  );

  app.get(
    "/openapi.json",
    openAPIRouteHandler(app, doc),
  );

  // Serve the Swagger UI
  app.get("/doc", swaggerUI({ url: "/openapi.json" }));
  return app;
}
