import * as v from "valibot";

export const EventTypeSchema = v.object({
  name: v.string(),
  description: v.optional(v.string()),
});

export const RetentionPolicySchema = v.object({
  hotDays: v.number(),
  offloaderPlugin: v.optional(v.string()),
});

export const EventSourceDefinitionSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  owners: v.optional(v.array(v.string())),
  eventTypes: v.optional(v.array(EventTypeSchema)),
  retention: v.optional(RetentionPolicySchema),
});

export const CreateEventSourceSchema = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  owners: v.optional(v.array(v.string())),
  eventTypes: v.optional(v.array(EventTypeSchema)),
});

export const UpdateEventSourceSchema = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  owners: v.optional(v.array(v.string())),
});
