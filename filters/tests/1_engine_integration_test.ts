import { assertEquals, assertExists } from "@std/assert";
import { withTestDatabase } from "@/core/tests/utils.ts";
import { FilterPlugin } from "../mod.ts";
import { IDatasetQuery } from "../../core/mod.ts";

const dbName = "filter_plugin_integration_test_db";

// Mock data for testing
const mockEvents = [
  {
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: { id: 1, category: "A", value: 10, enabled: true, name: "Apple" },
  },
  {
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: {
      id: 2,
      category: "B",
      value: 25,
      enabled: false,
      name: "Banana",
    },
  },
  {
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: {
      id: 3,
      category: "A",
      value: 15,
      enabled: true,
      name: "Avocado",
    },
  },
  {
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: { id: 4, category: "C", value: 30, enabled: true, name: "Cherry" },
  },
  {
    uuid: crypto.randomUUID(),
    eventType: "test_event",
    payload: {
      id: 5,
      category: "B",
      value: 20,
      enabled: true,
      name: "Blueberry",
    },
  },
];

withTestDatabase({ dbName }, async (t, engine, down) => {
  await engine.registerPlugin(new FilterPlugin());

  await t.step("should filter dataset results within the engine", async () => {
    // 1. Setup: Create event source and report
    const source = await engine.createEventSource({
      name: "FilterTestSource",
      eventTypes: [{ name: "test_event" }],
    });

    const reportDef = await engine.createReport({
      name: "Filter Test Report",
      active: true,
    });
    await engine.AggregationSourceModel.create({
      reportId: reportDef._id,
      targetCollection: "filtered_events",
      filter: {
        sources: [{
          name: source.getDefinition().name!,
          id: source.getDefinition().id!,
        }],
        events: ["test_event"],
      },
    });

    // 2. Execution: Record events
    const timestamp = new Date();
    for (const event of mockEvents) {
      timestamp.setTime(timestamp.getTime() - (60 * 1000));
      await source.record({ ...event, timestamp });
    }
    // Give aggregator time to process
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 3. Verification: Query with a filter
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const query: IDatasetQuery = {
      reportId: reportDef._id.toString(),
      timeRange: { start: oneHourAgo, end: now },
      // This filter will be applied by our plugin
      filter: {
        value_sum: [{
          OR: [
            { operator: "GT", value: 15 },
            { operator: "EQ", value: 10 },
          ],
        }],
      },
      granularity: "minute",
    };

    const result = await engine.getDataset(query);
    // Assertions
    assertExists(result, "Result should not be null");
    assertEquals(result.length, 4, "Should be 4");
  });

  await down();
});
