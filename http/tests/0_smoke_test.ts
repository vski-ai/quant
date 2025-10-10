import { assertEquals, assertExists } from "@std/assert";
import { withTestApi } from "./utils.ts";

const dbName = "api_smoke_test_db";

withTestApi({ dbName }, async (t, { client }) => {
  await t.step("should create and list a report via the API", async () => {
    // --- 1. Create an API Key for a user ---
    const { data: keyData, error } = await client.postApiAuthKeys({
      body: {
        owner: "test-user",
        quotas: {
          requestsPerDay: 1000,
          requestsPerSecond: 10,
          totalRequests: 10000,
        },
      },
    });
    assertEquals(error, undefined);
    assertExists(keyData?.key);

    // --- 2. Use the new key to create a report ---
    // We need to re-configure the client to use the new user key
    client.setMasterKey(null);
    client.setApiKey(keyData.key);

    const { data: createdReport, error: createError } = await client
      .postApiReports(
        {
          body: { name: "My API Report" },
        },
      );

    assertEquals(createError, undefined);
    assertEquals(createdReport?.name, "My API Report");
    assertExists(createdReport?.id);

    const { data: getReport, error: _getError } = await client
      .getApiReportsId(
        {
          path: {
            id: createdReport!.id,
          },
        },
      );

    assertEquals(getReport?.id, createdReport?.id);

    client.setMasterKey(null);
    client.setApiKey("poop");

    const { data: _getReport, error: getError1 } = await client
      .getApiReportsId(
        {
          path: {
            id: createdReport!.id,
          },
        },
      );
    assertEquals("Invalid API key", getError1?.error);

    client.setApiKey(null);

    const { data: _, error: getError2 } = await client
      .getApiReportsId(
        {
          path: {
            id: createdReport!.id,
          },
        },
      );
    assertEquals("API key is required", getError2?.error);
  });
});
