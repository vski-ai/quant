import { assertEquals, assertExists } from "@std/assert";
import { truncateDate } from "../utils.ts";
import { AggregationType, IAnalyticsQuery, IEventSource } from "../mod.ts";
import { withTestDatabase } from "./utils.ts";

const dbName = "delayed_events_test_db";

withTestDatabase({ dbName }, async (t, engine) => {
  // --- SETUP ---
  const source: IEventSource = await engine.createEventSource({
    name: "DelayedEventSource",
    eventTypes: [{ name: "timed_event" }],
  });

  const report = await engine.ReportModel.create({
    name: "Delayed Events Report",
    active: true,
  });

  await engine.AggregationSourceModel.create({
    reportId: report._id,
    targetCollection: "aggr_delayed_events",
    filter: {
      sources: [{ name: "DelayedEventSource", id: source.getDefinition().id! }],
      events: ["timed_event"],
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));

  await t.step(
    "should correctly handle delayed events with negative values",
    async () => {
      const now = new Date();
      // This test simulates an event arriving late that corrects an existing bucket.
      const targetTime = new Date(now.getTime() - 8 * 60 * 1000); // 8 minutes ago
      const slightlyDifferentTargetTime = new Date(targetTime.getTime() + 5000); // Still in the same minute bucket

      // 1. Record initial positive events and flush them.
      await source.record(
        crypto.randomUUID(),
        "timed_event",
        { amount: 60 },
        undefined,
        targetTime,
      );
      await source.record(
        crypto.randomUUID(),
        "timed_event",
        { amount: 40 },
        undefined,
        slightlyDifferentTargetTime,
      );
      await new Promise((r) => setTimeout(r, 1000)); // Wait for events to process

      // 2. Verify the initial state of the bucket.
      const baseQuery: Omit<IAnalyticsQuery, "reportId" | "metric"> = {
        timeRange: {
          start: new Date(now.getTime() - 20 * 60 * 1000),
          end: now,
        },
        granularity: "minute",
      };

      const initialSumReport = await engine.getReport({
        ...baseQuery,
        reportId: report._id.toString(),
        metric: { type: AggregationType.SUM, field: "amount" },
      });

      const targetBucketTime = truncateDate(targetTime, "minute");
      let targetBucket = initialSumReport.find(
        (r) => r.timestamp.getTime() === targetBucketTime.getTime(),
      );
      assertExists(
        targetBucket,
        "The target time bucket should exist initially",
      );
      assertEquals(
        targetBucket.value,
        100,
        "Initial bucket sum should be 100 (60 + 40)",
      );

      const initialCountReport = await engine.getReport({
        ...baseQuery,
        reportId: report._id.toString(),
        metric: { type: AggregationType.COUNT },
      });
      targetBucket = initialCountReport.find(
        (r) => r.timestamp.getTime() === targetBucketTime.getTime(),
      );
      assertExists(targetBucket, "The count bucket should exist initially");
      assertEquals(targetBucket.value, 2, "Initial bucket count should be 2");

      // 3. Record a delayed "refund" event for the same past timestamp and flush it.
      await source.record(
        crypto.randomUUID(),
        "timed_event",
        { amount: -30 },
        undefined,
        targetTime,
      );
      await new Promise((r) => setTimeout(r, 500));

      // 4. Query again and verify the bucket was updated correctly.
      const finalSumReport = await engine.getReport({
        ...baseQuery,
        reportId: report._id.toString(),
        metric: { type: AggregationType.SUM, field: "amount" },
      });

      targetBucket = finalSumReport.find(
        (r) => r.timestamp.getTime() === targetBucketTime.getTime(),
      );
      assertExists(targetBucket, "The target sum bucket should still exist");
      assertEquals(
        targetBucket.value,
        70,
        "The bucket sum should be updated to 70 (100 - 30)",
      );

      const finalCountReport = await engine.getReport({
        ...baseQuery,
        reportId: report._id.toString(),
        metric: { type: AggregationType.COUNT },
      });
      targetBucket = finalCountReport.find(
        (r) => r.timestamp.getTime() === targetBucketTime.getTime(),
      );
      assertExists(targetBucket, "The target count bucket should still exist");
      assertEquals(
        targetBucket.value,
        3,
        "The bucket count should be updated to 3",
      );
    },
  );

  await engine.aggregator?.stop();
});
