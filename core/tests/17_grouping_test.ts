import { assertEquals, assertExists } from "@std/assert";
import { AggregationType, IDatasetQuery, IQuery } from "../mod.ts";
import { withTestDatabase } from "./utils.ts";

const dbName = "grouping_test_db_2"; // Use a new DB name to avoid conflicts

withTestDatabase({ dbName }, async (t, engine, teardown) => {
  // --- SETUP PHASE ---
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

  await new Promise((resolve) => setTimeout(resolve, 1000)); // allow aggregator to pick up new source

  const time1 = new Date("2025-10-16T10:00:00.000Z");
  const time2 = new Date("2025-10-16T10:01:00.000Z");
  const time3 = new Date("2025-10-16T10:02:00.000Z");

  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: { amount: 100, category: "A" },
    timestamp: time1,
  });
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: { amount: 200, category: "A" },
    timestamp: time2,
  });
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: { amount: 300, category: "B" },
    timestamp: time3,
  });

  await new Promise((resolve) => setTimeout(resolve, 2000)); // Give time for events to be processed

  await t.step(
    "should correctly return dataset with compound sum metrics",
    async () => {
      const query: IDatasetQuery = {
        reportId: report._id.toString(),
        metrics: ["amount"],
        timeRange: {
          start: new Date("2025-10-16T09:00:00.000Z"),
          end: new Date("2025-10-16T11:00:00.000Z"),
        },
        granularity: "hour",
      };

      const result = await engine.getDataset(query);
      console.log("result 2 >>>", JSON.stringify(result, null, 2));

      assertEquals(result.length, 1, "Expected one time bucket");
      const dataPoint = result[0];

      assertExists(dataPoint);
      assertEquals(dataPoint.amount_sum, 600);
      assertEquals(dataPoint.amount_sum_by_category_A, 300);
      assertEquals(dataPoint.amount_sum_by_category_B, 300);
    },
  );

  await teardown();
});
