import { Connection, Document, Schema, Types } from "mongoose";
import { IReport } from "../types.ts";

export const ReportSchema = new Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

export interface IReportDoc extends IReport, Document {
  _id: Types.ObjectId;
}

export const getReportModel = (connection: Connection) => {
  return connection.model<IReportDoc>("Report", ReportSchema);
};
