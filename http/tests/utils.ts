import { Engine } from "@/core/mod.ts";
import { getTestDb } from "@/core/tests/utils.ts";
import { createHttp } from "@/http/create_http.ts";
import { api as apiClient, configure } from "@/http/client.ts";
import { createAuthPlugin } from "@/http/auth/mod.ts";

export function withTestApi(
  conf: { dbName: string; bufferAgeMs?: number },
  fn: (
    t: Deno.TestContext,
    options: { engine: Engine; client: ReturnType<typeof apiClient> },
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
      const authPlugin = createAuthPlugin({ masterKey });
      const app = await createHttp(engine, [authPlugin]);

      // 3. Start server on a free port
      ac = new AbortController();
      const serverPromise = Deno.serve({
        port: 0, // Use a random available port
        signal: ac.signal,
        onListen: ({ hostname, port }) => {
          // 4. Configure API client to talk to the test server
          configure({
            baseUrl: `http://${hostname}:${port}`,
            masterKey, // Use master key for admin/setup tasks in tests
          });
        },
      }, app.fetch);

      // Wait a moment for the server to be ready and client configured.
      await new Promise((r) => setTimeout(r, 100));

      // 5. Execute the provided test function
      await fn(t, { engine, client: apiClient() });

      // 6. Teardown
      ac.abort();
      await serverPromise;
      await engine.connection.dropDatabase();
    } finally {
      await engine?.disconnect();
    }
  });
}
