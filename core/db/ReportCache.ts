import { Connection, Document, Model, Schema } from "mongoose";
import { ITimeRange } from "../types.ts";

/**
 * Schema for the ReportCache collection.
 * Stores the results of expensive report queries.
 */
export const ReportCacheSchema = new Schema({
  // _id is managed by Mongoose by default. It can be an ObjectId or a provided string.
  cacheKey: { type: String, unique: true, sparse: true, index: true }, // For standard, non-partial caching
  baseKey: { type: String, required: true, index: true }, // Hash of the query minus the timeRange
  timeRange: { // The specific time range this cache entry covers
    type: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    required: true,
  },
  reportId: { type: String, required: true, index: true },
  data: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
}, {
  versionKey: false,
  timestamps: { updatedAt: false }, // Only care about creation time for TTL
});

// For querying time range overlaps efficiently.
ReportCacheSchema.index({ "timeRange.start": 1, "timeRange.end": 1 });

export interface IReportCacheDoc extends Document {
  _id: string;
  baseKey: string;
  timeRange: ITimeRange;
  reportId: string;
  data: any[];
  createdAt: Date;
}

let ttlIndexApplied = false;
export const getReportCacheModel = (
  connection: Connection,
  ttlSeconds?: number,
): Model<IReportCacheDoc> => {
  // Ensure the TTL index is applied only once to prevent Mongoose warnings in tests
  if (ttlSeconds && ttlSeconds > 0 && !ttlIndexApplied) {
    ReportCacheSchema.index({ createdAt: 1 }, {
      expireAfterSeconds: ttlSeconds,
    });
    ttlIndexApplied = true;
  }
  return connection.model<IReportCacheDoc>(
    "ReportCache",
    ReportCacheSchema,
    "report_cache",
  );
};
