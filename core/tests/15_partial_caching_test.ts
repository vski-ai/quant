import { assertEquals, assertExists } from "@std/assert";
import { AggregationType, IQuery } from "../mod.ts";
import { withTestDatabase } from "./utils.ts";
import { delay } from "@std/async/delay";

const dbName = "partial_cache_hits_test_db";

withTestDatabase({
  dbName,
  engineConfig: {
    cache: { enabled: true, partialHits: true, ttlSeconds: 60 },
  },
}, async (t, engine, teardown) => {
  // --- 1. SETUP ---
  const source = await engine.createEventSource({
    name: "PartialCacheSource",
    eventTypes: [{ name: "partial_event" }],
  });

  const report = await engine.createReport({
    name: "Partial Cache Report",
    active: true,
  });

  const aggregationSource = await engine.addAggregationSource(
    report._id.toString(),
    {
      targetCollection: "aggr_partial_cache",
      filter: {
        sources: [{
          name: source.getDefinition().name,
          id: source.getDefinition().id!,
        }],
        events: ["partial_event"],
      },
    },
  );

  await delay(1000); // Wait for aggregator to pick up config

  // Record events in three distinct time chunks (Day 1, Day 3, Day 5)
  const day1 = new Date("2024-01-01T10:00:00.000Z");
  const day3 = new Date("2024-01-03T10:00:00.000Z");
  const day5 = new Date("2024-01-05T10:00:00.000Z");

  await source.record({
    uuid: "day1-event",
    eventType: "partial_event",
    payload: { value: 10 },
    timestamp: day1,
  });
  await source.record({
    uuid: "day3-event",
    eventType: "partial_event",
    payload: { value: 30 },
    timestamp: day3,
  });
  await source.record({
    uuid: "day5-event",
    eventType: "partial_event",
    payload: { value: 50 },
    timestamp: day5,
  });

  await delay(1500); // Wait for aggregation

  const baseQuery: Omit<IQuery, "timeRange"> = {
    reportId: report._id.toString(),
    metric: { type: AggregationType.SUM, field: "value" },
    granularity: "day",
    cache: true, // Opt-in to caching
  };

  await t.step(
    "should use partial cache hits to fulfill a larger query",
    async () => {
      await engine.ReportCacheModel.deleteMany({});

      // --- 2. Populate Cache with Chunks ---
      // Query for Day 1 to cache it.
      const reportDay1 = await engine.getReport({
        ...baseQuery,
        timeRange: {
          start: new Date("2024-01-01T00:00:00Z"),
          end: new Date("2024-01-01T23:59:59Z"),
        },
      });
      assertEquals(reportDay1[0].value, 10);

      // Query for Day 3 to cache it.
      const reportDay3 = await engine.getReport({
        ...baseQuery,
        timeRange: {
          start: new Date("2024-01-03T00:00:00Z"),
          end: new Date("2024-01-03T23:59:59Z"),
        },
      });
      assertEquals(reportDay3[0].value, 30);

      // Verify that two separate chunks are now in the cache.
      assertEquals(
        await engine.ReportCacheModel.countDocuments({}),
        2,
        "Cache should contain two chunks",
      );

      // --- 3. Prove Partial Hit ---
      // To prove that Day 1 is served from cache, we delete its underlying data.
      // The next query should still succeed and include Day 1's data.
      const aggrModel = engine.connection.model(
        aggregationSource.targetCollection,
      );
      await aggrModel.deleteMany({
        timestamp: { $lt: new Date("2024-01-02T00:00:00Z") },
      });

      // --- 4. Query for the Full Range ---
      // This query covers cached chunks (Day 1, Day 3) and a non-cached chunk (Day 5),
      // plus empty gaps (Day 2, Day 4).
      const fullReport = await engine.getReport({
        ...baseQuery,
        timeRange: {
          start: new Date("2024-01-01T00:00:00Z"),
          end: new Date("2024-01-05T23:59:59Z"),
        },
      });

      // --- 5. Assert Final Result ---
      assertEquals(
        fullReport.length,
        3,
        "Final report should contain 3 data points (Day 1, 3, 5)",
      );

      const resultDay1 = fullReport.find((p) =>
        p.timestamp.getTime() === new Date("2024-01-01T00:00:00.000Z").getTime()
      );
      const resultDay3 = fullReport.find((p) =>
        p.timestamp.getTime() === new Date("2024-01-03T00:00:00.000Z").getTime()
      );
      const resultDay5 = fullReport.find((p) =>
        p.timestamp.getTime() === new Date("2024-01-05T00:00:00.000Z").getTime()
      );

      assertExists(resultDay1, "Data for Day 1 should be present from cache");
      assertEquals(resultDay1.value, 10);

      assertExists(resultDay3, "Data for Day 3 should be present from cache");
      assertEquals(resultDay3.value, 30);

      assertExists(
        resultDay5,
        "Data for Day 5 should be present from DB query",
      );
      assertEquals(resultDay5.value, 50);
    },
  );

  await teardown();
});
