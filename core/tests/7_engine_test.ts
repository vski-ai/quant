import { assertEquals, assertExists } from "@std/assert";
import { AggregationType, IQuery } from "../mod.ts";
import { withTestDatabase } from "./utils.ts";

const dbName = "reporting_service_test_db";

withTestDatabase({ dbName }, async (t, engine, down) => {
  await t.step("should manage and query a report end-to-end", async () => {
    // --- 1. Setup Phase (using the service) ---

    // Create an event source (this part still uses the lower-level factory)
    const source = await engine.createEventSource({
      name: "ServiceTestSource",
      eventTypes: [{ name: "service_event" }],
    });

    // List available event sources via the service
    const availableSources = await engine.listEventSources();
    assertExists(
      availableSources.find((s) => s.name === "ServiceTestSource"),
      "The newly created source should be listable.",
    );

    // Create a report definition via the service
    const reportDef = await engine.createReport({
      name: "Service Test Report",
      active: true,
    });
    assertEquals(reportDef.name, "Service Test Report");

    // Add an aggregation source to the report via the service
    const sourceDef = source.getDefinition(); // This is an IEventSourceDefinition
    await engine.addAggregationSource(reportDef._id.toString(), {
      targetCollection: "aggr_service_events",
      filter: {
        sources: [{ name: sourceDef.name!, id: sourceDef.id! }],
        events: ["service_event"],
      },
    });

    const aggSources = await engine.listAggregationSources(
      reportDef._id.toString(),
    );
    assertEquals(
      aggSources.length,
      1,
      "Should be one aggregation source linked to the report.",
    );
    assertEquals(aggSources[0].targetCollection, "aggr_service_events");

    // --- 2. Execution Phase ---

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Record some events
    await source.record({
      uuid: crypto.randomUUID(),
      eventType: "service_event",
      payload: {
        value: 100,
        category: "A",
      },
    });
    await source.record({
      uuid: crypto.randomUUID(),
      eventType: "service_event",
      payload: {
        value: 50,
        category: "B",
      },
    });
    await source.record({
      uuid: crypto.randomUUID(),
      eventType: "service_event",
      payload: {
        value: 200,
        category: "A",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
    // --- 3. Verification Phase (using the service) ---

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Query for the total sum
    const sumQuery: IQuery = {
      reportId: reportDef._id.toString(),
      metric: { type: AggregationType.SUM, field: "value" },
      timeRange: { start: oneHourAgo, end: now },
      granularity: "hour",
    };

    const sumReport = await engine.getReport(sumQuery);
    assertEquals(sumReport.length, 1);
    assertEquals(sumReport[0].value, 350, "Total sum should be 350");

    // Query for the category breakdown
    const categoryQuery: IQuery = {
      reportId: reportDef._id.toString(),
      metric: { type: AggregationType.CATEGORY, field: "category" },
      timeRange: { start: oneHourAgo, end: now },
      granularity: "hour",
    };

    const categoryReport = await engine.getReport(categoryQuery);
    assertEquals(categoryReport.length, 2, "Expected two categories");
    const catA = categoryReport.find((r) => r.category === "A");
    const catB = categoryReport.find((r) => r.category === "B");
    assertExists(catA);
    assertExists(catB);
    assertEquals(catA.value, 2, "Category A should have 2 events");
    assertEquals(catB.value, 1, "Category B should have 1 event");

    await engine.aggregator.stop();
  });
  await down();
});
