import { assertEquals } from "@std/assert";
import { withTestDatabase } from "./utils.ts";
import { IFlatGroupsAggregationQuery } from "../db/FGAQuery.ts";

const dbName = "flat_grouping_buffer_test_db";

withTestDatabase({
  dbName,
  bufferAgeMs: 1000 * 60 * 60 * 24 * 360 * 10, // Long buffer age
}, async (t, engine, teardown) => {
  const source = await engine.createEventSource({
    name: "TestSource",
    eventTypes: [{ name: "test_event" }],
  });

  const report = await engine.ReportModel.create({
    name: "Flat Grouping Buffer Report",
    active: true,
  });

  await engine.AggregationSourceModel.create({
    reportId: report._id,
    targetCollection: "aggr_test_buffer",
    filter: {
      sources: [{ name: "TestSource", id: source.getDefinition().id! }],
      events: ["test_event"],
    },
    granularity: "minute",
  });

  // Wait for aggregator to pick up the new source
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const time = new Date("2025-10-16T10:00:00.000Z");

  // Record hierarchical data
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: { amount: 100, country: "USA", city: "NYC", sector: "Finance" },
    timestamp: time,
  });
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: { amount: 200, country: "USA", city: "NYC", sector: "Tech" },
    timestamp: time,
  });
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: { amount: 300, country: "USA", city: "SF", sector: "Tech" },
    timestamp: time,
  });
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: {
      amount: 400,
      country: "Canada",
      city: "Toronto",
      sector: "Finance",
    },
    timestamp: time,
  });

  // Give buffer time to process
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await t.step(
    "should return correctly structured flat groups from buffer",
    async () => {
      const query: IFlatGroupsAggregationQuery = {
        reportId: report._id.toString(),
        metrics: ["amount"],
        groupBy: ["country", "city", "sector"],
        timeRange: {
          start: new Date("2025-10-16T09:00:00.000Z"),
          end: new Date("2025-10-16T11:00:00.000Z"),
        },
        granularity: "minute",
      };

      // This will query the buffer since we haven't flushed
      const result: any[] = await engine.getRealtimeFlatGroupsAggregation(
        query,
      );

      const expected = [
        // Level 0: country
        {
          id: "ji-1",
          $parent_id: null,
          country: "Canada",
          city: null,
          sector: null,
          amount: 400,
          $group_level: 0,
        },
        // Level 1: city (Canada)
        {
          id: "ji-2",
          $parent_id: ["ji-1"],
          country: "Canada",
          city: "Toronto",
          sector: null,
          amount: 400,
          $group_level: 1,
        },
        // Level 2: sector (Toronto)
        {
          id: "ji-3",
          $parent_id: ["ji-1", "ji-2"],
          country: "Canada",
          city: "Toronto",
          sector: "Finance",
          amount: 400,
          $group_level: 2,
        },
        // Level 0: country
        {
          id: "ji-4",
          $parent_id: null,
          country: "USA",
          city: null,
          sector: null,
          amount: 600,
          $group_level: 0,
        },
        // Level 1: city (USA)
        {
          id: "ji-5",
          $parent_id: ["ji-4"],
          country: "USA",
          city: "NYC",
          sector: null,
          amount: 300,
          $group_level: 1,
        },
        // Level 2: sector (NYC)
        {
          id: "ji-6",
          $parent_id: ["ji-4", "ji-5"],
          country: "USA",
          city: "NYC",
          sector: "Finance",
          amount: 100,
          $group_level: 2,
        },
        {
          id: "ji-7",
          $parent_id: ["ji-4", "ji-5"],
          country: "USA",
          city: "NYC",
          sector: "Tech",
          amount: 200,
          $group_level: 2,
        },
        // Level 1: city (USA)
        {
          id: "ji-8",
          $parent_id: ["ji-4"],
          country: "USA",
          city: "SF",
          sector: null,
          amount: 300,
          $group_level: 1,
        },
        // Level 2: sector (SF)
        {
          id: "ji-9",
          $parent_id: ["ji-4", "ji-8"],
          country: "USA",
          city: "SF",
          sector: "Tech",
          amount: 300,
          $group_level: 2,
        },
      ];

      assertEquals(result.length, expected.length, "Incorrect number of items");

      for (let i = 0; i < expected.length; i++) {
        const res = result[i];
        const exp = expected[i];
        assertEquals(res.id, exp.id, `Item ${i} ID mismatch`);
        assertEquals(
          res.$parent_id,
          exp.$parent_id,
          `Item ${i} parent ID mismatch`,
        );
        assertEquals(res.country, exp.country, `Item ${i} country mismatch`);
        assertEquals(res.city, exp.city, `Item ${i} city mismatch`);
        assertEquals(res.sector, exp.sector, `Item ${i} sector mismatch`);
        assertEquals(res.amount, exp.amount, `Item ${i} amount mismatch`);
        assertEquals(
          res.$group_level,
          exp.$group_level,
          `Item ${i} group level mismatch`,
        );
      }
    },
  );

  await teardown();
});
