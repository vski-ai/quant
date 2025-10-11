import { EngineConfig } from "../engine.ts";
import { Engine } from "../mod.ts";

type TestConfig = {
  dbName: string;
  bufferAgeMs?: number;
  engineConfig?: Partial<EngineConfig>;
};

export function withTestDatabase(
  conf: TestConfig,
  fn: (
    t: Deno.TestContext,
    engine: Engine,
    teardown: () => Promise<void>,
  ) => Promise<void>,
) {
  // Define a separate test context for the main suite.
  Deno.test("Event Module Integration Tests", async (t) => {
    const engine = new Engine({
      mongoUri: getTestDb(conf.dbName),
      bufferAgeMs: conf.bufferAgeMs,
      ...(conf.engineConfig),
    });
    await new Promise((r) => setTimeout(r, 500));
    const teardown = async () => {
      await engine.connection.dropDatabase();
      await engine.disconnect();
      await new Promise((r) => setTimeout(r, 500));
    };
    try {
      // 1. Connect to the test database before any tests run.
      await engine.redisClient.flushdb();
      // 2. Execute the provided test function with the context.
      await fn(t, engine, teardown);
    } finally {
      // 3. Clean up after all tests are done.
      // Teardown is now called explicitly by the test function
    }
  });
}

export async function withTestEngine(
  conf: TestConfig,
  fn: (engine: Engine) => Promise<void>,
) {
  const engine = new Engine({
    mongoUri: getTestDb(conf.dbName),
    bufferAgeMs: conf.bufferAgeMs,
    ...(conf.engineConfig),
  });
  await new Promise((r) => setTimeout(r, 500));
  await engine.connection.dropDatabase().catch();
  try {
    await engine.redisClient.flushdb();
    await fn(engine);
  } finally {
    await engine.connection.dropDatabase();
    await engine.disconnect();
    await new Promise((r) => setTimeout(r, 500));
  }
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
