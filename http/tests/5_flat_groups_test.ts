import { assertEquals, assertExists } from "@std/assert";
import { withTestApi } from "./utils.ts";
import { delay } from "@std/async/delay";

const dbName = "http_flat_grouping_test_db";

withTestApi(
  { dbName, bufferAgeMs: 1000 * 60 * 60 * 24 * 360 * 10 },
  async (t, { engine, client }) => {
    const { data: source } = await client.postApiEventSources({
      body: {
        name: "TestSource",
        eventTypes: [{ name: "test_event" }],
      },
    });
    assertExists(source);

    const { data: report } = await client.postApiReports({
      body: {
        name: "Flat Grouping Report",
        active: true,
      },
    });
    assertExists(report);

    await client.postApiAggregationSources(
      {
        query: {
          reportId: report.id,
        },
        body: {
          targetCollection: "aggr_test",
          filter: {
            sources: [{ name: "TestSource", id: source.id! }],
            events: ["test_event"],
          },
          granularity: "minute" as any,
        },
      },
    );

    const time = new Date("2025-10-16T10:00:00.000Z");

    // More complex hierarchical data
    await client.postApiEventsSourceIdEvents({
      path: { sourceId: source.id },
      body: {
        uuid: crypto.randomUUID(),
        type: "test_event",
        payload: {
          amount: 100,
          country: "USA",
          city: "NYC",
          sector: "Finance",
        },
        timestamp: time.toISOString(),
      },
    });
    await client.postApiEventsSourceIdEvents({
      path: { sourceId: source.id },
      body: {
        uuid: crypto.randomUUID(),
        type: "test_event",
        payload: { amount: 200, country: "USA", city: "NYC", sector: "Tech" },
        timestamp: time.toISOString(),
      },
    });
    await client.postApiEventsSourceIdEvents({
      path: { sourceId: source.id },
      body: {
        uuid: crypto.randomUUID(),
        type: "test_event",
        payload: { amount: 300, country: "USA", city: "SF", sector: "Tech" },
        timestamp: time.toISOString(),
      },
    });
    await client.postApiEventsSourceIdEvents({
      path: { sourceId: source.id },
      body: {
        uuid: crypto.randomUUID(),
        type: "test_event",
        payload: {
          amount: 400,
          country: "Canada",
          city: "Toronto",
          sector: "Finance",
        },
        timestamp: time.toISOString(),
      },
    });

    await engine.aggregator.flush();
    await delay(3000);

    await t.step("should return correctly structured flat groups", async () => {
      const query = {
        metrics: ["amount"],
        groupBy: ["country", "city", "sector"],
        timeRange: {
          start: new Date("2025-10-16T09:00:00.000Z"),
          end: new Date("2025-10-16T11:00:00.000Z"),
        },
        granularity: "minute" as any,
      } as any;
      const clientQuery = {
        ...query,
        timeRange: {
          start: query.timeRange.start.toISOString(),
          end: query.timeRange.end.toISOString(),
        },
      };

      const { data: result } = await client.postApiReportsIdFlatGroups({
        path: { id: report.id },
        body: clientQuery,
      });
      assertExists(result);

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

    await t.step(
      "should return correctly structured flat groups from buffer",
      async () => {
        const query = {
          metrics: ["amount"],
          groupBy: ["country", "city", "sector"],
          timeRange: {
            start: new Date("2025-10-16T09:00:00.000Z"),
            end: new Date("2025-10-16T11:00:00.000Z"),
          },
          granularity: "minute" as any,
        } as any;

        const clientQuery = {
          ...query,
          timeRange: {
            start: query.timeRange.start.toISOString(),
            end: query.timeRange.end.toISOString(),
          },
        };

        const { data: result } = await client
          .postApiReportsIdRealtimeFlatGroups(
            {
              path: { id: report.id },
              body: clientQuery,
            },
          );
        assertExists(result);

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

        assertEquals(
          result.length,
          expected.length,
          "Incorrect number of items",
        );

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
  },
);
