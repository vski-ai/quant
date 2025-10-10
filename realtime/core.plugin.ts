import { IPlugin, Engine, IQuery, IReportDataPoint } from "@/core/mod.ts";
import { SubscriptionManager } from "./manager.ts";

declare module "@/core/mod.ts" {
  interface Engine {
    subscriptionManager: SubscriptionManager;
  }
}

/**
 * The CoreSubscriptionPlugin acts as the bridge between the core engine and the subscription module.
 * It hooks into the engine's lifecycle to manage the SubscriptionManager and listen for data changes.
 */
export class CoreSubscriptionPlugin implements IPlugin {
  name = "CoreSubscriptionPlugin";
  version = "1.0.0";

  private engine!: Engine;

  /**
   * Called when the engine initializes. This is where we instantiate the SubscriptionManager
   * and attach it to the engine instance.
   * @param engine The core engine instance.
   */
  public async onEngineInit(engine: Engine) {
    this.engine = engine;
    engine.subscriptionManager = new SubscriptionManager();
    console.log("[CoreSubscriptionPlugin] SubscriptionManager initialized and attached to engine.");
  }

  /**
   * Called after a report has been generated. This is the primary hook for real-time updates.
   * When a report is generated (which can be triggered by various events or schedules),
   * we pass the results to the SubscriptionManager to be pushed to subscribed clients.
   * @param context The context object containing the generated report and the query used.
   */
  public async afterReportGenerated(context: { report: IReportDataPoint[]; query: IQuery; }) {
    if (this.engine.subscriptionManager) {
      this.engine.subscriptionManager.handleUpdate(context.report, context.query);
    }
  }
}
