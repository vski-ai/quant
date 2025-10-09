import { Connection, Document, Model, Schema, Types } from "mongoose";
import { EventPayload, IAttribution, IRetentionPolicy } from "../types.ts";

/**
 * Schema for the EventSourceDefinition collection.
 * Stores the high-level configuration for each event source.
 */
export const EventSourceDefinitionSchema = new Schema({
  name: { type: String, required: true, unique: true, index: true },
  description: { type: String },
  retention: { type: Schema.Types.Mixed },
  // eventTypes are now managed separately in their own collection
}, { timestamps: true });

/**
 * Schema for the EventType collection.
 * Stores the event types associated with each event source.
 */
export const EventTypeSchema = new Schema({
  sourceId: {
    type: Schema.Types.ObjectId,
    ref: "EventSourceDefinition",
    required: true,
    index: true,
  },
  name: { type: String, required: true },
  description: { type: String },
}, { timestamps: true });
// Ensure that an event type name is unique within a given source.
EventTypeSchema.index({ sourceId: 1, name: 1 }, { unique: true });

/**
 * Schema for the Attribution subdocument.
 */
const AttributionSchema = new Schema({
  type: { type: String, required: true },
  value: { type: String, required: true },
}, { _id: false });

/**
 * Schema for the Event collections.
 * Each event source will have its own collection of events for scalability.
 * This schema is used as a template for those collections.
 */
export function createEventSchema() {
  const schemaOptions: { capped?: any; timestamps: boolean } = {
    timestamps: false,
  };
  const EventSchema = new Schema({
    uuid: { type: String, required: true, unique: true, index: true },
    sourceId: {
      type: Schema.Types.ObjectId,
      ref: "EventSourceDefinition",
      required: true,
    },
    eventTypeId: {
      type: Schema.Types.ObjectId,
      ref: "EventType",
      required: true,
    },
    timestamp: { type: Date, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    attributions: [AttributionSchema],
  }, schemaOptions);

  EventSchema.index({ timestamp: 1 });

  EventSchema.index({
    "attributions.type": 1,
    "attributions.value": 1,
    timestamp: -1,
  });
  return EventSchema;
}

export interface IEventSourceDefinitionDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
}

export interface IEventTypeDoc extends Document {
  _id: Types.ObjectId;
  sourceId: Types.ObjectId;
  name: string;
  description?: string;
  _schema?: Record<string, any>;
}

export interface IEventDoc<T extends EventPayload> extends Document {
  _id: Types.ObjectId;
  uuid: string;
  sourceId: Types.ObjectId;
  eventTypeId: Types.ObjectId;
  timestamp: Date;
  payload: T;
  attributions?: IAttribution[];
}

export const getEventSourceDefinitionModel = (connection: Connection) => {
  return connection.model<IEventSourceDefinitionDoc>(
    "EventSourceDefinition",
    EventSourceDefinitionSchema,
  );
};

export const getEventTypeModel = (connection: Connection) => {
  return connection.model<IEventTypeDoc>(
    "EventType",
    EventTypeSchema,
  );
};

/**
 * A factory function to create a Mongoose model for a specific event source's
 * event collection. This pattern partitions event data into separate collections
 * (e.g., 'events_stripe', 'events_paypal'), which is excellent for performance
 * and scalability. It also ensures a model is not re-compiled if it already exists.
 *
 * @param sourceName The sanitized name of the event source.
 * @returns A Mongoose model for the event collection.
 */
export function createEventModel<T extends EventPayload>(
  connection: Connection,
  sourceName: string,
): Model<IEventDoc<T>> {
  const collectionName = `events_${sourceName.toLowerCase()}`;
  return connection.models[collectionName] ??
    connection.model<IEventDoc<T>>(
      collectionName,
      createEventSchema(),
      collectionName,
    );
}

export function getEventModel<T extends EventPayload>(
  connection: Connection,
  collectionName: string,
): Model<IEventDoc<T>> {
  return connection.models[collectionName] ??
    connection.model<IEventDoc<T>>(
      collectionName,
      createEventSchema(),
      collectionName,
    );
}
