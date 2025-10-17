import { assertEquals, assertExists } from "@std/assert";
import { withTestApi } from "./utils.ts";
import { AggregationType } from "@/core/mod.ts";

const dbName = "api_aggregation_test_db";

withTestApi({ dbName }, async (t, { client }) => {
  await t.step(
    "should correctly aggregate data from multiple sources via the API",
    async () => {
      // --- 1. SETUP PHASE ---

      // Create an API Key for a user
      const { data: keyData } = await client.postApiAuthKeys({
        body: {
          owner: "test-user",
          quotas: {
            requestsPerDay: 1000,
            requestsPerSecond: 10,
            totalRequests: 10000,
          },
        },
      });
      assertExists(keyData?.key);

      client.setMasterKey(null);
      client.setApiKey(keyData.key);

      // Create Event Sources
      const { data: stripeSource } = await client.postApiEventSources({
        body: {
          name: "Stripe",
          eventTypes: [{ name: "payment_succeeded" }],
        },
      });
      assertExists(stripeSource);

      const { data: adyenSource } = await client.postApiEventSources({
        body: {
          name: "Adyen",
          eventTypes: [{ name: "payment_succeeded" }],
        },
      });
      assertExists(adyenSource);

      // Create a Report configuration
      const { data: report } = await client.postApiReports({
        body: {
          name: "All Payments Report",
          active: true,
        },
      });
      assertExists(report);

      // Link the report to two different aggregation sources
      await client.postApiAggregationSources({
        query: { reportId: report.id },
        body: {
          targetCollection: "aggr_stripe_payments",
          filter: {
            sources: [{ name: "Stripe", id: stripeSource.id! }],
            events: ["payment_succeeded"],
          },
        },
      });

      await client.postApiAggregationSources({
        query: { reportId: report.id },
        body: {
          targetCollection: "aggr_adyen_payments",
          filter: {
            sources: [{ name: "Adyen", id: adyenSource.id! }],
            events: ["payment_succeeded"],
          },
        },
      });

      // because we turned off the buffer, there is a race condition
      // between active aggregation sources and events, so we need
      // to wait a second for aggregator polling
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log("Recording events...");
      // Record events for Stripe
      await client.postApiEventsSourceIdEvents({
        path: { sourceId: stripeSource.id },
        body: {
          uuid: crypto.randomUUID(),
          type: "payment_succeeded",
          payload: {
            amount: 100,
            currency: "USD",
          },
          attributions: [{ type: "identity", value: "user_1" }],
        },
      });

      // postApiEventsSourceEvents
      await client.postApiEventsSourceIdEvents({
        path: { sourceId: stripeSource.id },
        body: {
          uuid: crypto.randomUUID(),
          type: "payment_succeeded",
          payload: {
            amount: 150,
            currency: "USD",
          },
          attributions: [{ type: "identity", value: "user_2" }],
        },
      });

      await client.postApiEventsSourceIdEvents({
        path: { sourceId: stripeSource.id },
        body: {
          uuid: crypto.randomUUID(),
          type: "payment_succeeded",
          payload: {
            amount: 50,
            currency: "EUR",
          },
          attributions: [{ type: "identity", value: "user_1" }],
        },
      });

      // Record events for Adyen
      await client.postApiEventsSourceIdEvents({
        path: { sourceId: adyenSource.id },
        body: {
          uuid: crypto.randomUUID(),
          type: "payment_succeeded",
          payload: { amount: 200, currency: "USD" },
          attributions: [{ type: "identity", value: "user_2" }],
        },
      });

      await client.postApiEventsSourceIdEvents({
        path: { sourceId: adyenSource.id },
        body: {
          uuid: crypto.randomUUID(),
          type: "payment_succeeded",
          payload: { amount: 75, currency: "GBP" },
          attributions: [{ type: "identity", value: "user_3" }],
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 1000)); // Give a moment for DB writes

      // --- 3. VERIFICATION PHASE ---
      console.log("Querying reports...");
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Test 3a: Total event count (should be 5)
      const { data: countReport } = await client.postApiReportsIdData({
        path: { id: report.id },
        body: {
          metric: { type: AggregationType.COUNT },
          timeRange: {
            start: oneHourAgo.toISOString(),
            end: now.toISOString(),
          },
          granularity: "hour",
        },
      });

      assertEquals(
        countReport?.length,
        1,
        "Expected one time bucket for the count report",
      );

      assertEquals(
        countReport?.[0].value,
        5,
        "Total event count should be 5",
      );

      // Test 3b: Total sum of 'amount' (100 + 150 + 50 + 200 + 75 = 575)
      const { data: sumReport } = await client.postApiReportsIdData({
        path: { id: report.id },
        body: {
          metric: { type: AggregationType.SUM, field: "amount" },
          timeRange: {
            start: oneHourAgo.toISOString(),
            end: now.toISOString(),
          },
          granularity: "minute",
        },
      });
      assertEquals(
        sumReport?.length,
        1,
        "Expected one time bucket for the sum report",
      );
      assertEquals(
        sumReport?.[0].value,
        575,
        "Total sum of amount should be 575",
      );

      // Test 3c: Category breakdown by 'currency'
      const { data: categoryReport } = await client.postApiReportsIdData({
        path: { id: report.id },
        body: {
          metric: { type: AggregationType.CATEGORY, field: "currency" },
          timeRange: {
            start: oneHourAgo.toISOString(),
            end: now.toISOString(),
          },
          granularity: "hour",
        },
      });
      assertEquals(
        categoryReport?.length,
        3,
        "Expected 3 categories (USD, EUR, GBP)",
      );
      const usdResult = categoryReport?.find((r) => r.category === "USD");
      const eurResult = categoryReport?.find((r) => r.category === "EUR");
      const gbpResult = categoryReport?.find((r) => r.category === "GBP");
      assertExists(usdResult, "USD category should exist");
      assertExists(eurResult, "EUR category should exist");
      assertExists(gbpResult, "GBP category should exist");
      assertEquals(usdResult.value, 3, "Should be 3 payments in USD"); // 2 from stripe, 1 from adyen
      assertEquals(eurResult.value, 1, "Should be 1 payment in EUR");
      assertEquals(gbpResult.value, 1, "Should be 1 payment in GBP");

      // Test 3d: Filter by attribution (user_1 total amount = 100 + 50 = 150)
      const { data: attributionReport } = await client.postApiReportsIdData({
        path: { id: report.id },
        body: {
          metric: { type: AggregationType.SUM, field: "amount" },
          attribution: { type: "identity", value: "user_1" },
          timeRange: {
            start: oneHourAgo.toISOString(),
            end: now.toISOString(),
          },
          granularity: "hour",
        },
      });

      assertEquals(
        attributionReport?.length,
        1,
        "Expected one result for attribution query",
      );
      assertEquals(
        attributionReport?.[0].value,
        150,
        "Total amount for user_1 should be 150",
      );
    },
  );
});
