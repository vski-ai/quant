import {
  any as anything,
  array,
  date,
  enum as enumType,
  InferOutput,
  minValue,
  number,
  object,
  optional,
  pipe,
  record,
  string,
} from "valibot";
import { type ObjectId } from "deno_mongo";

// Plan Schema
export const PlanSchema = object({
  _id: optional(object({})), // ObjectId will be handled by the database
  name: string(),
  quotas: object({
    requestsPerDay: pipe(number(), minValue(1)),
    requestsPerSecond: pipe(number(), minValue(1)),
    totalRequests: pipe(number(), minValue(1)),
  }),
});

export type Plan = InferOutput<typeof PlanSchema> & { _id: ObjectId };

// User Profile Schema
export const UserProfileSchema = object({
  _id: optional(object({})),
  name: string(),
  plan: optional(object({})), // ObjectId as well
});

export type UserProfile = InferOutput<typeof UserProfileSchema> & {
  _id: ObjectId;
  plan: ObjectId;
};

export enum Roles {
  admin = "admin",
  user = "user",
}
// User Schema
export const UserSchema = object({
  _id: optional(object({})),
  email: string(),
  password: string(),
  roles: array(enumType(Roles)),
  profile: optional(object({})), // ObjectId
  createdAt: optional(date()),
  updatedAt: optional(date()),
});

export type User = InferOutput<typeof UserSchema> & {
  _id: ObjectId;
  profile: ObjectId;
};

// Session Schema
export const SessionSchema = object({
  _id: optional(object({})),
  sessionToken: string(),
  userId: object({}), // ObjectId
  expires: date(),
});

export type Session = InferOutput<typeof SessionSchema> & {
  _id: ObjectId;
  userId: ObjectId;
};

// UI Preset is where we store generic ui configurations
// May want to read thru in-memory LRU cache
// Ref: query includes '?preset={key}'
export const UIPresetSchema = object({
  key: string(),
  value: record(string(), anything()),
});

export type UIPreset = InferOutput<typeof UIPresetSchema>;

// Query And Filters is where we save serialized query params
// May want to read thru in-memory LRU cache
// Ref: query includers `?q={key}`
export const QueryAndFiltersSchema = object({
  key: string(),
  value: record(string(), anything()),
});

export type QueryAndFilters = InferOutput<typeof QueryAndFiltersSchema>;
