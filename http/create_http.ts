import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { GenerateSpecOptions, generateSpecs } from "hono-openapi";
import { swaggerUI } from "@hono/swagger-ui";

import { extendSchema } from "./schemas/schema_hook.ts";
import { createApiRouter } from "./routes/index.ts";
import { httpErrorHandler } from "./middleware/errorHandler.ts";
import type { HonoEnv, IHttpPlugin } from "./types.ts";
import type { Engine } from "@/core/engine.ts";

export async function createHttp(
  engine: Engine,
  plugins: IHttpPlugin[] = [],
): Promise<Hono<HonoEnv>> {
  const app = new Hono<HonoEnv>();

  // Register global middleware
  app.use(logger());
  app.use(cors());
  app.onError(httpErrorHandler);
  // Provide engine to all downstream handlers via context
  app.use(async (c, next) => {
    c.set("engine", engine);
    await next();
  });

  for (const plugin of plugins) {
    plugin.schema?.(extendSchema);
  }

  // Separate plugins based on their desired namespace.
  const rootPlugins = plugins.filter((p) => p.namespace === "root");
  const apiPlugins = plugins.filter((p) => p.namespace !== "root");

  // Register root-level plugins.
  for (const plugin of rootPlugins) {
    console.log(`Registering ${plugin.name} at root namespace.`);
    await plugin.register(app, engine);
  }

  // Register all other API routes under the /api path, which IS protected by auth middleware.
  console.log(`Registering ${apiPlugins.length} plugins under /api namespace.`);
  const apiRouter = await createApiRouter(engine, apiPlugins);
  app.route("/api", apiRouter);

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
          apiKeyQuery: {
            description: "API Key",
            type: "apiKey",
            name: "api_key",
            in: "query",
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
    (c) => c.json(spec),
  );

  // Serve the Swagger UI
  app.get("/doc", swaggerUI({ url: "/openapi.json" }));
  return app;
}
