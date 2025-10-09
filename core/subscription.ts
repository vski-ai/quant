// TODO: this is a prototype

import { Engine } from "./engine.ts";
import { getSubscriptionModel, ISubscriptionDoc } from "./db/Subscription.ts";
import { IDatasetDataPoint, ITimeRange } from "./types.ts";
import { truncateDate } from "./utils.ts";

/**
 * The main service responsible for evaluating subscriptions and triggering actions.
 */
export class SubscriptionService {
  constructor(private engine: Engine) {}

  /**
   * This method is the main loop, intended to be called periodically (e.g., via cron or setInterval).
   */
  public async runChecks(): Promise<void> {
    const SubscriptionModel = getSubscriptionModel(this.engine.connection);
    const activeSubscriptions = await SubscriptionModel.find({ active: true });

    for (const sub of activeSubscriptions) {
      try {
        if (sub.type === "THRESHOLD") {
          await this.checkThresholdSubscription(sub);
        } else if (sub.type === "BATCH_COMPLETED") {
          await this.checkBatchSubscription(sub);
        }
      } catch (error) {
        console.error(`Failed to process subscription ${sub._id}:`, error);
      }
    }
  }

  private async checkThresholdSubscription(
    sub: ISubscriptionDoc,
  ): Promise<void> {
    // To avoid re-firing for the same time window, we check if an alert was already sent
    // within the current granularity period.
    const now = new Date();
    const currentWindowStart = truncateDate(now, sub.granularity);
    if (sub.state.lastFiredAt && sub.state.lastFiredAt >= currentWindowStart) {
      return; // Already fired for this window.
    }

    const timeRange: ITimeRange = {
      start: currentWindowStart,
      end: now,
    };

    // Use the existing getDataset query engine to fetch all relevant metrics for the window.
    const dataset = await this.engine.getDataset({
      reportId: sub.reportId.toString(),
      timeRange,
      granularity: sub.granularity,
      metrics: sub.conditions!.map((c) => c.metric.split("_")[0]), // Extract base metric name
    });

    if (dataset.length === 0) return;

    // We only care about the single, most recent data point for the current window.
    const latestDataPoint = dataset[dataset.length - 1];

    const allConditionsMet = sub.conditions!.every((condition) => {
      const value = latestDataPoint[condition.metric] as number | undefined;
      if (value === undefined) return false; // Metric not present in data

      switch (condition.operator) {
        case "GT":
          return value > condition.value;
        case "GTE":
          return value >= condition.value;
        case "LT":
          return value < condition.value;
        case "LTE":
          return value <= condition.value;
        case "EQ":
          return value === condition.value;
        default:
          return false;
      }
    });

    if (allConditionsMet) {
      await this.triggerAction(sub, {
        type: "THRESHOLD",
        timestamp: latestDataPoint.timestamp,
        granularity: sub.granularity,
        values: latestDataPoint,
      });
      // Update state to prevent re-firing
      sub.state.lastFiredAt = now;
      await sub.save();
    }
  }

  private async checkBatchSubscription(sub: ISubscriptionDoc): Promise<void> {
    // Find the most recent data point for this report to see what the latest completed batch is.
    const timeRange: ITimeRange = {
      start: sub.state.lastNotifiedTimestamp || sub.createdAt, // Start from last notification or creation
      end: new Date(),
    };

    const dataset = await this.engine.getDataset({
      reportId: sub.reportId.toString(),
      timeRange,
      granularity: sub.granularity,
      metrics: [], // We just need the timestamps
    });

    if (dataset.length === 0) return;

    // The last point in the dataset represents the most recent fully aggregated time bucket.
    const latestBatch = dataset[dataset.length - 1];
    const latestBatchTimestamp = latestBatch.timestamp;

    // If we haven't notified for this batch yet, do it.
    if (
      !sub.state.lastNotifiedTimestamp ||
      latestBatchTimestamp > sub.state.lastNotifiedTimestamp
    ) {
      // We can notify for all new batches since the last check
      for (const batch of dataset) {
        if (
          !sub.state.lastNotifiedTimestamp ||
          batch.timestamp > sub.state.lastNotifiedTimestamp
        ) {
          await this.triggerAction(sub, {
            type: "BATCH_COMPLETED",
            timestamp: batch.timestamp,
            granularity: sub.granularity,
            // We can include a pre-signed query URL or prepared query object here
            query: {
              reportId: sub.reportId.toString(),
              timeRange: {
                start: batch.timestamp,
                end: new Date(
                  batch.timestamp.getTime() +
                    this.engine.granularityToMs(sub.granularity) - 1,
                ),
              },
              granularity: sub.granularity,
            },
          });
        }
      }
      sub.state.lastNotifiedTimestamp = latestBatchTimestamp;
      await sub.save();
    }
  }

  private async triggerAction(
    sub: ISubscriptionDoc,
    payload: any,
  ): Promise<void> {
    console.log(
      `TRIGGER: Firing action for subscription "${sub.name}" (${sub._id})`,
    );
    if (sub.action.type === "WEBHOOK") {
      try {
        const response = await fetch(sub.action.target, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscriptionName: sub.name,
            subscriptionId: sub.id,
            firedAt: new Date().toISOString(),
            ...payload,
          }),
        });
        if (!response.ok) {
          console.error(
            `Webhook for subscription ${sub._id} failed with status ${response.status}: ${await response
              .text()}`,
          );
        }
      } catch (error) {
        console.error(`Webhook for subscription ${sub._id} failed:`, error);
      }
    }
  }
}
