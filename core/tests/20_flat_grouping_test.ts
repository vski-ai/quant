import { assertEquals, assertExists } from "@std/assert";
import { withTestDatabase } from "./utils.ts";
import { IFlatGroupsAggregationQuery } from "../db/FlatGroupsAggregationQuery.ts";

const dbName = "flat_grouping_test_db";

withTestDatabase({ dbName }, async (t, engine, teardown) => {
  const source = await engine.createEventSource({
    name: "TestSource",
    eventTypes: [{ name: "test_event" }],
  });

  const report = await engine.ReportModel.create({
    name: "Flat Grouping Report",
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
  });

  await t.step("should sort children correctly", async () => {
    const query: IFlatGroupsAggregationQuery = {
      reportId: report._id.toString(),
      metrics: ["amount"],
      groupBy: ["country", "city"],
      sortBy: "city",
      timeRange: {
        start: new Date("2025-10-16T09:00:00.000Z"),
        end: new Date("2025-10-16T11:00:00.000Z"),
      },
      granularity: "minute",
    };

    const result: any[] = await engine.getFlatGroupsAggregation(query);

    const usaGroup = result.find((r) =>
      r.country === "USA" && r.$group_level === 0
    );
    assertExists(usaGroup, "USA group not found");

    const childrenOfUsa = result.filter((r) =>
      r.$parent_id?.includes(usaGroup.id)
    );

    // Children should be sorted by city: NYC, SF
    assertEquals(childrenOfUsa.length, 2, "USA should have 2 children");
    assertEquals(
      childrenOfUsa[0].city,
      "NYC",
      "First child of USA should be NYC",
    );
    assertEquals(
      childrenOfUsa[1].city,
      "SF",
      "Second child of USA should be SF",
    );
  });

  await t.step(
    "should return correctly structured flat groups from wasm",
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
        wasm: true,
      };

      const result: any[] = await engine.getFlatGroupsAggregation(query);

      // The wasm implementation uses a different UUID generation, so we can't compare IDs directly.
      // We will check the structure and values.
      // console.log("Result ->>", result)

      assertEquals(result.length, 9, "Incorrect number of items");

      const canada = result.find((r) =>
        r.country === "Canada" && r.$group_level === 0
      );
      assertExists(canada, "Canada group not found");
      assertEquals(canada.amount, 400);

      const toronto = result.find((r) =>
        r.city === "Toronto" && r.$group_level === 1
      );
      assertExists(toronto, "Toronto group not found");
      assertEquals(toronto.amount, 400);

      const financeCanada = result.find((r) =>
        r.sector === "Finance" && r.city === "Toronto"
      );
      assertExists(financeCanada, "Finance in Toronto not found");
      assertEquals(financeCanada.amount, 400);

      const usa = result.find((r) =>
        r.country === "USA" && r.$group_level === 0
      );
      assertExists(usa, "USA group not found");
      assertEquals(usa.amount, 600);

      const nyc = result.find((r) => r.city === "NYC" && r.$group_level === 1);
      assertExists(nyc, "NYC group not found");
      assertEquals(nyc.amount, 300);

      const financeUsa = result.find((r) =>
        r.sector === "Finance" && r.city === "NYC"
      );
      assertExists(financeUsa, "Finance in NYC not found");
      assertEquals(financeUsa.amount, 100);

      const techNyc = result.find((r) =>
        r.sector === "Tech" && r.city === "NYC"
      );
      assertExists(techNyc, "Tech in NYC not found");
      assertEquals(techNyc.amount, 200);

      const sf = result.find((r) => r.city === "SF" && r.$group_level === 1);
      assertExists(sf, "SF group not found");
      assertEquals(sf.amount, 300);

      const techSf = result.find((r) => r.sector === "Tech" && r.city === "SF");
      assertExists(techSf, "Tech in SF not found");
      assertEquals(techSf.amount, 300);
    },
  );

  await teardown();
});
