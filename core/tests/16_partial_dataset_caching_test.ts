import { assertEquals, assertExists } from "@std/assert";
import { IDatasetQuery } from "../mod.ts";
import { withTestDatabase } from "./utils.ts";
import { delay } from "@std/async/delay";

const dbName = "partial_dataset_cache_hits_test_db";

withTestDatabase({
  dbName,
  engineConfig: {
    cache: { enabled: true, partialHits: true, ttlSeconds: 60 },
  },
}, async (t, engine, teardown) => {
  // --- 1. SETUP ---
  const source = await engine.createEventSource({
    name: "PartialDatasetCacheSource",
    eventTypes: [{ name: "sale_event" }],
  });

  const report = await engine.createReport({
    name: "Partial Dataset Cache Report",
    active: true,
  });

  const aggregationSource = await engine.addAggregationSource(
    report._id.toString(),
    {
      targetCollection: "aggr_partial_dataset_cache",
      filter: {
        sources: [{
          name: source.getDefinition().name,
          id: source.getDefinition().id!,
        }],
        events: ["sale_event"],
      },
    },
  );

  await delay(1000); // Wait for aggregator to pick up config

  // Record events with multiple metrics in three distinct time chunks
  const day1 = new Date("2024-02-01T10:00:00.000Z");
  const day3 = new Date("2024-02-03T10:00:00.000Z");
  const day5 = new Date("2024-02-05T10:00:00.000Z");

  await source.record({
    uuid: "day1-sale",
    eventType: "sale_event",
    payload: { amount: 10, items: 1 },
    timestamp: day1,
  });
  await source.record({
    uuid: "day3-sale",
    eventType: "sale_event",
    payload: { amount: 30, items: 3 },
    timestamp: day3,
  });
  await source.record({
    uuid: "day5-sale",
    eventType: "sale_event",
    payload: { amount: 50, items: 5 },
    timestamp: day5,
  });

  await delay(1500); // Wait for aggregation

  const baseQuery: Omit<IDatasetQuery, "timeRange"> = {
    reportId: report._id.toString(),
    granularity: "day",
    cache: true, // Opt-in to caching
  };

  await t.step(
    "should use partial dataset cache hits to fulfill a larger query",
    async () => {
      await engine.ReportCacheModel.deleteMany({});

      // --- 2. Populate Cache with Chunks ---
      // Query for Day 1 to cache it.
      const datasetDay1 = await engine.getDataset({
        ...baseQuery,
        timeRange: {
          start: new Date("2024-02-01T00:00:00Z"),
          end: new Date("2024-02-01T23:59:59Z"),
        },
      });
      console.log("datasetDay1", datasetDay1);
      assertEquals(datasetDay1[0].amount_sum, 10);
      assertEquals(datasetDay1[0].items_sum, 1);

      // Query for Day 3 to cache it.
      const datasetDay3 = await engine.getDataset({
        ...baseQuery,
        timeRange: {
          start: new Date("2024-02-03T00:00:00Z"),
          end: new Date("2024-02-03T23:59:59Z"),
        },
      });
      assertEquals(datasetDay3[0].amount_sum, 30);
      assertEquals(datasetDay3[0].items_sum, 3);

      // Verify that two separate chunks are now in the cache.
      assertEquals(
        await engine.ReportCacheModel.countDocuments({}),
        2,
        "Cache should contain two dataset chunks",
      );

      // --- 3. Prove Partial Hit ---
      // To prove that Day 1 is served from cache, we delete its underlying data.
      const aggrModel = engine.connection.model(
        aggregationSource.targetCollection,
      );
      await aggrModel.deleteMany({
        timestamp: { $lt: new Date("2024-02-02T00:00:00Z") },
      });

      // --- 4. Query for the Full Range ---
      // This query covers cached chunks (Day 1, Day 3) and a non-cached chunk (Day 5).
      const fullDataset = await engine.getDataset({
        ...baseQuery,
        timeRange: {
          start: new Date("2024-02-01T00:00:00Z"),
          end: new Date("2024-02-05T23:59:59Z"),
        },
      });

      // --- 5. Assert Final Result ---
      assertEquals(
        fullDataset.length,
        3,
        "Final dataset should contain 3 data points (Day 1, 3, 5)",
      );

      const resultDay1 = fullDataset.find((p) =>
        p.timestamp.getTime() === new Date("2024-02-01T00:00:00.000Z").getTime()
      );
      const resultDay3 = fullDataset.find((p) =>
        p.timestamp.getTime() === new Date("2024-02-03T00:00:00.000Z").getTime()
      );
      const resultDay5 = fullDataset.find((p) =>
        p.timestamp.getTime() === new Date("2024-02-05T00:00:00.000Z").getTime()
      );

      assertExists(resultDay1, "Data for Day 1 should be present from cache");
      assertEquals(resultDay1.amount_sum, 10);
      assertEquals(resultDay1.items_sum, 1);

      assertExists(resultDay3, "Data for Day 3 should be present from cache");
      assertEquals(resultDay3.amount_sum, 30);
      assertEquals(resultDay3.items_sum, 3);

      assertExists(
        resultDay5,
        "Data for Day 5 should be present from DB query",
      );
      assertEquals(resultDay5.amount_sum, 50);
      assertEquals(resultDay5.items_sum, 5);
    },
  );

  await teardown();
});
