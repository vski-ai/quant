import { assertEquals, assertExists } from "@std/assert";
import { AggregationType, IQuery } from "../mod.ts";
import { IEventSource } from "../types.ts";
import { withTestDatabase } from "./utils.ts";

const dbName = "aggregation_buffer_test_db";

withTestDatabase({
  dbName,
  bufferAgeMs: 1000 * 60 * 60 * 24 * 360 * 10,
}, async (t, engine, teardown) => {
  await t.step(
    "should correctly aggregate data from multiple sources into a single report",
    async () => {
      // --- 1. SETUP PHASE ---

      // Create Event Sources
      const stripeSource: IEventSource = await engine.createEventSource({
        name: "Stripe",
        eventTypes: [{ name: "payment_succeeded" }],
      });
      const adyenSource: IEventSource = await engine.createEventSource({
        name: "Adyen",
        eventTypes: [{ name: "payment_succeeded" }],
      });

      const ReportModel = engine.ReportModel;
      const AggregationSourceModel = engine.AggregationSourceModel;

      // Create a Report configuration
      const report = await ReportModel.create({
        name: "All Payments Report",
        active: true,
      });

      // Link the report to two different aggregation sources (many-to-many)
      await AggregationSourceModel.create([
        {
          reportId: report._id,
          targetCollection: "aggr_stripe_payments",
          filter: {
            sources: [{ name: "Stripe", id: stripeSource.getDefinition().id! }],
            events: ["payment_succeeded"],
          },
        },
        {
          reportId: report._id,
          targetCollection: "aggr_adyen_payments",
          filter: {
            sources: [{ name: "Adyen", id: adyenSource.getDefinition().id! }],
            events: ["payment_succeeded"],
          },
        },
      ]);
      // because we turned off the buffer, there is a race condition
      // between active aggregation sources and events, so we need
      // to wait a second for aggregator polling
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("Recording events...");

      const baseTime = new Date("2023-12-01T12:00:00.000Z");

      // Record events for Stripe
      await stripeSource.record({
        uuid: crypto.randomUUID(),
        eventType: "payment_succeeded",
        payload: { amount: 100, currency: "USD" },
        attributions: [{ type: "identity", value: "user_1" }],
        timestamp: new Date("2023-12-01T11:59:00.000Z"),
      });

      await stripeSource.record({
        uuid: crypto.randomUUID(),
        eventType: "payment_succeeded",
        payload: { amount: 150, currency: "USD" },
        attributions: [{ type: "identity", value: "user_2" }],
        timestamp: new Date("2023-12-01T11:58:00.000Z"),
      });

      await stripeSource.record({
        uuid: crypto.randomUUID(),
        eventType: "payment_succeeded",
        payload: { amount: 50, currency: "EUR" },
        attributions: [{ type: "identity", value: "user_1" }],
        timestamp: new Date("2023-12-01T11:57:00.000Z"),
      });

      // Record events for Adyen
      await adyenSource.record({
        uuid: crypto.randomUUID(),
        eventType: "payment_succeeded",
        payload: { amount: 200, currency: "USD" },
        attributions: [{ type: "identity", value: "user_2" }],
        timestamp: new Date("2023-12-01T11:56:00.000Z"),
      });

      await adyenSource.record({
        uuid: crypto.randomUUID(),
        eventType: "payment_succeeded",
        payload: { amount: 75, currency: "GBP" },
        attributions: [{ type: "identity", value: "user_3" }],
        timestamp: new Date("2023-12-01T11:55:00.000Z"),
      });

      await new Promise((resolve) => setTimeout(resolve, 300)); // Give a moment for DB writes

      const bufferService = engine.aggregator.bufferService;
      assertExists(bufferService, "Buffer service should be defined");

      // --- 3. VERIFICATION PHASE ---
      console.log("Querying reports...");
      const timeRange = {
        start: new Date("2023-12-01T11:00:00.000Z"),
        end: baseTime,
      };

      // Test 3a: Total event count (should be 5)
      const countQuery: IQuery = {
        reportId: report._id.toString(),
        metric: { type: AggregationType.COUNT },
        timeRange,
        granularity: "hour",
      };
      const countReport = await bufferService.query(
        countQuery,
        "aggr_stripe_payments",
      );
      const adyenCountReport = await bufferService.query(
        countQuery,
        "aggr_adyen_payments",
      );
      countReport[0].value += adyenCountReport[0].value;
      assertEquals(
        countReport.length,
        1,
        "Expected one time bucket for the count report",
      );

      assertEquals(
        countReport[0].value,
        5,
        "Total event count should be 5",
      );

      // Test 3b: Total sum of 'amount' (100 + 150 + 50 + 200 + 75 = 575)
      const sumQuery: IQuery = {
        reportId: report._id.toString(),
        metric: { type: AggregationType.SUM, field: "amount" },
        timeRange,
        granularity: "hour",
      };
      const sumReport = await bufferService.query(
        sumQuery,
        "aggr_stripe_payments",
      );
      const adyenSumReport = await bufferService.query(
        sumQuery,
        "aggr_adyen_payments",
      );
      sumReport[0].value += adyenSumReport[0].value;
      assertEquals(
        sumReport.length,
        1,
        "Expected one time bucket for the sum report",
      );
      assertEquals(
        sumReport[0].value,
        575,
        "Total sum of amount should be 575",
      );

      // Test 3c: Category breakdown by 'currency'
      const categoryQuery: IQuery = {
        reportId: report._id.toString(),
        metric: { type: AggregationType.CATEGORY, field: "currency" },
        timeRange,
        granularity: "hour",
      };

      const categoryReport = await bufferService.query(
        categoryQuery,
        "aggr_stripe_payments",
      );
      const adyenCategoryReport = await bufferService.query(
        categoryQuery,
        "aggr_adyen_payments",
      );
      assertEquals(
        new Set(
          [...categoryReport, ...adyenCategoryReport].map((e) => e.category),
        ).size,
        3,
        "Expected 3 categories (USD, EUR, GBP)",
      );
      const usdResult = categoryReport.find((r) => r.category === "USD");
      const adyenUsdResult = adyenCategoryReport.find((r) =>
        r.category === "USD"
      );
      const eurResult = categoryReport.find((r) => r.category === "EUR");
      const gbpResult = adyenCategoryReport.find((r) => r.category === "GBP");
      assertExists(usdResult, "USD category should exist");
      assertExists(adyenUsdResult, "Adyen USD category should exist");
      assertExists(eurResult, "EUR category should exist");
      assertExists(gbpResult, "GBP category should exist");
      assertEquals(
        usdResult.value + adyenUsdResult.value,
        3,
        "Should be 3 payments in USD",
      ); // 2 from stripe, 1 from adyen
      assertEquals(eurResult.value, 1, "Should be 1 payment in EUR"); // from stripe
      assertEquals(gbpResult.value, 1, "Should be 1 payment in GBP"); // from adyen

      // Test 3d: Filter by attribution (user_1 total amount = 100 + 50 = 150)
      const attributionQuery: IQuery = {
        reportId: report._id.toString(),
        metric: { type: AggregationType.SUM, field: "amount" },
        attribution: { type: "identity", value: "user_1" },
        timeRange,
        granularity: "hour",
      };
      const attributionReport = await bufferService.query(
        attributionQuery,
        "aggr_stripe_payments",
      );
      const adyenAttributionReport = await bufferService.query(
        attributionQuery,
        "aggr_adyen_payments",
      );
      assertEquals(
        attributionReport.length,
        1,
        "Expected one result for attribution query",
      );
      assertEquals(
        attributionReport[0].value,
        150,
        "Total amount for user_1 should be 150",
      );

      // Test 3e: Verify that events recorded *after* the manual flush are NOT included
      // Record new events that will stay in the Redis buffer
      await stripeSource.record({
        uuid: crypto.randomUUID(),
        eventType: "payment_succeeded",
        payload: { amount: 1000, currency: "JPY" },
        attributions: [],
        timestamp: new Date("2023-12-01T11:54:00.000Z"),
      });
      await adyenSource.record({
        uuid: crypto.randomUUID(),
        eventType: "payment_succeeded",
        payload: { amount: 2000, currency: "CNY" },
        attributions: [],
        timestamp: new Date("2023-12-01T11:53:00.000Z"),
      });

      await new Promise((r) => setTimeout(r, 3000));
      const postFlushCountQuery: IQuery = {
        reportId: report._id.toString(),
        metric: { type: AggregationType.COUNT },
        timeRange,
        granularity: "hour",
      };
      const postFlushCountReport = await engine.getReport(
        postFlushCountQuery,
      );
      assertEquals(
        postFlushCountReport.length,
        1,
        "Expected one time bucket for the count report after post-flush events",
      );
      assertEquals(
        postFlushCountReport[0].value,
        7,
        "Total event count should be 5 (we query only db)",
      );

      const postFlushSumQuery: IQuery = {
        reportId: report._id.toString(),
        metric: { type: AggregationType.SUM, field: "amount" },
        timeRange,
        granularity: "hour",
      };
      const postFlushSumReport = await engine.getReport(
        postFlushSumQuery,
      );
      assertEquals(
        postFlushSumReport[0].value,
        3575,
        "Total sum should  be 3575 (everythin is buffer)",
      );

      await engine.aggregator.stop();
    },
  );
  await teardown();
});
