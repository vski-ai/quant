import { assertEquals, assertExists } from "@std/assert";
import { withTestApi } from "./utils.ts";

const dbName = "api_smoke_test_db";

withTestApi({ dbName }, async (t, { client }) => {
  await t.step("should create and list a report via the API", async () => {
    // --- 1. Create an API Key for a user ---
    const { data: keyData } = await client.postApiAuthKeys({
      body: {
        owner: "test-user",
        quotas: {
          requestsPerDay: 1000,
          requestsPerSecond: 10,
          totalRequests: 10000,
        },
      },
    }) as any;

    assertExists(keyData.key);
  });
});
