import { getEventModel, IEventDoc } from "./db/Event.ts";
import { AggregationType, EventPayload, ITimeRange } from "./types.ts";
import {
  getMetricsFromEvent,
  writeBooleanMetricsToMongo,
  writeMetricsToMongo,
} from "./db/AggregateQuery.ts";
import { IRealtimeService, RealtimeBuffer } from "./db/RealtimeBuffer.ts";
import { ReliableQueue } from "./db/RedisQueue.ts";
import { Engine } from "./mod.ts";
import { IAggregationSource } from "./db/Aggregation.ts";
import { getPartitionedCollectionName } from "./db/Partition.ts";

const AGGREGATOR_QUEUE_KEY = "aggregator_queue";

export class Aggregator {
  private engine: Engine;
  private workerTimer: number | null = null;
  public isRunning = false;
  public bufferService: IRealtimeService;
  public queue: ReliableQueue;

  constructor(
    engine: Engine,
    bufferAgeMs?: number,
  ) {
    this.engine = engine;
    const dbName = this.engine.connection.getClient().options.dbName;
    this.bufferService = new RealtimeBuffer(
      this.engine.redisClient,
      `${dbName ?? "global"}:metrics_buffer`,
      bufferAgeMs,
    );
    this.queue = new ReliableQueue(
      this.engine.redisClient,
      `${dbName ?? "global"}:${AGGREGATOR_QUEUE_KEY}`,
    );
    this.start();
  }

  /**
   * Pushes a new event's metadata to the Redis queue for processing.
   * This is called by the EventSource when a new event is recorded.
   * @param eventId The ID of the newly created event document.
   * @param collectionName The collection where the event was stored.
   */
  public async queueEventForProcessing(
    eventId: string,
    collectionName: string,
  ): Promise<void> {
    const message = JSON.stringify({ eventId, collectionName });

    await this.queue.push(message);
  }

  private async processEvent(eventDoc: IEventDoc<EventPayload>) {
    if (!eventDoc) {
      console.warn("Aggregator received an event that could not be found.");
      return;
    }

    // Fetch all active aggregation sources from the engine's cache/db
    const allActiveSources = await this.engine.getAllActiveAggregationSources();

    for (const config of allActiveSources) {
      const sourceMatch = config.filter?.sources.some(
        (source: { id: string }) => source.id === eventDoc.sourceId.toString(),
      ) || !config.filter?.sources?.length;

      if (!sourceMatch) {
        continue;
      }

      // TODO: Add event type filter check here as well.

      const metrics = await getMetricsFromEvent(
        eventDoc,
        this.engine,
        config.granularity ?? "minute",
      );

      if (metrics.length === 0) {
        continue;
      }

      const targetCollection = config.partition?.enabled
        ? getPartitionedCollectionName(
          config.targetCollection,
          eventDoc.timestamp,
          config.granularity!,
          config.partition.length,
        )
        : config.targetCollection;

      // Separate metrics by type
      const standardMetrics = metrics.filter(
        (m) => m.query.aggregationType !== AggregationType.BOOLEAN,
      );
      const booleanMetrics = metrics.filter(
        (m) => m.query.aggregationType === AggregationType.BOOLEAN,
      );

      // Write standard metrics
      await writeMetricsToMongo(
        this.engine,
        targetCollection,
        standardMetrics,
      );

      // Write boolean metrics if any
      if (booleanMetrics.length > 0) {
        await writeBooleanMetricsToMongo(
          this.engine,
          targetCollection,
          booleanMetrics,
        );
      }

      // Run the hook to notify plugins that a batch of aggregations has been persisted.
      // This should happen after all metrics for this config have been written.
      this.engine.pluginManager.executeActionHook(
        "afterAggregationWritten",
        {
          reportId: config.reportId.toString(),
          sourceName: targetCollection,
          metrics,
        },
      ).catch(console.error);
    }
  }

  public async start() {
    if (this.isRunning) {
      console.log("Aggregator is already running.");
      return;
    }
    this.isRunning = true;

    console.log("Starting aggregator service...");
    await this.queue.recoverStaleJobs();

    // Start the worker loop
    this.runWorkerLoop();
  }

  private runWorkerLoop() {
    if (!this.isRunning) {
      return;
    }

    const work = async () => {
      if (!this.isRunning) {
        return; // Stop the loop if the service has been stopped.
      }

      await this.engine.connection.asPromise();

      const jobs = await Promise.all(
        new Array(2).fill(0).map(() => this.queue.fetchJob()),
      );
      await Promise.allSettled(
        jobs.filter(Boolean).map(async (job) => {
          try {
            if (job) {
              const { eventId, collectionName } = JSON.parse(job.payload);
              const model = getEventModel(
                this.engine.connection,
                collectionName,
              );
              const eventDoc = await model.findById(eventId).lean();
              if (eventDoc) {
                await this.processEvent(eventDoc as any);
                await this.queue.acknowledgeJob(job);
              } else {
                // Event not found in DB. This can happen if the worker is faster than
                // the DB replication/write. We'll fail the job to trigger a retry.
                throw new Error(`Event ${eventId} not found in DB.`);
              }
            }
          } catch (error) {
            console.error("Aggregator worker loop error:", error);
            if (job) {
              await this.queue.failJob(job);
            }
          }
        }),
      );
      await this.queue.requeueDelayedJobs();
      this.workerTimer = setTimeout(work);
    };
    work();
  }

  public stop() {
    this.isRunning = false;
    if (this.workerTimer) {
      clearTimeout(this.workerTimer);
    }
    console.log("Aggregator service stopped.");
  }

  public async flush() {
    this.stop();
    await this.queue.requeueDelayedJobs();
    let job = await this.queue.fetchJob();
    while (job) {
      try {
        const { eventId, collectionName } = JSON.parse(job.payload);
        const model = getEventModel(
          this.engine.connection,
          collectionName,
        );
        const eventDoc = await model.findById(eventId).lean();
        if (eventDoc) {
          await this.processEvent(eventDoc as any);
          await this.queue.acknowledgeJob(job);
        } else {
          throw new Error(`Event ${eventId} not found in DB.`);
        }
      } catch (error) {
        console.error("Aggregator flush error:", error);
        await this.queue.failJob(job);
      }
      await this.queue.requeueDelayedJobs();
      job = await this.queue.fetchJob();
    }
    this.start();
  }

  public async reprocessEventsForReport(
    timeRange: ITimeRange,
    aggregationSources: IAggregationSource[],
  ) {
    console.log(
      `Starting reprocessing for ${aggregationSources.length} aggregation sources...`,
    );

    for (const config of aggregationSources) {
      if (!config.filter) continue;

      const sourceNames = config.filter.sources.map((s) =>
        s.name.toLowerCase().replace(/[^a-z0-9_]/g, "_")
      );

      for (const sourceName of sourceNames) {
        const EventModel = this.engine.connection.model<
          IEventDoc<EventPayload>
        >(`events_${sourceName}`);
        const eventsCursor = EventModel.find({
          timestamp: { $gte: timeRange.start, $lte: timeRange.end },
          ...(config.filter.events.length > 0 &&
            { eventType: { $in: config.filter.events } }),
        }).lean().cursor();
        for await (const eventDoc of eventsCursor) {
          const metrics = await getMetricsFromEvent(
            eventDoc,
            this.engine,
            config.granularity ?? "minute",
          );
          const targetCollection = config.partition?.enabled
            ? getPartitionedCollectionName(
              config.targetCollection,
              eventDoc.timestamp,
              config.granularity!,
              config.partition.length,
            )
            : config.targetCollection;
          await writeMetricsToMongo(
            this.engine,
            targetCollection,
            metrics,
          );
        }
      }
    }
  }
}
