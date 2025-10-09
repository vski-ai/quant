import { Engine } from "./engine.ts";
import { IAggregationSource } from "./db/Aggregation.ts";
import { IEventSourceDefinition } from "./types.ts";
import { getBucketDuration, getBucketIndex } from "./db/Partition.ts";

const LIFECYCLE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check once per hour

/**
 * Manages the data lifecycle for aggregation collections, including offloading
 * and deleting old data based on configured retention policies.
 */
export class LifecycleManager {
  private timer: number | null = null;
  private isRunning = false;

  constructor(private engine: Engine) {}

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("Starting LifecycleManager service...");

    const run = async () => {
      if (!this.isRunning) return;
      try {
        await this.runChecks();
      } catch (error) {
        console.error("LifecycleManager check failed:", error);
      }
      this.timer = setTimeout(run, LIFECYCLE_CHECK_INTERVAL_MS);
    };

    run();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    console.log("LifecycleManager service stopped.");
  }

  /**
   * Scans for and processes aggregation sources with retention policies.
   * NOTE: This is public for testing purposes.
   */
  public async runChecks(): Promise<void> {
    console.log("LifecycleManager: Running retention policy checks...");

    // Process Aggregation Collections
    const aggConfigs = await this.engine.AggregationSourceModel.find({
      "retention.hotDays": { $exists: true, $gt: 0 },
      "partition.enabled": true,
    }).lean();

    for (const config of aggConfigs) {
      await this.processStalePartitionsForConfig(config);
    }

    // Process Event Collections
    const eventConfigs = await this.engine.EventSourceDefinitionModel.find({
      "retention.hotDays": { $exists: true, $gt: 0 },
    }).lean();

    for (const config of eventConfigs) {
      await this.processStaleEventsForConfig(config as IEventSourceDefinition);
    }
  }

  /**
   * Finds and processes all stale partitions for a given aggregation source configuration.
   */
  private async processStalePartitionsForConfig(
    config: IAggregationSource,
  ): Promise<void> {
    if (!this.engine.connection.db) return;
    if (!config.retention || !config.partition) return;

    const retentionPeriodMs = config.retention.hotDays * 24 * 60 * 60 * 1000;
    const staleThresholdDate = new Date(Date.now() - retentionPeriodMs);

    const bucketDurationMs = getBucketDuration(
      config.granularity!,
      config.partition.length,
    );
    // Any partition whose index is less than this is considered stale.
    const maxStaleIndex = getBucketIndex(staleThresholdDate, bucketDurationMs);

    const collections = await this.engine.connection.db.listCollections({
      name: new RegExp(`^${config.targetCollection}_\\d+$`),
    }).toArray();

    for (const coll of collections) {
      const match = coll.name.match(/_(\d+)$/);
      if (match) {
        const index = parseInt(match[1], 10);
        if (index < maxStaleIndex) {
          console.log(
            `LifecycleManager: Partition ${coll.name} is stale. Processing...`,
          );
          await this.processPartition(coll.name, config);
        }
      }
    }
  }

  /**
   * Deletes documents from an event collection that are older than the retention period.
   */
  private async processStaleEventsForConfig(
    config: IEventSourceDefinition,
  ): Promise<void> {
    if (!this.engine.connection.db) {
      return;
    }
    if (!config.retention) return;

    const retentionPeriodMs = config.retention.hotDays * 24 * 60 * 60 * 1000;
    const staleThresholdDate = new Date(Date.now() - retentionPeriodMs);
    const collectionName = `events_${config.name.toLowerCase()}`;

    const offloaderName = config.retention.offloaderPlugin;
    if (offloaderName) {
      // Note: Offloading from a non-partitioned collection is more complex.
      // A robust implementation would need to stream-and-delete to avoid high memory usage.
      // For now, we will log a warning.
      console.warn(
        `LifecycleManager: Offloading for non-partitioned event collection '${collectionName}' is not yet supported. Skipping offload.`,
      );
    }

    console.log(
      `LifecycleManager: Deleting events from ${collectionName} older than ${staleThresholdDate.toISOString()}`,
    );
    await this.engine.connection.db.collection(collectionName).deleteMany({
      timestamp: { $lt: staleThresholdDate },
    });
  }

  /**
   * Offloads (if configured) and then drops a single stale partition.
   */
  private async processPartition(
    collectionName: string,
    config: IAggregationSource,
  ): Promise<void> {
    if (!this.engine.connection.db) return;
    const offloaderName = config.retention?.offloaderPlugin;
    if (offloaderName) {
      const offloader = this.engine.getOffloader(offloaderName);
      if (offloader) {
        console.log(
          `LifecycleManager: Offloading ${collectionName} using '${offloaderName}'...`,
        );
        await offloader.offload({
          collectionName,
          connection: this.engine.connection,
        });
      } else {
        console.warn(
          `LifecycleManager: Offloader '${offloaderName}' not found for partition ${collectionName}. Skipping offload.`,
        );
      }
    }

    console.log(`LifecycleManager: Dropping partition ${collectionName}.`);
    await this.engine.connection.db.dropCollection(collectionName);
  }
}
