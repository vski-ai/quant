import { assertEquals, assertExists } from "@std/assert";
import { withTestApi } from "./utils.ts";
import { AggregationType } from "@/core/mod.ts";

const dbName = "api_auth_usage_report_test_db";

withTestApi({ dbName }, async (t, { client }) => {
  // --- 1. SETUP ---
  // Create a standard API key for a user. The master key will be used for setup.
  const { data: keyData } = await client.postApiAuthKeys({
    body: {
      owner: "usage-report-user",
      quotas: {
        requestsPerDay: 1000,
        requestsPerSecond: 10,
        totalRequests: 10000,
      },
    },
  });
  assertExists(keyData?.key, "Failed to create API key for the test.");

  // Switch the client to use the new user key for subsequent requests.
  client.setMasterKey(null);
  client.setApiKey(keyData.key);

  // --- 2. EXECUTION ---
  // Make a series of API calls to generate usage data.
  // The auth middleware will automatically record an 'api_request' event for each.

  // Successful calls
  await client.postApiReports({ body: { name: "Usage Test Report 1" } }); // 1
  await client.postApiReports({ body: { name: "Usage Test Report 2" } }); // 2
  const { data: reports } = await client.getApiReports(); // 3
  assertExists(reports, "Failed to get reports");

  // Call that results in a client error (404)
  await client.getApiReportsId({ path: { id: "non-existent-id" } }); // 4

  // Another successful call to a different endpoint
  await client.getApiEventSources(); // 5

  // Wait a moment to ensure the events are processed by the aggregator.
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const now = new Date(new Date().getTime() + 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // --- 3. VERIFICATION ---

  await t.step("should return the total request count", async () => {
    const { data: report } = await client.postApiAuthUsageReport({
      body: {
        timeRange: {
          start: oneHourAgo.toISOString(),
          end: now.toISOString(),
        },
        granularity: "hour",
      },
    });

    assertExists(report, "Usage report data should exist");
    assertEquals(report.length, 1, "Expected one time bucket for the report");
    assertEquals(
      report[0].value,
      5,
      "Total request count should be 5",
    );

    // Real-time check
    const { data: realtimeReport } = await client.postApiAuthUsageReport({
      query: { realtime: "true" },
      body: {
        timeRange: {
          start: oneHourAgo.toISOString(),
          end: now.toISOString(),
        },
        granularity: "hour",
      },
    });
    assertExists(realtimeReport, "Realtime report data should exist");
    assertEquals(
      realtimeReport[0].value,
      5,
      "Realtime total request count should also be 5",
    );
  });

  await t.step(
    "should return request count broken down by status",
    async () => {
      const { data: report } = await client.postApiAuthUsageReport({
        body: {
          metric: { type: AggregationType.CATEGORY, field: "status" },
          timeRange: {
            start: oneHourAgo.toISOString(),
            end: now.toISOString(),
          },
          granularity: "hour",
        },
      });

      assertExists(report, "Usage report data should exist");
      assertEquals(report.length, 2, "Expected two categories: success, error");

      const success = report.find((r) => r.category === "success");
      const error = report.find((r) => r.category === "error");

      assertExists(success, "Success category should exist");
      assertEquals(success.value, 5, "Expected 4 successful requests");

      assertExists(error, "Error category should exist");
      assertEquals(error.value, 1, "Expected 1 error request");

      // Real-time check
      const { data: realtimeReport } = await client.postApiAuthUsageReport({
        query: { realtime: "true" },
        body: {
          metric: { type: AggregationType.CATEGORY, field: "status" },
          timeRange: {
            start: oneHourAgo.toISOString(),
            end: now.toISOString(),
          },
          granularity: "hour",
        },
      });
      assertExists(realtimeReport, "Realtime report data should exist");
      const realtimeSuccess = realtimeReport.find((r) =>
        r.category === "success"
      );
      const realtimeError = realtimeReport.find((r) => r.category === "error");
      assertEquals(
        realtimeSuccess?.value,
        6,
        "Realtime success count should be 4",
      );
      assertEquals(realtimeError?.value, 1, "Realtime error count should be 1");
    },
  );

  await t.step(
    "should return request count broken down by path",
    async () => {
      const { data: report } = await client.postApiAuthUsageReport({
        body: {
          metric: { type: AggregationType.CATEGORY, field: "path" },
          timeRange: {
            start: oneHourAgo.toISOString(),
            end: now.toISOString(),
          },
          granularity: "hour",
        },
      });

      assertExists(report, "Usage report data should exist");
      assertEquals(
        report.length,
        4,
        "Expected 3 distinct paths to be reported",
      );

      const postReports = report.find((r) => r.category === "/api/reports");
      const getReportsId = report.find((r) =>
        r.category === "/api/reports/non-existent-id"
      );
      const getEventSources = report.find((r) =>
        r.category === "/api/event-sources"
      );

      assertExists(postReports, "Path /api/reports should exist");
      assertEquals(postReports.value, 3, "Expected 3 requests to /api/reports");

      assertExists(getReportsId, "Path for specific report ID should exist");
      assertEquals(
        getReportsId.value,
        1,
        "Expected 1 request to /api/reports/:id",
      );

      assertExists(getEventSources, "Path /api/event-sources should exist");
      assertEquals(
        getEventSources.value,
        1,
        "Expected 1 request to /api/event-sources",
      );
    },
  );
});
