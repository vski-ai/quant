import { assertEquals, assertExists } from "@std/assert";
import { AggregationType, IAnalyticsQuery } from "../mod.ts";
import { withTestDatabase } from "./utils.ts";
import {
  getPartitionedCollectionName,
  getPartitionedCollectionNames,
} from "../db/Partition.ts";

const dbName = "partitioning_test_db";

// Test utility functions in isolation
Deno.test("Partitioning utility functions", () => {
  const prefix = "test_aggr";
  const granularity = "minute";
  const length = 10; // Each partition spans 10 minutes

  const date1 = new Date("2023-01-01T12:05:00.000Z"); // Should be in bucket floor(1672574700000 / 600000) = 2787624
  assertEquals(
    getPartitionedCollectionName(prefix, date1, granularity, length),
    "test_aggr_2787624",
  );

  const date2 = new Date("2023-01-01T12:09:00.000Z"); // Same bucket
  assertEquals(
    getPartitionedCollectionName(prefix, date2, granularity, length),
    "test_aggr_2787624",
  );

  const date3 = new Date("2023-01-01T12:10:00.000Z"); // Next bucket: floor(1672575000000 / 600000) = 2787625
  assertEquals(
    getPartitionedCollectionName(prefix, date3, granularity, length),
    "test_aggr_2787625",
  );

  const timeRange = {
    start: date1, // Bucket 2787624
    end: date3, // Bucket 2787625
  };

  const names = getPartitionedCollectionNames(
    prefix,
    timeRange,
    granularity,
    length,
  );
  assertEquals(names.length, 2);
  assertEquals(names.includes("test_aggr_2787624"), true);
  assertEquals(names.includes("test_aggr_2787625"), true);
});

withTestDatabase({ dbName }, async (t, engine) => {
  // --- SETUP ---
  const source = await engine.createEventSource({
    name: "PartitionTestSource",
    eventTypes: [{ name: "partition_event" }],
  });

  const report = await engine.createReport({
    name: "Partition Test Report",
    active: true,
  });

  const targetCollectionPrefix = "aggr_partitioned_events";
  const partitionGranularity = "minute";
  const partitionLength = 10; // 10 minutes per partition

  await engine.addAggregationSource(report._id.toString(), {
    targetCollection: targetCollectionPrefix,
    granularity: partitionGranularity,
    filter: {
      sources: [{
        name: "PartitionTestSource",
        id: source.getDefinition().id!,
      }],
      events: ["partition_event"],
    },
    partition: {
      enabled: true,
      length: partitionLength,
    },
  });

  // Record events that span multiple partitions
  const baseTime = new Date("2023-10-26T10:30:00.000Z");
  const events = [
    { timestamp: new Date("2023-10-26T10:29:00.000Z"), amount: 10 }, // Bucket A
    { timestamp: new Date("2023-10-26T10:25:00.000Z"), amount: 20 }, // Bucket A
    { timestamp: new Date("2023-10-26T10:19:00.000Z"), amount: 30 }, // Bucket B
    { timestamp: new Date("2023-10-26T10:08:00.000Z"), amount: 40 }, // Bucket C
  ];

  for (const event of events) {
    await source.record(
      crypto.randomUUID(),
      "partition_event",
      { amount: event.amount },
      undefined,
      event.timestamp,
    );
  }

  // Give aggregator time to process without buffer
  await new Promise((resolve) => setTimeout(resolve, 5000));

  await t.step(
    "should write aggregations to correct partitioned collections",
    async () => {
      // Check that documents exist in the correct collections
      const collNameA = getPartitionedCollectionName(
        targetCollectionPrefix,
        events[0].timestamp,
        partitionGranularity,
        partitionLength,
      );
      const collNameB = getPartitionedCollectionName(
        targetCollectionPrefix,
        events[2].timestamp,
        partitionGranularity,
        partitionLength,
      );

      const countInA = await engine.connection.db!.collection(collNameA)
        .countDocuments();
      const countInB = await engine.connection.db!.collection(collNameB)
        .countDocuments();

      // Each event generates multiple metrics (count, sum, etc.)
      assertExists(countInA > 1, `Expected metrics in collection ${collNameA}`);
      assertExists(countInB > 0, `Expected metrics in collection ${collNameB}`);
    },
  );

  await t.step(
    "should query across multiple partitions correctly",
    async () => {
      const query: IAnalyticsQuery = {
        reportId: report._id.toString(),
        metric: { type: AggregationType.SUM, field: "amount" },
        timeRange: {
          start: new Date("2023-10-26T10:00:00.000Z"),
          end: baseTime,
        },
        granularity: "hour",
      };

      const reportResult = await engine.getReport(query);
      console.log(reportResult);
      assertEquals(
        reportResult.length,
        1,
        "Expected one time bucket for the report",
      );
      assertEquals(
        reportResult[0].value,
        100,
        "Total sum should be 100 (10+20+30+40)",
      );
    },
  );
});
