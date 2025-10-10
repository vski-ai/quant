import { assertEquals, assertExists } from "@std/assert";
import { withTestDatabase } from "./utils.ts";
import { IDatasetQuery } from "../types.ts";

const dbName = "dataset_query_test_db";

withTestDatabase({
  dbName,
}, async (t, engine) => {
  // --- 1. SETUP ---
  const source = await engine.createEventSource({
    name: "DatasetSource",
    eventTypes: [{ name: "sale" }],
  });

  const ReportModel = engine.ReportModel;
  const AggregationSourceModel = engine.AggregationSourceModel;

  const report = await ReportModel.create({
    name: "Dataset Test Report",
    active: true,
  });

  await AggregationSourceModel.create({
    reportId: report._id,
    targetCollection: "aggr_dataset_events",
    filter: {
      sources: [{ name: "DatasetSource", id: source.getDefinition().id! }],
      events: ["sale"],
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // --- 2. EXECUTION ---
  const baseTime = new Date("2023-11-20T10:00:00.000Z");
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "sale",
    payload: { amount: 100, items: 2, currency: "USD" },
    attributions: [],
    timestamp: new Date("2023-11-20T09:59:00.000Z"),
  });
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "sale",
    payload: { amount: 150, items: 3, currency: "USD" },
    attributions: [],
    timestamp: new Date("2023-11-20T09:58:00.000Z"),
  });
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "sale",
    payload: { amount: 50, items: 1, currency: "EUR" },
    attributions: [],
    timestamp: new Date("2023-11-20T09:57:00.000Z"),
  });
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "sale",
    payload: { amount: 200, currency: "EUR" },
    attributions: [],
    timestamp: new Date("2023-11-20T09:56:00.000Z"),
  }); // Missing 'items'

  await new Promise((resolve) => setTimeout(resolve, 1000));

  await t.step("should query all metrics from Mongo", async () => {
    const query: IDatasetQuery = {
      reportId: report._id.toString(),
      timeRange: { start: new Date("2023-11-20T09:30:00.000Z"), end: baseTime },
      granularity: "hour",
    };

    const reportResult = await engine.getDataset(query);
    assertEquals(reportResult.length, 1, "Expected one time bucket");
    const dataPoint = reportResult[0];

    assertExists(dataPoint);
    assertEquals(dataPoint.sale_count, 4, "Total count should be 4)");
    assertEquals(
      dataPoint.amount_sum,
      500,
      "Total amount sum should be 500 (100+150+50+200)",
    );
    assertEquals(dataPoint.items_sum, 6, "Total items sum should be 6 (2+3+1)");

    // Verify new compound metrics
    assertEquals(
      dataPoint.amount_sum_by_currency_USD,
      250,
      "Amount in USD should be 250",
    );
    assertEquals(
      dataPoint.amount_sum_by_currency_EUR,
      250,
      "Amount in EUR should be 250",
    );
  });

  await t.step("should query a subset of metrics", async () => {
    const query: IDatasetQuery = {
      reportId: report._id.toString(),
      metrics: ["amount"], // Only ask for 'amount'
      timeRange: {
        start: new Date("2023-11-20T09:00:00.000Z"),
        end: baseTime,
      },
      granularity: "hour",
    };

    const reportResult = await engine.getDataset(query);
    assertEquals(reportResult.length, 1);
    const dataPoint = reportResult[0];

    assertEquals(dataPoint.sale_count, 4, "Count should always be included");
    assertEquals(
      dataPoint.amount_sum,
      500,
      "Amount sum should be present when its field is requested",
    );
    assertEquals(
      dataPoint.items_sum,
      undefined,
      "Items sum should be excluded",
    );
    assertEquals(
      dataPoint.amount_sum_by_currency_USD,
      250,
      "Compound metrics for requested field should be included",
    );
    assertEquals(
      dataPoint.amount_sum_by_currency_EUR,
      250,
      "Compound metrics for requested field should be included",
    );
  });
});
