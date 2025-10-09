import { assertEquals, assertExists } from "@std/assert";
import { AggregationType, IAnalyticsQuery } from "../mod.ts";
import { withTestDatabase } from "./utils.ts";

const dbName = "granularity_test_db";

withTestDatabase({ dbName }, async (t, engine) => {
  // --- SETUP ---
  const source = await engine.createEventSource({
    name: "GranularityTestSource",
    eventTypes: [{ name: "timed_event" }],
  });

  const report = await engine.ReportModel.create({
    name: "Granularity Test Report",
    active: true,
  });

  await engine.AggregationSourceModel.create({
    reportId: report._id,
    targetCollection: "aggr_granularity_events",
    filter: {
      sources: [{
        name: "GranularityTestSource",
        id: source.getDefinition().id!,
      }],
      events: ["timed_event"],
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Record events at specific times to test grouping
  const baseTime = new Date("2023-11-01T10:30:00.000Z");
  const events = [
    { timestamp: new Date("2023-11-01T10:29:00.000Z"), amount: 10 }, // In 10:25-10:29 bucket
    { timestamp: new Date("2023-11-01T10:24:00.000Z"), amount: 20 }, // In 10:20-10:24 bucket
    { timestamp: new Date("2023-11-01T10:23:00.000Z"), amount: 30 }, // In 10:20-10:24 bucket
    { timestamp: new Date("2023-11-01T10:18:00.000Z"), amount: 40 }, // In 10:15-10:19 bucket
  ];

  for (const event of events) {
    await source.record(
      crypto.randomUUID(),
      "timed_event",
      { amount: event.amount },
      undefined,
      event.timestamp,
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  await t.step("should group correctly by '5minute' granularity", async () => {
    const query: IAnalyticsQuery = {
      reportId: report._id.toString(),
      metric: { type: AggregationType.SUM, field: "amount" },
      timeRange: {
        start: new Date("2023-11-01T10:10:00.000Z"),
        end: baseTime,
      },
      granularity: "5minute",
    };

    const reportResult = await engine.getReport(query);

    // Expected groups:
    // - Bucket 1 (10:15-10:19): 40
    // - Bucket 2 (10:20-10:24): 20 + 30 = 50
    // - Bucket 3 (10:25-10:29): 10
    assertEquals(
      reportResult.length,
      3,
      "Expected 3 time buckets for 5-minute granularity",
    );

    const bucket1 = reportResult.find((r) => r.value === 40); // 10-14 min bucket
    const bucket2 = reportResult.find((r) => r.value === 50); // 5-9 min bucket, value 50
    const bucket3 = reportResult.find((r) => r.value === 10); // 0-4 min bucket

    assertExists(bucket1, "Bucket with value 40 should exist");
    assertExists(bucket2, "Bucket with value 50 should exist");
    assertExists(bucket3, "Bucket with value 10 should exist");
  });

  await t.step("should group correctly by 'hour' granularity", async () => {
    const query: IAnalyticsQuery = {
      reportId: report._id.toString(),
      metric: { type: AggregationType.SUM, field: "amount" },
      timeRange: {
        start: new Date("2023-11-01T08:30:00.000Z"),
        end: baseTime,
      },
      granularity: "hour",
    };

    const reportResult = await engine.getReport(query);
    assertEquals(
      reportResult.length,
      1,
      "Expected 1 time bucket for hourly granularity",
    );
    assertEquals(
      reportResult[0].value,
      100,
      "Total sum for the hour should be 100",
    );
  });

  await engine.aggregator.stop();
});
