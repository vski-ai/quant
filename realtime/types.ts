import { IQuery } from "@/core/types.ts";

/**
 * A simplified interface representing a real-time connection,
 * abstracting away the underlying transport (e.g., WebSocket).
 */
export interface RealtimeConnection {
  /** A unique identifier for the connection. */
  id: string;
  /** Sends data to the client. */
  send: (data: any) => void;
  /** Closes the connection. */
  close: () => void;
}

/**
 * Represents a stored subscription, linking a query to a set of connections.
 */
export interface ISubscription {
  /** The analytics query for the subscription. */
  query: IQuery;
  /** The set of connections subscribed to this query. */
  connections: Set<RealtimeConnection>;
}
