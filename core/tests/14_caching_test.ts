import { assertEquals, assertExists, assertNotEquals } from "@std/assert";
import {
  AggregationType,
  IDatasetQuery,
  IQuery,
  IReportDataPoint,
} from "../mod.ts";
import { withTestDatabase, withTestEngine } from "./utils.ts";
import { delay } from "@std/async/delay";

const dbName = "caching_layer_test_db";

withTestDatabase({
  dbName,
  engineConfig: {
    cache: { enabled: true, ttlSeconds: 2 }, // Short TTL for testing expiration
  },
}, async (t, engine, teardown) => {
  // --- 1. SETUP ---
  const source = await engine.createEventSource({
    name: "CachingTestSource",
    eventTypes: [{ name: "cached_event" }],
  });

  const report = await engine.createReport({
    name: "Caching Test Report",
    active: true,
  });

  const aggregationSource = await engine.addAggregationSource(
    report._id.toString(),
    {
      targetCollection: "aggr_caching_events",
      filter: {
        sources: [{
          name: source.getDefinition().name,
          id: source.getDefinition().id!,
        }],
        events: ["cached_event"],
      },
    },
  );

  // Wait for aggregator to pick up the new config
  await delay(1000);

  // Record some events
  await source.record({
    uuid: "cache-event-1",
    eventType: "cached_event",
    payload: { value: 100 },
  });
  await source.record({
    uuid: "cache-event-2",
    eventType: "cached_event",
    payload: { value: 50 },
  });

  // Wait for aggregation to complete
  await delay(1500);

  const timeRange = {
    start: new Date(Date.now() - 5 * 60 * 1000),
    end: new Date(),
  };

  const baseQuery: IQuery = {
    reportId: report._id.toString(),
    metric: { type: AggregationType.SUM, field: "value" },
    timeRange,
    granularity: "minute",
  };

  await t.step(
    "getReport: should miss cache on first call and hit on second call",
    async () => {
      // Ensure cache is empty before starting
      await engine.ReportCacheModel.deleteMany({});
      assertEquals(await engine.ReportCacheModel.countDocuments(), 0);

      // 1. First call (cache miss)
      const result1 = await engine.getReport(baseQuery);
      assertEquals(result1.length, 1);
      assertEquals(result1[0].value, 150);

      // Verify that the result is now in the cache
      assertEquals(
        await engine.ReportCacheModel.countDocuments({}),
        1,
        "Result should be cached after first call",
      );

      // To prove the next call is a cache hit, we'll delete the underlying data.
      // If the next query succeeds, it must have come from the cache.
      const aggrModel = engine.connection.model(
        aggregationSource.targetCollection,
      );
      await aggrModel.deleteMany({});

      // 2. Second call (cache hit)
      const result2 = await engine.getReport(baseQuery);
      assertEquals(result2.length, 1, "Should still get a result from cache");
      assertEquals(result2[0].value, 150, "Cached result should be the same");
      assertEquals(
        await engine.ReportCacheModel.countDocuments({}),
        1,
        "Cache count should not increase on hit",
      );
    },
  );

  await t.step(
    "getReport: should force a cache rebuild when rebuildCache is true",
    async () => {
      // Cache should still contain the result from the previous test.
      assertEquals(await engine.ReportCacheModel.countDocuments({}), 1);

      // The underlying data is gone, so a rebuild should yield an empty result.
      const rebuiltResult = await engine.getReport({
        ...baseQuery,
        rebuildCache: true,
      });
      assertEquals(
        rebuiltResult.length,
        0,
        "Rebuilt result should be empty as underlying data is gone",
      );

      // Verify the cache was updated with the new, empty result.
      const cachedDoc = await engine.ReportCacheModel.findOne().lean();
      assertExists(cachedDoc);
      assertEquals(
        cachedDoc.data,
        [],
        "Cache should be updated with the new empty result",
      );
    },
  );

  await t.step("getReport: should expire cache entry after TTL", async () => {
    // Clean up any old data from previous tests
    const aggrModel = engine.connection.model(
      aggregationSource.targetCollection,
    );
    await aggrModel.deleteMany({});
    await engine.ReportCacheModel.deleteMany({});

    // Record an event to populate data and the cache
    await source.record({
      uuid: "ttl-event-1",
      eventType: "cached_event",
      payload: { value: 150 },
    });
    await delay(1500); // Wait for aggregation

    // Use a fresh query
    const ttlTestQuery: IQuery = {
      ...baseQuery,
      timeRange: {
        start: new Date(timeRange.start.getTime() - 60000),
        end: new Date(timeRange.end.getTime() + 60000),
      },
    };

    // Run a query to populate the cache
    const result1 = await engine.getReport(ttlTestQuery);
    assertEquals(result1[0].value, 150, "Initial report value should be 150");
    assertEquals(
      await engine.ReportCacheModel.countDocuments({}),
      1,
      "Cache should be populated",
    );

    await delay(2100); // Wait just over the 2s TTL

    // To prove expiration, we'll record a new event. If the cache was correctly missed,
    // the new report will include this new value.
    await source.record({
      uuid: "ttl-event-2",
      eventType: "cached_event",
      payload: { value: 849 },
    });
    await delay(1500);
    const resultAfterTTL = await engine.getReport(ttlTestQuery);
    assertEquals(
      resultAfterTTL[0].value,
      999,
      "Should get fresh data (150 + 849) after cache TTL expires, indicating a cache miss.",
    );
  });

  await t.step(
    "getDataset: should also use the caching layer correctly",
    async () => {
      await engine.connection.model(aggregationSource.targetCollection)
        .deleteMany({});
      // Re-add the underlying data for this test
      await source.record({
        uuid: "cache-event-3",
        eventType: "cached_event",
        payload: { value: 200 },
      });
      await delay(1500);

      const datasetQuery: IDatasetQuery = {
        reportId: report._id.toString(),
        timeRange,
        granularity: "hour",
      };

      // Ensure cache is empty
      await engine.ReportCacheModel.deleteMany({});
      assertEquals(await engine.ReportCacheModel.countDocuments(), 0);

      // 1. First call (cache miss)
      const dsResult1 = await engine.getDataset(datasetQuery);
      assertEquals(dsResult1.length, 1);
      assertEquals(dsResult1[0].value_sum, 200);
      assertEquals(
        await engine.ReportCacheModel.countDocuments({}),
        1,
        "Dataset result should be cached",
      );

      // 2. Second call (cache hit)
      const dsResult2 = await engine.getDataset(datasetQuery);
      assertEquals(dsResult2.length, 1);
      assertEquals(dsResult2[0].value_sum, 200);
      assertEquals(
        await engine.ReportCacheModel.countDocuments({}),
        1,
        "Cache count should not increase on dataset hit",
      );
    },
  );

  await t.step(
    "getReport: should generate different cache keys for different queries",
    async () => {
      await engine.ReportCacheModel.deleteMany({});

      // Query 1
      await engine.getReport(baseQuery);
      assertEquals(await engine.ReportCacheModel.countDocuments({}), 1);

      // Query 2 (different granularity)
      const query2 = { ...baseQuery, granularity: "hour" as const };
      await engine.getReport(query2);
      assertEquals(
        await engine.ReportCacheModel.countDocuments({}),
        2,
        "Different query should create a new cache entry",
      );

      // Query 3 (different time range)
      const query3 = {
        ...baseQuery,
        timeRange: { start: new Date(0), end: new Date() },
      };
      await engine.getReport(query3);
      assertEquals(
        await engine.ReportCacheModel.countDocuments({}),
        3,
        "Different time range should create a new cache entry",
      );
    },
  );
  await teardown();
});

withTestDatabase({
  dbName: "controlled_caching_test_db",
  engineConfig: {
    // Enable caching in "controlled" mode
    cache: { enabled: true, controlled: true, ttlSeconds: 10 },
  },
}, async (t, engine, teardown) => {
  // --- 1. SETUP ---
  const source = await engine.createEventSource({
    name: "ControlledCacheSource",
    eventTypes: [{ name: "controlled_event" }],
  });
  const report = await engine.createReport({
    name: "Controlled Cache Report",
    active: true,
  });
  const aggregationSource = await engine.addAggregationSource(
    report._id.toString(),
    {
      targetCollection: "aggr_controlled_cache",
      filter: {
        sources: [{
          name: source.getDefinition().name,
          id: source.getDefinition().id!,
        }],
        events: ["controlled_event"],
      },
    },
  );
  await delay(1000);
  await source.record({
    uuid: "controlled-event-1",
    eventType: "controlled_event",
    payload: { value: 500 },
  });
  await delay(1500);

  const baseQuery: IQuery = {
    reportId: report._id.toString(),
    metric: { type: AggregationType.SUM, field: "value" },
    timeRange: { start: new Date(Date.now() - 5 * 60 * 1000), end: new Date() },
    granularity: "minute",
  };

  await t.step(
    "should NOT cache queries by default in controlled mode",
    async () => {
      await engine.ReportCacheModel.deleteMany({});
      const result1 = await engine.getReport(baseQuery);
      assertEquals(result1[0].value, 500);
      assertEquals(
        await engine.ReportCacheModel.countDocuments({}),
        0,
        "Cache should be empty after a default query",
      );
    },
  );

  await t.step(
    "should cache queries when `cache: true` is specified",
    async () => {
      await engine.ReportCacheModel.deleteMany({});
      const queryWithCache = { ...baseQuery, cache: true };

      const result1 = await engine.getReport(queryWithCache);
      assertEquals(result1[0].value, 500);
      assertEquals(
        await engine.ReportCacheModel.countDocuments({}),
        1,
        "Cache should contain one document",
      );

      const aggrModel = engine.connection.model(
        aggregationSource.targetCollection,
      );
      await aggrModel.deleteMany();

      const result2 = await engine.getReport(queryWithCache);
      assertEquals(result2[0].value, 500, "Cached result should be correct");
    },
  );

  await teardown();
});
