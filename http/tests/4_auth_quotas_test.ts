import { assertEquals, assertExists } from "@std/assert";
import { withTestApi } from "./utils.ts";

const dbName = "api_auth_quotas_test_db";

withTestApi({ dbName }, async (t, { client }) => {
  // --- 1. SETUP ---
  // Create an API key with a very low rate limit to make testing easier.
  const { data: keyData } = await client.postApiAuthKeys({
    body: {
      owner: "quota-test-user",
      quotas: {
        requestsPerSecond: 2, // Allow only 2 requests per second
        requestsPerDay: 1000,
        totalRequests: 10000,
      },
    },
  });
  assertExists(keyData?.key, "Failed to create API key for the test.");

  // Switch the client to use the new user key for subsequent requests.
  client.setMasterKey(null);
  client.setApiKey(keyData.key);

  // --- 2. EXECUTION ---
  // Make a burst of 4 requests. The first 2 should succeed, the next 2 should fail.
  const promises = [
    client.getApiReports(), // Should succeed
    client.getApiReports(), // Should succeed
    client.getApiReports(), // Should fail (429)
    client.getApiReports(), // Should fail (429)
  ];

  const results = await Promise.all(promises);

  // Assert that the quota was enforced correctly at runtime.
  assertExists(results[0].data, "First request should succeed");
  assertExists(results[1].data, "Second request should succeed");
  assertEquals(
    results[2].error?.error,
    "Rate limit exceeded",
    "Third request should be rate limited",
  );
  assertEquals(
    results[3].error?.error,
    "Rate limit exceeded",
    "Fourth request should be rate limited",
  );

  // Wait for the usage events to be aggregated.
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // --- 3. VERIFICATION ---
  await t.step(
    "should return correct usage counts via the dataset endpoint",
    async () => {
      const now = new Date(new Date().getTime() + 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const { data: dataset } = await client.postApiAuthUsageDataset({
        body: {
          timeRange: {
            start: oneHourAgo.toISOString(),
            end: now.toISOString(),
          },
          granularity: "hour",
        },
      });

      assertExists(dataset, "Dataset should exist");
      assertEquals(
        dataset.length,
        1,
        "Expected one time bucket for the dataset",
      );

      const dataPoint = dataset[0] as any;

      // The total number of requests recorded.
      assertEquals(
        dataPoint.api_request_count,
        4,
        "Total request count should be 4",
      );

      // The number of successful requests.
      assertEquals(
        dataPoint.status_by_success,
        2,
        "Should have 2 successful requests",
      );

      // The number of failed requests.
      assertEquals(
        dataPoint.status_by_error,
        2,
        "Should have 2 failed requests (429s)",
      );

      // We can now calculate metrics like error rate.
      const errorRate = (dataPoint.status_by_error as number /
        dataPoint.api_request_count as number) * 100;
      assertEquals(errorRate, 50, "Error rate should be 50%");
    },
  );

  await t.step(
    "should return same usage counts from the realtime dataset endpoint",
    async () => {
      const now = new Date(new Date().getTime() + 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const { data: dataset } = await client.postApiAuthUsageDataset({
        query: { realtime: "true" },
        body: {
          timeRange: {
            start: oneHourAgo.toISOString(),
            end: now.toISOString(),
          },
          granularity: "hour",
        },
      });

      assertExists(dataset, "Realtime dataset should exist");
      assertEquals(
        dataset.length,
        1,
        "Expected one time bucket for the realtime dataset",
      );

      const dataPoint = dataset[0] as any;

      assertEquals(
        dataPoint.api_request_count,
        4,
        "Total request count should be 4",
      );
      assertEquals(
        dataPoint.status_by_success,
        2,
        "Should have 2 successful requests",
      );
      assertEquals(
        dataPoint.status_by_error,
        2,
        "Should have 2 failed requests",
      );
    },
  );
});
