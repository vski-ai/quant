import { Connection, Document, Model, Schema, Types } from "mongoose";
import { Granularity, ITimeRange } from "../types.ts";

/**
 * Defines the condition for a threshold-based alert.
 * e.g., { metric: 'COUNT', operator: 'GT', value: 1000 }
 */
export const ThresholdConditionSchema = new Schema({
  metric: { type: String, required: true }, // e.g., 'my_event_count', 'amount_sum'
  operator: {
    type: String,
    required: true,
    enum: ["GT", "GTE", "LT", "LTE", "EQ"], // GreaterThan, LessThan, etc.
  },
  value: { type: Number, required: true },
}, { _id: false });

/**
 * Defines the action to take when a subscription is triggered.
 * Initially, we'll support webhooks.
 */
export const SubscriptionActionSchema = new Schema({
  type: { type: String, required: true, enum: ["WEBHOOK"] },
  target: { type: String, required: true }, // e.g., the webhook URL
}, { _id: false });

/**
 * Defines the state for a given subscription to prevent re-firing.
 * For batch completion, it tracks the last notified timestamp.
 * For thresholds, it tracks the time range of the last alert.
 */
export const SubscriptionStateSchema = new Schema({
  lastNotifiedTimestamp: { type: Date }, // For 'BATCH_COMPLETED'
  lastFiredAt: { type: Date }, // For 'THRESHOLD'
}, { _id: false });

export const SubscriptionSchema = new Schema({
  name: { type: String, required: true },
  reportId: { // Link to a report to inherit its data sources
    type: Schema.Types.ObjectId,
    ref: "Report",
    required: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: ["BATCH_COMPLETED", "THRESHOLD"],
    index: true,
  },
  granularity: { type: String, required: true }, // e.g., 'week', '10minute'
  active: { type: Boolean, default: true, index: true },

  // --- Fields for THRESHOLD type ---
  conditions: {
    type: [ThresholdConditionSchema],
    // Required if type is 'THRESHOLD'
    default: undefined,
  },

  // --- Action and State ---
  action: { type: SubscriptionActionSchema, required: true },
  state: { type: SubscriptionStateSchema, default: {} },
}, { timestamps: true });

export interface IThresholdCondition {
  metric: string;
  operator: "GT" | "GTE" | "LT" | "LTE" | "EQ";
  value: number;
}

export interface ISubscriptionAction {
  type: "WEBHOOK";
  target: string;
}

export interface ISubscriptionState {
  lastNotifiedTimestamp?: Date;
  lastFiredAt?: Date;
}

export interface ISubscriptionDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  reportId: Types.ObjectId;
  type: "BATCH_COMPLETED" | "THRESHOLD";
  granularity: Granularity;
  active: boolean;
  conditions?: IThresholdCondition[];
  action: ISubscriptionAction;
  state: ISubscriptionState;
  createdAt: Date;
  updatedAt: Date;
}

export function getSubscriptionModel(
  connection: Connection,
): Model<ISubscriptionDoc> {
  return connection.model<ISubscriptionDoc>(
    "Subscription",
    SubscriptionSchema,
  );
}
