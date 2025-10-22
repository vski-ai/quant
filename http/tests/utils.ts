import { Engine } from "@/core/mod.ts";
import { getTestDb } from "@/core/tests/utils.ts";
import { createHttp } from "@/http/create_http.ts";
import { client as apiClient } from "@/http/client.ts";
import { CoreAuthPlugin, createHttpAuthPlugin } from "@/http/auth/mod.ts";
import { delay } from "@std/async/delay";

export function withTestApi(
  conf: {
    dbName: string;
    bufferAgeMs?: number;
    httpPlugins?: any[];
  },
  fn: (
    t: Deno.TestContext,
    options: {
      engine: Engine;
      client: ReturnType<typeof apiClient>;
      baseUrl: string;
    },
  ) => Promise<void>,
) {
  Deno.test(`API Test Suite: ${conf.dbName}`, async (t) => {
    let engine: Engine | undefined;
    let ac: AbortController | undefined;

    try {
      // 1. Setup Engine
      engine = new Engine({
        mongoUri: getTestDb(conf.dbName),
        bufferAgeMs: conf.bufferAgeMs,
      });
      await engine.redisClient.flushdb();

      // 2. Setup HTTP Server with Auth
      const masterKey = "test-master-key";
      // Register the core auth plugin to expose engine.auth
      await engine.registerPlugin(new CoreAuthPlugin());
      // Create the HTTP auth plugin for routes and middleware
      const httpAuthPlugin = createHttpAuthPlugin({ masterKey });
      const app = await createHttp(engine, [
        httpAuthPlugin,
        ...(conf.httpPlugins ?? []),
      ]);

      // 3. Start server on a free port
      ac = new AbortController();
      let baseUrl: string = "";
      const client = apiClient();
      const serverPromise = Deno.serve({
        port: 0, // Use a random available port
        signal: ac.signal,
        onListen: ({ hostname, port }) => {
          // 4. Configure API client to talk to the test server
          baseUrl = `http://${hostname}:${port}`;
        },
      }, app.fetch);

      // Wait a moment for the server to be ready and client configured.
      await new Promise((r) => setTimeout(r, 100));

      client.configure({
        baseUrl,
        masterKey, // Use master key for admin/setup tasks in tests
      });
      // 5. Execute the provided test function
      await fn(t, { engine, client, baseUrl });

      // 6. Teardown
      ac.abort();
      await serverPromise;
      await delay(2000);
      await engine.connection.dropDatabase();
    } finally {
      await engine?.disconnect();
    }
  });
}
