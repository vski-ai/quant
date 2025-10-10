import { Connection, Document, Model, Schema } from "mongoose";

import {
  AggregationType,
  Granularity,
  granularity,
  IRetentionPolicy,
} from "../types.ts";

// Schemas can be defined once and reused.
export const AggregateSchema = new Schema({
  sourceId: { type: String, required: true },
  eventType: { type: String, required: true },
  timestamp: { type: Date, required: true },
  granularity: {
    type: String,
    required: true,
    enum: granularity,
  },
  attributionType: { type: String, required: true },
  attributionValue: { type: String, required: true },
  aggregationType: {
    type: String,
    required: true,
    enum: Object.values(AggregationType), // Allow BOOLEAN to pass validation
  },
  payloadField: { type: String, default: null },
  payloadCategory: { type: String, default: null },
  compoundCategoryKey: { type: String, default: null },
  value: { type: Number, required: true, default: 0 },
}, {
  timestamps: true,
  _id: false,
  collectionOptions: {
    storageEngine: {
      wiredTiger: {
        configString: "block_compressor=zstd",
      },
    },
  },
});

AggregateSchema.index({
  sourceId: 1,
  eventType: 1,
  timestamp: 1,
  attributionType: 1,
  attributionValue: 1,
  aggregationType: 1,
  payloadField: 1,
  payloadCategory: 1,
  compoundCategoryKey: 1,
}, {
  name: "reporting_idx",
  unique: true,
  storageEngine: { wiredTiger: { configString: "block_compressor=zstd" } },
});

export const AggregationFilterSchema = new Schema({
  name: { type: String, required: true },
  id: { type: String, required: true },
}, { _id: false });

export const AggregationSourceFilterSchema = new Schema({
  sources: { type: [AggregationFilterSchema], required: true },
  events: { type: [String], required: true },
}, { _id: false });

export const AggregationSourceSchema = new Schema({
  reportId: {
    type: Schema.Types.ObjectId,
    ref: "Report",
    required: true,
    index: true,
  },
  targetCollection: { type: String, required: true },
  granularity: {
    type: String,
    default: "minute",
  },
  filter: AggregationSourceFilterSchema,
  partition: { // New partitioning schema
    enabled: { type: Boolean, default: false },
    length: { type: Number, default: 1000000 }, // e.g., 1 million seconds per bucket. Granularity is taken from the parent.
  },
  retention: {
    hotDays: { type: Number },
    offloaderPlugin: { type: String },
    _id: false,
  },
});

export interface IAggregateDoc extends Document {
  sourceId: string;
  eventType: string;
  timestamp: Date; // This is the truncated timestamp
  granularity: Granularity;
  attributionType: string;
  attributionValue: string;
  aggregationType: AggregationType;
  payloadField?: string;
  payloadCategory?: string;
  compoundCategoryKey?: string;
  value: number;
}

export type IAggregationFilter = {
  sources: { name: string; id: string }[];
  events: string[];
};

export type IAggregationSourceFilter = {
  sources: { name: string; id: string }[];
  events: string[];
};

export type IAggregationSource = {
  _id: string;
  reportId: string;
  targetCollection: string;
  granularity?: Granularity;
  filter?: IAggregationFilter;
  partition?: {
    enabled: boolean;
    // Granularity is taken from the parent IAggregationSource.granularity
    length: number;
  };
  retention?: IRetentionPolicy;
};

export const getAggregationSourceModel = (connection: Connection) => {
  return connection.model<IAggregationSource>(
    "AggregationSource",
    AggregationSourceSchema,
  );
};

export function createAggregateModel(
  connection: Connection,
  collectionName: string,
): Model<IAggregateDoc> {
  return connection.models[collectionName] ??
    connection.model<IAggregateDoc>(
      collectionName,
      AggregateSchema,
    );
}
