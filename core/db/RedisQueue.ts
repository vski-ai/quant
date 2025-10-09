import { Redis } from "ioredis";

export interface IQueueJob {
  id: string;
  payload: string;
  attempts: number;
}

const MAX_RETRIES = 15;
const INITIAL_BACKOFF_MS = 250; // 250ms

export class ReliableQueue {
  public readonly mainQueueKey: string;
  public readonly processingListKey: string;
  public readonly delayedQueueKey: string; // A sorted set for delayed jobs
  public readonly deadLetterQueueKey: string;

  constructor(private redis: Redis, queueName: string) {
    this.mainQueueKey = `${queueName}`;
    this.processingListKey = `${queueName}:processing`;
    this.delayedQueueKey = `${queueName}:delayed`;
    this.deadLetterQueueKey = `${queueName}:dead`;
  }

  /**
   * Pushes a new job payload onto the main queue.
   * @param payload The job payload as a string.
   */
  public async push(payload: string): Promise<void> {
    await this.redis.lpush(this.mainQueueKey, payload);
  }

  /**
   * Atomically fetches a job from the main queue and places it in the processing list.
   * @returns The job payload as a string, or null if the queue is empty.
   */
  public async fetchJob(): Promise<IQueueJob | null> {
    const jobPayload = await this.redis.rpoplpush(
      this.mainQueueKey,
      this.processingListKey,
    );

    if (!jobPayload) {
      return null;
    }

    // Check if this job has been tried before by looking for an attempt count.
    // This is a simple way to track retries. A more robust way might store
    // attempts in a separate hash.
    const parts = jobPayload.split("::");
    let payload = jobPayload;
    let attempts = 1;

    if (parts.length === 2 && !isNaN(parseInt(parts[1], 10))) {
      payload = parts[0];
      attempts = parseInt(parts[1], 10);
    }

    return { id: jobPayload, payload, attempts };
  }

  /**
   * Acknowledges a successfully processed job, removing it from the processing list.
   * @param job The job that was successfully processed.
   */
  public async acknowledgeJob(job: IQueueJob): Promise<void> {
    await this.redis.lrem(this.processingListKey, -1, job.id);
  }

  /**
   * Handles a failed job by moving it to a delayed queue for a future retry,
   * or to the dead-letter queue if it has exceeded max retries.
   * @param job The job that failed.
   */
  public async failJob(job: IQueueJob): Promise<void> {
    // First, remove it from the processing list.
    await this.redis.lrem(this.processingListKey, -1, job.id);

    if (job.attempts >= MAX_RETRIES) {
      console.warn(
        `Job ${job.payload} failed after ${job.attempts} attempts. Moving to dead-letter queue.`,
      );
      await this.redis.lpush(this.deadLetterQueueKey, job.payload);
    } else {
      const nextAttempt = job.attempts + 1;
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, job.attempts - 1);
      const retryAt = Date.now() + backoff;

      // The member is the original payload with an updated attempt count.
      const nextJobId = `${job.payload}::${nextAttempt}`;

      console.log(
        `Job ${job.payload} failed. Retrying in ${backoff}ms (attempt ${nextAttempt}).`,
      );
      await this.redis.zadd(this.delayedQueueKey, retryAt, nextJobId);
    }
  }

  /**
   * Moves any jobs from the delayed queue whose retry time has passed
   * back to the main queue for processing.
   */
  public async requeueDelayedJobs(): Promise<void> {
    const now = Date.now();
    const jobsToRequeue = await this.redis.zrangebyscore(
      this.delayedQueueKey,
      0,
      now,
    );

    if (jobsToRequeue.length > 0) {
      const pipeline = this.redis.pipeline();
      pipeline.lpush(this.mainQueueKey, ...jobsToRequeue);
      pipeline.zrem(this.delayedQueueKey, ...jobsToRequeue);
      await pipeline.exec();
      console.log(`Re-queued ${jobsToRequeue.length} delayed jobs.`);
    }
  }

  /**
   * Recovers any jobs that were stuck in the processing list on startup.
   * This handles cases where a worker crashed mid-process.
   */
  public async recoverStaleJobs(): Promise<void> {
    while (
      await this.redis.rpoplpush(this.processingListKey, this.mainQueueKey)
    ) {
      // This loop will continue until the processing list is empty.
      console.log("Recovered a stale job from the processing queue.");
    }
  }
}
