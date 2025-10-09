import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { Connection } from "mongoose";
import { ReliableQueue } from "./db/RedisQueue.ts";
import { Engine } from "./engine.ts";

const STATS_REDIS_KEY = "engine:stats";
const INSTANCES_REDIS_KEY = "engine:instances";
const INSTANCE_HEARTBEAT_TTL_SECONDS = 30;
const STATS_UPDATE_INTERVAL_MS = 15000; // 15 seconds

/**
 * Defines the structure of the engine's internal statistics.
 */
export interface IEngineStats {
  instanceCount: number;
  db: {
    db: string;
    collections: number;
    objects: number;
    avgObjSize: number;
    dataSize: number;
    storageSize: number;
    indexSize: number;
    totalSize: number;
  } | null;
  queues: {
    main: number;
    processing: number;
    delayed: number;
    deadLetter: number;
  } | null;
  lastUpdatedAt: string;
}

/**
 * Defines the contract for a service that collects and provides
 * internal engine statistics.
 */
export interface IStatsService {
  /**
   * Starts the statistics collection service, including periodic updates.
   */
  start(): void;

  /**
   * Stops the statistics collection service and deregisters the instance.
   */
  stop(): Promise<void>;

  /**
   * Retrieves the latest engine statistics.
   * @returns A promise that resolves to the engine statistics object.
   */
  getStats(): Promise<IEngineStats | null>;
}

/**
 * Collects and stores internal engine statistics in Redis.
 */
export class StatsService implements IStatsService {
  private instanceId = randomUUID();
  private timer: number | null = null;
  private isRunning = false;

  constructor(
    private engine: Engine,
    private redis: Redis,
    private connection: Connection,
    private queue: ReliableQueue,
  ) {}

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`Starting stats service for instance ${this.instanceId}`);

    const run = async () => {
      if (!this.isRunning) return;
      await this.sendHeartbeat();
      await this.updateStats();
      this.timer = setTimeout(run, STATS_UPDATE_INTERVAL_MS);
    };

    run();
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    // Remove this instance from the active set
    await this.redis.zrem(INSTANCES_REDIS_KEY, this.instanceId);
    console.log(`Stopped stats service for instance ${this.instanceId}`);
  }

  public async getStats(): Promise<IEngineStats | null> {
    const statsJson = await this.redis.get(STATS_REDIS_KEY);
    return statsJson ? JSON.parse(statsJson) : null;
  }

  private async sendHeartbeat(): Promise<void> {
    const score = Date.now();
    // Add/update instance in the sorted set with the current timestamp as score
    await this.redis.zadd(INSTANCES_REDIS_KEY, score, this.instanceId);
  }

  private async updateStats(): Promise<void> {
    if (!this.connection.db) {
      return;
    }
    // 1. Clean up stale instances
    const staleThreshold = Date.now() - INSTANCE_HEARTBEAT_TTL_SECONDS * 1000;
    await this.redis.zremrangebyscore(
      INSTANCES_REDIS_KEY,
      "-inf",
      staleThreshold,
    );

    // 2. Get current stats
    const instanceCount = await this.redis.zcard(INSTANCES_REDIS_KEY);
    const dbStats = await this.connection.db.stats();
    const [main, processing, delayed, deadLetter] = await this.redis.pipeline()
      .llen(this.queue.mainQueueKey)
      .llen(this.queue.processingListKey)
      .zcard(this.queue.delayedQueueKey)
      .llen(this.queue.deadLetterQueueKey)
      .exec() as any[];

    // 3. Format and store stats
    const stats: IEngineStats = {
      instanceCount,
      db: {
        db: dbStats.db,
        collections: dbStats.collections,
        objects: dbStats.objects,
        avgObjSize: dbStats.avgObjSize,
        dataSize: dbStats.dataSize,
        storageSize: dbStats.storageSize,
        indexSize: dbStats.indexSize,
        totalSize: dbStats.totalSize,
      },
      queues: {
        main: (main[1] as number) ?? 0,
        processing: (processing[1] as number) ?? 0,
        delayed: (delayed[1] as number) ?? 0,
        deadLetter: (deadLetter[1] as number) ?? 0,
      },
      lastUpdatedAt: new Date().toISOString(),
    };

    await this.redis.set(STATS_REDIS_KEY, JSON.stringify(stats));
  }
}
