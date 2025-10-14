export type * from "./db/AggregateQuery.ts";
export type * from "./db/Aggregation.ts";
export type * from "./db/Event.ts";
export interface IReportFilter {
  sourceId: string;
  eventType: string;
}

export interface IReport {
  name: string;
  description?: string;
  active: boolean;
}

/**
 * A generic type for the data payload of an event.
 * It can be any object with string keys.
 */
export type EventPayload = Record<string, any>;

/**
 * Defines the structure for an event type. Event types classify events
 * within a source (e.g., 'payment_succeeded', 'user_signup').
 */
export interface IEventType {
  name: string;
  description?: string;
  /**
   * Optional schema definition for validating event payloads.
   * This could be a JSON Schema, Zod schema, or any other format.
   * Stored as a flexible object.
   */
  _schema?: Record<string, any>;
}

/**
 * Defines a generic attribution for an event, linking it to another entity.
 */
export interface IAttribution {
  type: string; // e.g., 'identity', 'category', 'session', 'campaign'
  value: string; // The ID of the attributed entity
}

export interface IRetentionPolicy {
  hotDays: number;
  offloaderPlugin?: string;
}

/**
 * Represents a recorded event instance. The payload is generic.
 */
export interface IEvent<T extends EventPayload> {
  id: string;
  uuid: string;
  timestamp: Date;
  eventType: string; // The name of the event type, e.g., 'payment_succeeded'.
  payload: T;
  attributions?: IAttribution[]; // Generic array of attributions.
}

export interface IEventTransfer<T extends EventPayload> {
  uuid: string;
  eventType: string;
  payload: T;
  attributions?: IAttribution[];
  timestamp?: Date;
  attachments?: any[]; // any attachments (not recorded but passed thru waterfall)
}

/**
 * Defines the necessary information to create or identify an Event Source.
 * An Event Source is a logical grouping of events, like 'Stripe' or 'InternalApp'.
 */
export interface IEventSourceDefinition {
  id: string;
  name: string;
  description?: string;
  owners?: string[];
  eventTypes?: IEventType[];
  retention?: IRetentionPolicy;
}

/**
 * The main interface for an Event Source.
 * This acts as a contract for creating, defining, and recording events,
 * abstracting away the database implementation.
 */
export interface IEventSource {
  /**
   * Returns the definition of the event source.
   */
  getDefinition(): IEventSourceDefinition;

  /**
   * Defines a new type of event that can be recorded for this source.
   * This is an idempotent operation; if the type exists, it will be returned.
   * @param eventType The event type definition.
   * @returns A promise that resolves to the defined event type.
   */
  defineEventType(eventType: IEventType): Promise<IEventType>;

  /**
   * Lists all event types defined for this source.
   * @returns A promise that resolves to an array of event types.
   */
  listEventTypes(): Promise<IEventType[]>;

  /**
   * Records a new event for this source.
   * @param eventType The name of the event type to record. Must be pre-defined.
   * @param payload The data associated with the event.
   * @param attributions Optional array of attributions to link this event.
   * @returns A promise that resolves to the recorded event.
   */
  record<T extends EventPayload>(event: IEventTransfer<T>): Promise<IEvent<T>>;
  /**
   * Records a batch of new events for this source. This is optimized for performance.
   * @param events An array of event transfers to record.
   * @returns A promise that resolves to an array of the recorded events.
   */
  record<T extends EventPayload>(
    events: IEventTransfer<T>[],
  ): Promise<Partial<IEvent<T>>[]>;
  record<T extends EventPayload>(
    eventOrEvents: IEventTransfer<T> | IEventTransfer<T>[],
  ): Promise<Partial<IEvent<T>> | Partial<IEvent<T>>[]>;
}

/**
 * Defines the types of aggregation that can be performed on a payload field.
 * - COUNT: Simple event counter (always performed).
 * - SUM: Sums the numerical value of a specified field.
 * - CATEGORY: Counts the occurrences of each unique value of a specified field.
 * - COMPOUND_SUM: Sums a numerical field, categorized by the value of another string field.
 * - BOOLEAN: Records the true/false value of a field with its original timestamp.
 */
export enum AggregationType {
  COUNT = "COUNT",
  SUM = "SUM",
  CATEGORY = "CATEGORY",
  COMPOUND_SUM = "COMPOUND_SUM",
  BOOLEAN = "BOOLEAN",
}

export type ITimeRange = {
  start: Date;
  end: Date;
};

export type Granularity =
  | "100ms"
  | "200ms"
  | "250ms"
  | "500ms"
  | "second"
  | "minute"
  | "5minute"
  | "10minute"
  | "15minute"
  | "30minute"
  | "hour"
  | "2hour"
  | "4hour"
  | "6hour"
  | "12hour"
  | "day"
  | "3day"
  | "7day"
  | "15day"
  | "30day"
  | "45day"
  | "60day"
  | "90day";

export const granularity = [
  "100ms",
  "200ms",
  "250ms",
  "500ms",
  "second",
  "minute",
  "5minute",
  "10minute",
  "15minute",
  "30minute",
  "hour",
  "2hour",
  "4hour",
  "6hour",
  "12hour",
  "day",
  "3day",
  "7day",
  "15day",
  "30day",
  "45day",
  "60day",
  "90day",
];

/**
 * Defines the structure for a query to the reporting service.
 */
export interface IQuery {
  reportId: string; // Query a specific, pre-configured report by its ID
  metric: {
    type: AggregationType;
    field?: string; // e.g., 'amount' for SUM or 'currency' for CATEGORY
  };
  attribution?: IAttribution;
  timeRange: {
    start: Date;
    end: Date;
  };
  granularity: Granularity;
  rebuildCache?: boolean;
  cache?: boolean;
}

/**
 * Defines the structure for a dataset query.
 * Unlike IQuery, this can fetch multiple metrics at once.
 */
export interface IDatasetQuery {
  reportId: string;
  /** Optional filter for specific metrics (payload fields). If empty, all metrics are returned. */
  metrics?: string[];
  attribution?: IAttribution;
  timeRange: {
    start: Date;
    end: Date;
  };
  granularity: Granularity;
  rebuildCache?: boolean;
  cache?: boolean;
}

/** Represents a single row in a dataset report, potentially containing multiple metrics for a single timestamp. */
export interface IDatasetDataPoint {
  timestamp: Date;
  /** A special field containing an array of all boolean events that occurred within this time bucket. */
  $boolean_groups?: { name: string; value: boolean; timestamp: Date }[];
  /** Dynamic keys for each metric, e.g., 'amount_sum': 123, 'total_count': 5 */
  [metricKey: string]: number | Date | any[] | undefined;
}

/**
 * Represents a single data point in a time-series report.
 */
export interface IReportDataPoint {
  timestamp: Date;
  value: number;
  /** For categorical queries, this specifies which category the value belongs to. */
  category?: string;
  lastFlushedTimestamp?: Date | null;
}

import { Engine } from "./engine.ts";
import { IEventDoc } from "./db/Event.ts";
import { IMetricUpdate } from "./db/AggregateQuery.ts";

/**
 * Defines the contract for a data offloader plugin.
 * Offloaders are responsible for archiving data before it's deleted from hot storage.
 */
export interface IDataOffloader {
  /** A unique name for the offloader plugin. */
  name: string;
  /**
   * The core method to offload a collection.
   * @param context.collectionName The name of the MongoDB collection to offload.
   * @param context.connection The Mongoose connection to use.
   * @returns A promise that resolves when offloading is complete.
   */
  offload: (context: {
    collectionName: string;
    connection: any; // Using `any` to avoid circular dependency with Mongoose Connection
  }) => Promise<void>;
}

/**
 * Defines the contract for an engine plugin.
 * Plugins can hook into various parts of the engine's lifecycle to add or modify functionality.
 */
export interface IPlugin {
  /** A unique name for the plugin. */
  name: string;
  /** The version of the plugin. */
  version: string;

  /** Called once when the engine is initialized. Ideal for setting up resources. */
  onEngineInit?: (engine: Engine) => Promise<void>;

  /** Called once when the engine is shutting down. Ideal for cleaning up resources. */
  onEngineShutdown?: (engine: Engine) => Promise<void>;

  /**
   * Called before an event is recorded. Allows for modification of the payload and attributions.
   * @returns The (potentially modified) payload and attributions.
   */
  beforeEventRecord?: (context: {
    payload: EventPayload;
    eventType: string;
    attributions?: IAttribution[];
  }) => Promise<{ payload: EventPayload; attributions?: IAttribution[] }>;

  /**
   * Called after an event has been successfully saved to the raw event log.
   */
  afterEventRecord?: (
    context: { eventDoc: IEventDoc<EventPayload> },
  ) => Promise<void>;

  /**
   * Called during aggregation to allow the plugin to generate its own custom metrics.
   * @returns An array of metric updates to be processed.
   */
  onGetMetrics?: (context: {
    eventDoc: IEventDoc<EventPayload>;
    storageGranularity: Granularity;
  }) => Promise<IMetricUpdate[]>;

  /**
   * Called before a batch of metrics is written to the database.
   * Allows for modification of the metrics and the target collection.
   * @returns The (potentially modified) metrics and target collection.
   */
  beforeMetricsWritten?: (context: {
    metrics: IMetricUpdate[];
    targetCollection: string;
  }) => Promise<{ metrics: IMetricUpdate[]; targetCollection: string }>;

  /**
   * Called after a batch of metrics has been successfully written to the database.
   */
  afterMetricsWritten?: (context: {
    metrics: IMetricUpdate[];
    targetCollection: string;
  }) => Promise<void>;

  /**
   * Called immediately after metrics for the real-time buffer are generated from an event.
   */
  afterRealtimeMetricsGenerated?: (context: {
    reportId: string;
    event: IEventDoc<EventPayload>;
    metrics: IMetricUpdate[];
  }) => Promise<void>;

  /**
   * Called after the aggregator worker has successfully written a batch of metrics to MongoDB.
   */
  afterAggregationWritten?: (context: {
    reportId: string;
    sourceName: string;
    metrics: IMetricUpdate[];
  }) => Promise<void>;

  /**
   * Called before a report is generated.
   * Allows for modification of the report query.
   * @returns The (potentially modified) query.
   */
  beforeReportGenerated?: (query: IQuery) => Promise<IQuery>;

  /**
   * Called after a report has been generated.
   * Allows for post-processing of the report results.
   */
  afterReportGenerated?: (context: {
    report: IReportDataPoint[];
    query: IQuery;
  }) => Promise<void>;

  /**
   * Allows a plugin to add new methods to the engine instance.
   * @returns A record of method names to functions.
   */
  registerEngineMethods?: (
    engine: Engine,
  ) => Record<string, any>;
}
