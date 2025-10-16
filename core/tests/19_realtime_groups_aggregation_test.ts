import { assertEquals, assertExists } from "@std/assert";
import { withTestDatabase } from "./utils.ts";
import { IGroupsAggregationQuery } from "../db/GroupsAggregationQuery.ts";

const dbName = "grouping_test_db_5";

withTestDatabase(
  { dbName, bufferAgeMs: 1000 * 60 * 5 },
  async (t, engine, teardown) => {
    const source = await engine.createEventSource({
      name: "TestSource",
      eventTypes: [{ name: "test_event" }],
    });

    const report = await engine.ReportModel.create({
      name: "Grouping Report",
      active: true,
    });

    await engine.AggregationSourceModel.create({
      reportId: report._id,
      targetCollection: "aggr_test",
      filter: {
        sources: [{ name: "TestSource", id: source.getDefinition().id! }],
        events: ["test_event"],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const time1 = new Date();
    const time2 = new Date();
    const time3 = new Date();

    await source.record({
      uuid: crypto.randomUUID(),
      eventType: "test_event",
      payload: { amount: 100, category: "A", region: "US" },
      timestamp: time1,
    });
    await source.record({
      uuid: crypto.randomUUID(),
      eventType: "test_event",
      payload: { amount: 200, category: "A", region: "EU" },
      timestamp: time2,
    });
    await source.record({
      uuid: crypto.randomUUID(),
      eventType: "test_event",
      payload: { amount: 300, category: "B", region: "US" },
      timestamp: time3,
    });

    await engine.aggregator.flush();

    await t.step(
      "should correctly return dataset with grouped data from realtime buffer",
      async () => {
        const query: IGroupsAggregationQuery = {
          reportId: report._id.toString(),
          metrics: ["amount", "test_event_count"],
          groupBy: ["category", "region"],
          timeRange: {
            start: new Date("2025-10-16T09:00:00.000Z"),
            end: new Date(),
          },
          granularity: "hour",
        };

        const result = await engine.getRealtimeGroupsAggregation(query);

        assertEquals(result.length, 1, "Expected one time bucket");
        const dataPoint = result[0];

        assertExists(dataPoint);
        assertEquals(dataPoint.amount_sum, 600);
        assertEquals(dataPoint.test_event_count, 3);

        assertExists(dataPoint.group_by_category);
        assertEquals(dataPoint.group_by_category.length, 2);

        assertExists(dataPoint.group_by_region);
        assertEquals(dataPoint.group_by_region.length, 2);

        const groupA = dataPoint.group_by_category.find((g: any) =>
          g.name === "A"
        );
        assertExists(groupA);
        assertEquals(groupA.amount_sum, 300);
        assertEquals(groupA.test_event_count, 2);

        const groupB = dataPoint.group_by_category.find((g: any) =>
          g.name === "B"
        );
        assertExists(groupB);
        assertEquals(groupB.amount_sum, 300);
        assertEquals(groupB.test_event_count, 1);

        const groupUS = dataPoint.group_by_region.find((g: any) =>
          g.name === "US"
        );
        assertExists(groupUS);
        assertEquals(groupUS.amount_sum, 400);
        assertEquals(groupUS.test_event_count, 2);

        const groupEU = dataPoint.group_by_region.find((g: any) =>
          g.name === "EU"
        );
        assertExists(groupEU);
        assertEquals(groupEU.amount_sum, 200);
        assertEquals(groupEU.test_event_count, 1);
      },
    );

    await teardown();
  },
);
