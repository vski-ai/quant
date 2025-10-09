import { Engine } from "../mod.ts";

export function withTestDatabase(conf: {
  dbName: string;
  bufferAgeMs?: number;
}, fn: (t: Deno.TestContext, engine: Engine) => Promise<void>) {
  // Define a separate test context for the main suite.
  Deno.test("Event Module Integration Tests", async (t) => {
    const engine = new Engine({
      mongoUri: getTestDb(conf.dbName),
      bufferAgeMs: conf.bufferAgeMs,
    });
    await new Promise((r) => setTimeout(r, 500));
    try {
      // 1. Connect to the test database before any tests run.
      await engine.redisClient.flushdb();
      // 2. Execute the provided test function with the context.
      await fn(t, engine);
    } finally {
      // 3. Clean up after all tests are done.
      await engine.connection.dropDatabase();
      await engine.disconnect();
    }
  });
}

export const getTestDb = (name: string) => {
  const db = Deno.env.get("MONGODB_URI")?.replace(
    /\/([^\/]+)$/,
    `/${name}?authSource=admin`,
  )!;
  if (!db) {
    throw new Error("MONGODB_URI environment variable is not set.");
  }
  return db;
};
