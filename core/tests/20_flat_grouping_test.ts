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
    granularity: "minute", // Set a storage granularity
  });

  await engine.AggregationSourceModel.create({
    reportId: report._id,
    targetCollection: "aggr_test",
    filter: {
      sources: [{ name: "TestSource", id: source.getDefinition().id! }],
      events: ["test_event"],
    },
    granularity: "hour", // Set a storage granularity
  });

  const time1 = new Date("2025-10-16T10:00:00.000Z");
  const time2 = new Date("2025-10-16T10:01:00.000Z");

  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: { amount: 100, company: "A", region: "US", department: "Sales" },
    timestamp: time1,
  });
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: { amount: 200, company: "A", region: "EU", department: "Sales" },
    timestamp: time2,
  });
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: {
      amount: 300,
      company: "B",
      region: "US",
      department: "Engineering",
    },
    timestamp: time1,
  });

  await engine.aggregator.flush();

  await t.step(
    "should correctly return dataset with 2 levels of flat grouped data",
    async () => {
      const query: IFlatGroupsAggregationQuery = {
        reportId: report._id.toString(),
        metrics: ["amount"],
        groupBy: ["company", "region"],
        timeRange: {
          start: new Date("2025-10-16T09:00:00.000Z"),
          end: new Date("2025-10-16T11:00:00.000Z"),
        },
        granularity: "hour",
      };

      const result: any[] = await engine.getFlatGroupsAggregation(query);

      assertEquals(
        result.length,
        5,
        "Expected 5 total items in the flattened list",
      );
    },
  );

  await t.step(
    "should correctly return dataset with 3 levels of flat grouped data",
    async () => {
      const query: IFlatGroupsAggregationQuery = {
        reportId: report._id.toString(),
        metrics: ["amount"],
        groupBy: ["company", "region", "department"],
        timeRange: {
          start: new Date("2025-10-16T09:00:00.000Z"),
          end: new Date("2025-10-16T11:00:00.000Z"),
        },
        granularity: "hour",
      };

      const result: any[] = await engine.getFlatGroupsAggregation(query);

      assertEquals(
        result.length,
        8,
        "Expected 8 total items in the flattened list",
      );
    },
  );

  await t.step(
    "should correctly group by granularity",
    async () => {
      const query: IFlatGroupsAggregationQuery = {
        reportId: report._id.toString(),
        metrics: ["amount"],
        groupBy: ["company"],
        groupByGranularity: ["hour", "minute"],
        timeRange: {
          start: new Date("2025-10-16T09:00:00.000Z"),
          end: new Date("2025-10-16T11:00:00.000Z"),
        },
        granularity: "minute", // This is not used when groupByGranularity is present
      };

      const result: any[] = await engine.getFlatGroupsAggregation(query);

      assertEquals(
        result.length,
        6,
        "Expected 6 total items in the flattened list",
      );

      // Hour level
      const hourGroup = result.find((r) =>
        r.granularity === "hour" && r.$group_level === 0
      );
      assertExists(hourGroup, "Hour granularity group should exist");
      assertEquals(
        hourGroup.amount,
        600,
        "Hour group total amount should be 600",
      );

      const companyA_hour = result.find((r) =>
        r.granularity === "hour" && r.company === "A" && r.$group_level === 1
      );
      assertExists(companyA_hour, "Company A hour group should exist");
      assertEquals(
        companyA_hour.amount,
        300,
        "Company A hour amount should be 300",
      );

      // Minute level
      const minuteGroup = result.find((r) =>
        r.granularity === "minute" && r.$group_level === 0
      );
      assertExists(minuteGroup, "Minute granularity group should exist");
      assertEquals(
        minuteGroup.amount,
        600,
        "Minute group total amount should be 600",
      );

      const companyA_minute = result.find((r) =>
        r.granularity === "minute" && r.company === "A" && r.$group_level === 1
      );
      assertExists(companyA_minute, "Company A minute group should exist");
      assertEquals(
        companyA_minute.amount,
        300,
        "Company A minute amount should be 300",
      );
    },
  );

  await teardown();
});
