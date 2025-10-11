import { Engine } from "./engine.ts";
import {
  EventPayload,
  Granularity,
  IEventDoc,
  IMetricUpdate,
  IPlugin,
} from "./types.ts";

/**
 * Manages the registration and execution of plugins within the engine.
 */
export class PluginManager {
  private plugins: IPlugin[] = [];

  constructor(private engine: Engine) {}

  /**
   * Registers a plugin, runs its initialization hooks, and attaches any custom methods to the engine.
   * @param plugin The plugin instance to register.
   */
  public async register(plugin: IPlugin) {
    console.log(`Registering engine plugin: ${plugin.name}@${plugin.version}`);
    this.plugins.push(plugin);

    // Execute initialization hook
    if (plugin.onEngineInit) {
      await plugin.onEngineInit(this.engine);
    }

    // Register custom engine methods
    if (plugin.registerEngineMethods) {
      const methods = plugin.registerEngineMethods(this.engine);
      for (const methodName in methods) {
        if (typeof (this.engine as any)[methodName] === "undefined") {
          (this.engine as any)[methodName] = methods[methodName];
        } else {
          console.warn(
            `Plugin ${plugin.name} tried to register method '${methodName}' which already exists on the Engine.`,
          );
        }
      }
    }
  }

  /**
   * Executes a "waterfall" hook, where each plugin can modify a value in series.
   * @param hookName The name of the hook to execute.
   * @param initialValue The initial value to be passed through the plugins.
   * @returns The final value after all plugins have run.
   */
  public async executeWaterfallHook(
    hookName:
      | "beforeEventRecord"
      | "beforeMetricsWritten"
      | "beforeReportGenerated",
    ...args: any[]
  ): Promise<any> {
    let value = args[0];
    for (const plugin of this.plugins) {
      const hook = plugin[hookName];
      if (typeof hook === "function") {
        // @ts-ignore:
        value = await hook.call(plugin, ...(args as [any]));
      }
    }
    return value;
  }

  /**
   * Executes an "action" hook, where each plugin performs an action without returning a value.
   * @param hookName The name of the hook to execute.
   * @param context The context object to pass to the hook.
   */
  public async executeActionHook(
    hookName:
      | "afterEventRecord"
      | "afterMetricsWritten"
      | "afterReportGenerated"
      | "afterRealtimeMetricsGenerated"
      | "afterAggregationWritten",
    context: any,
  ): Promise<void> {
    for (const plugin of this.plugins) {
      const hook = plugin[hookName];
      if (typeof hook === "function") {
        await hook.call(plugin, context);
      }
    }
  }

  /**
   * Executes a "collector" hook, gathering results from all plugins into an array.
   * @param hookName The name of the hook to execute.
   * @param context The context object to pass to the hook.
   * @returns An array containing the results from all plugins.
   */
  public async executeCollectorHook(
    hookName: "onGetMetrics",
    context: {
      eventDoc: IEventDoc<EventPayload>;
      storageGranularity: Granularity;
    },
  ): Promise<IMetricUpdate[]> {
    const results: IMetricUpdate[] = [];
    for (const plugin of this.plugins) {
      const hook = plugin[hookName];
      if (typeof hook === "function") {
        const pluginResults = await hook.call(plugin, context);
        results.push(...pluginResults);
      }
    }
    return results;
  }

  /**
   * Executes the `onEngineShutdown` hook for all registered plugins.
   * This is called by the Engine during its shutdown process.
   */
  public async executeShutdownHooks(): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onEngineShutdown) {
        console.log(`Executing shutdown hook for plugin: ${plugin.name}`);
        await plugin.onEngineShutdown(this.engine);
      }
    }
  }
}
