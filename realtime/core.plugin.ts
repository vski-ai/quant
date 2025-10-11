import {
  Engine,
  IEvent,
  IMetricUpdate,
  IPlugin,
  IQuery,
  IReportDataPoint,
} from "@/core/mod.ts";
import { RealtimeManager } from "./manager.ts";

declare module "@/core/mod.ts" {
  interface Engine {
    realtimeManager: RealtimeManager;
  }
}

/**
 * The CoreRealtimePlugin acts as the bridge between the core engine and the real-time subscription module.
 * It hooks into the engine's lifecycle to manage the RealtimeManager, listen for data changes,
 * and broadcast them to subscribed clients via Redis Pub/Sub.
 */
export class CoreRealtimePlugin implements IPlugin {
  name = "CoreRealtimePlugin";
  version = "1.0.0";
  private engine!: Engine;
  /**
   * Called when the engine initializes. This is where we instantiate the RealtimeManager
   * and attach it to the engine instance.
   * @param engine The core engine instance.
   */
  public async onEngineInit(engine: Engine) {
    // The RealtimeManager will handle subscriptions, authentication, and broadcasting.
    // It uses Redis to allow multiple engine instances to share subscription state and broadcast events.
    engine.realtimeManager = new RealtimeManager(engine);
    this.engine = engine;
    console.log(
      "[CoreRealtimePlugin] RealtimeManager initialized and attached to engine.",
    );
  }

  /**
   * Called when the engine is shutting down. This is where we clean up
   * the RealtimeManager's connections.
   * @param engine The core engine instance.
   */
  public async onEngineShutdown(engine: Engine) {
    engine.realtimeManager.disconnect();
    console.log("[CoreRealtimePlugin] RealtimeManager disconnected.");
  }
  /**
   * This hook is no longer the primary mechanism for real-time updates, as it's pull-based.
   * However, it can still be useful for broadcasting the result of specific, scheduled reports.
   * We will leave it for backward compatibility or specific use cases.
   */
  public async afterReportGenerated(
    context: { report: IReportDataPoint[]; query: IQuery },
  ) {
    // Example: engine.realtimeManager.broadcast('report:generated', { query: context.query, report: context.report });
    // For now, we are focusing on event-driven updates, so this can be a no-op.
  }

  /**
   * Called immediately after metrics for the real-time buffer are generated from an event.
   * This is the most important hook for live, low-latency updates.
   * @param context The context containing the original event and the generated metrics.
   */
  public async afterRealtimeMetricsGenerated(
    context: { reportId: string; metrics: IMetricUpdate[] },
  ) {
    // Broadcast the newly generated metrics. Subscribers interested in live data will listen for this.
    // The RealtimeManager will publish this to a Redis channel.
    const channel = `report:updates:${context.reportId}`;
    await this.engine.realtimeManager.broadcast(channel, {
      type: "realtime:metrics",
      payload: {
        changes: context.metrics.length,
      },
    });
  }

  /**
   * Called after the aggregator worker has successfully written a batch of metrics to MongoDB.
   * This signals that historical data has been updated and is now durable.
   * @param context The context containing the report ID, source name, and metrics written.
   */
  public async afterAggregationWritten(
    context: { reportId: string; sourceName: string },
  ) {
    // Broadcast that an aggregation has completed. This is useful for clients that need to know
    // when data is permanently stored or for triggering downstream processes.
    const channel = `report:updates:${context.reportId}`;
    await this.engine.realtimeManager.broadcast(channel, {
      type: "aggregation:written",
      payload: { sourceName: context.sourceName },
    });
  }

  /**
   * Exposes the RealtimeManager's public methods on the engine instance.
   * This allows other parts of the application to interact with the real-time system, for example,
   * to define custom event streams or manage subscriptions.
   */
  public registerEngineMethods(engine: Engine) {
    return {
      // This will expose methods like `engine.realtime.subscribe`, `engine.realtime.broadcast`, etc.
      realtime: engine.realtimeManager.getPublicAPI(),
    };
  }
}
