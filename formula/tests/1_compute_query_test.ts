import { assertEquals, assertExists } from "@std/assert";
import { withTestDatabase } from "@/core//tests/utils.ts";
import { IFlatGroupsAggregationQuery } from "@/core/db/FGAQuery.ts";
import { FormulaPlugin } from "../core.plugin.ts";

const dbName = "formula_compute_test_db";

withTestDatabase({ dbName }, async (t, engine, teardown) => {
  engine.registerPlugin(new FormulaPlugin());

  const source = await engine.createEventSource({
    name: "TestSource",
    eventTypes: [{ name: "test_event" }],
  });

  const report = await engine.ReportModel.create({
    name: "Formula Compute Report",
    active: true,
  });

  await engine.AggregationSourceModel.create({
    reportId: report._id,
    targetCollection: "aggr_test",
    filter: {
      sources: [{ name: "TestSource", id: source.getDefinition().id! }],
      events: ["test_event"],
    },
    granularity: "minute",
  });

  const time = new Date("2025-10-16T10:00:00.000Z");

  // More complex hierarchical data
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

  await engine.aggregator.flush();

  await t.step("should return correctly structured flat groups", async () => {
    const query: IFlatGroupsAggregationQuery = {
      reportId: report._id.toString(),
      metrics: ["amount"],
      groupBy: ["country", "city", "sector"],
      timeRange: {
        start: new Date("2025-10-16T09:00:00.000Z"),
        end: new Date("2025-10-16T11:00:00.000Z"),
      },
      granularity: "minute",
      compute: {
        amount_net: "amount * 0.75",
        amount_tax: "amount * 0.25",
        amount_some: "amount * 0.0367546",
      },
    };

    const result: any[] = await engine.getFlatGroupsAggregation(query);

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
        amount_net: 300,
        amount_tax: 100,
        amount_some: 14.701839999999999,
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
        amount_net: 300,
        amount_tax: 100,
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
        amount_net: 300,
        amount_tax: 100,
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
        amount_net: 450,
        amount_tax: 150,
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
        amount_net: 225,
        amount_tax: 75,
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
        amount_net: 75,
        amount_tax: 25,
      },
      {
        id: "ji-7",
        $parent_id: ["ji-4", "ji-5"],
        country: "USA",
        city: "NYC",
        sector: "Tech",
        amount: 200,
        $group_level: 2,
        amount_net: 150,
        amount_tax: 50,
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
        amount_net: 225,
        amount_tax: 75,
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
        amount_net: 225,
        amount_tax: 75,
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
      assertEquals(res.amount_net, exp.amount_net, `Item ${i} amount mismatch`);
      assertEquals(
        res.$group_level,
        exp.$group_level,
        `Item ${i} group level mismatch`,
      );
    }
  });

  await teardown();
});
