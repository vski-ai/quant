/**
 * Represents a generic real-time client connection, abstracting away the transport layer (e.g., WebSocket).
 */
export interface RealtimeConnection {
  /** A unique identifier for the connection. */
  id: string;
  /** A function to send a string-based payload to the client. */
  send: (data: string) => void;
}
