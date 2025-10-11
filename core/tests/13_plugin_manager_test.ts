import { assertEquals } from "@std/assert";
import { Engine } from "../mod.ts";
import {
  AggregationType,
  EventPayload,
  Granularity,
  IAttribution,
  IEventDoc,
  IMetricUpdate,
  IPlugin,
  IQuery,
  IReportDataPoint,
} from "../types.ts";
import { withTestDatabase } from "./utils.ts";

// Augment the Engine interface for the custom method plugin
declare module "../mod.ts" {
  interface Engine {
    myCustomMethod(arg: string): string;
  }
}

// A mock plugin for testing purposes
class TestTrackerPlugin implements IPlugin {
  name = "TestTrackerPlugin";
  version = "1.0.0";

  callTracker = {
    onEngineInit: 0,
    beforeEventRecord: 0,
    afterEventRecord: 0,
    onGetMetrics: 0,
    beforeMetricsWritten: 0,
    afterMetricsWritten: 0,
    beforeReportGenerated: 0,
    afterReportGenerated: 0,
  };

  onEngineInit = async (_engine: Engine) => {
    this.callTracker.onEngineInit++;
  };

  beforeEventRecord = async (
    context: {
      payload: EventPayload;
      eventType: string;
      attributions?: IAttribution[];
    },
  ) => {
    this.callTracker.beforeEventRecord++;
    return context;
  };

  afterEventRecord = async (
    _context: { eventDoc: IEventDoc<EventPayload> },
  ) => {
    this.callTracker.afterEventRecord++;
  };

  onGetMetrics = async (
    _context: {
      eventDoc: IEventDoc<EventPayload>;
      storageGranularity: Granularity;
    },
  ) => {
    this.callTracker.onGetMetrics++;
    return [] as IMetricUpdate[];
  };

  beforeMetricsWritten = async (
    context: { metrics: IMetricUpdate[]; targetCollection: string },
  ) => {
    this.callTracker.beforeMetricsWritten++;
    return context;
  };

  afterMetricsWritten = async (
    _context: { metrics: IMetricUpdate[]; targetCollection: string },
  ) => {
    this.callTracker.afterMetricsWritten++;
  };

  beforeReportGenerated = async (query: IQuery) => {
    this.callTracker.beforeReportGenerated++;
    return query;
  };

  afterReportGenerated = async (
    _context: { report: IReportDataPoint[]; query: IQuery },
  ) => {
    this.callTracker.afterReportGenerated++;
  };
}

class CustomMethodPlugin implements IPlugin {
  name = "CustomMethodPlugin";
  version = "1.0.0";

  registerEngineMethods(_engine: Engine) {
    return {
      myCustomMethod: (arg: string) => {
        return `Hello, ${arg}!`;
      },
    };
  }
}

const dbName = "plugin_manager_test_db";

withTestDatabase({ dbName }, async (t, engine) => {
  const trackerPlugin = new TestTrackerPlugin();
  await engine.registerPlugin(trackerPlugin);

  await t.step("should execute plugin hooks at various stages", async () => {
    // 1. onEngineInit should be called on registration
    assertEquals(trackerPlugin.callTracker.onEngineInit, 1);

    // 2. Create event source and report
    const eventSource = await engine.createEventSource({
      name: "test-source",
      eventTypes: [{ name: "test-event" }],
    });
    const report = await engine.createReport({
      name: "test-report",
      active: true,
    });
    await engine.addAggregationSource(report._id.toString(), {
      targetCollection: "aggr_test_events",
      filter: {
        sources: [{ name: "test-source", id: eventSource.getDefinition().id! }],
        events: ["test-event"],
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 3. Trigger event recording to test event-related hooks
    await eventSource.record({
      uuid: "test-uuid",
      eventType: "test-event",
      payload: { value: 123 },
    });

    // Check event hooks
    assertEquals(trackerPlugin.callTracker.beforeEventRecord, 1);
    assertEquals(trackerPlugin.callTracker.afterEventRecord, 1);

    // 4. Trigger aggregation to test metric-related hooks
    // This is a bit indirect, we need to wait for the aggregator to process the event
    await new Promise((resolve) => setTimeout(resolve, 1000)); // give time for aggregation

    // Check metric hooks
    // onGetMetrics is called during aggregation
    assertEquals(trackerPlugin.callTracker.onGetMetrics > 0, true);
    // before/afterMetricsWritten are called when aggregator flushes
    assertEquals(trackerPlugin.callTracker.beforeMetricsWritten > 0, true);
    assertEquals(trackerPlugin.callTracker.afterMetricsWritten > 0, true);

    // 5. Trigger report generation to test report-related hooks
    await engine.getReport({
      reportId: report._id.toString(),
      metric: { type: AggregationType.COUNT },
      timeRange: { start: new Date(0), end: new Date() },
      granularity: "day",
    });

    // Check report hooks
    assertEquals(trackerPlugin.callTracker.beforeReportGenerated, 1);
    assertEquals(trackerPlugin.callTracker.afterReportGenerated, 1);
  });

  await t.step(
    "should allow plugins to register custom, type-safe methods on the engine",
    async () => {
      const customMethodPlugin = new CustomMethodPlugin();
      await engine.registerPlugin(customMethodPlugin);

      // The method should be available on the engine and be type-safe
      const result = engine.myCustomMethod("world");

      assertEquals(result, "Hello, world!");
    },
  );
});
