import { RealtimeConnection } from "./types.ts";
import { Redis } from "ioredis";
import { Engine } from "@/core/mod.ts";
import type {} from "@/http/auth/mod.ts";

const BROADCAST_CHANNEL = "quant:realtime:broadcast";

/**
 * Manages real-time subscriptions and broadcasts data to connected clients across multiple instances.
 *
 * This manager uses Redis Pub/Sub to communicate events between different engine instances.
 * Each instance maintains its own set of local WebSocket (or other) connections.
 *
 * 1. An event occurs (e.g., `afterRealtimeMetricsGenerated`).
 * 2. The `CoreRealtimePlugin` calls `broadcast()` on its local `RealtimeManager`.
 * 3. The manager publishes the event to a Redis Pub/Sub channel.
 * 4. ALL `RealtimeManager` instances (including the sender) receive the event from Redis.
 * 5. Each instance checks its local subscriptions to see which connected clients are interested.
 * 6. It then pushes the data to the relevant local clients.
 */
export class RealtimeManager {
  private engine: Engine;
  private publisher: Redis;
  private subscriber: Redis;
  // Manages local connections for this specific instance.
  private subscriptions = new Map<string, Set<RealtimeConnection>>();

  constructor(engine: Engine) {
    // It's best practice to use separate Redis clients for regular commands and for Pub/Sub.
    this.engine = engine;
    const redis = engine.redisClient;
    this.publisher = redis;
    this.subscriber = redis.duplicate(); // Creates a new connection with the same options.

    this.listenForBroadcasts();
  }

  /**
   * Subscribes a local client connection to a specific event channel.
   * This is where API key authentication would be implemented.
   * @param channel The event channel to subscribe to (e.g., 'realtime:metrics').
   * @param connection The real-time connection object for the client.
   * @param apiKey The API key for authentication.
   */
  public async subscribe(
    channel: string,
    connection: RealtimeConnection,
    apiKey: string,
  ) {
    const reportId = this.getReportIdFromChannel(channel);
    if (!reportId) {
      throw new Error(
        "Invalid channel format. Expected 'report:updates:<reportId>'.",
      );
    }

    // Use the auth service provided by the auth plugin on the engine.
    // We assume the auth plugin adds `engine.auth.validate(...)`.
    const authResult = await this.engine.auth.validate(apiKey, { reportId });

    if (!authResult.valid) {
      // Log the specific reason for internal diagnostics but send a generic error to the client.
      console.warn(
        `[RealtimeManager] Auth failed for channel ${channel}: ${authResult.reason}`,
      );
      throw new Error(
        "Invalid API Key or insufficient permissions for this report.",
      );
    }

    console.log(
      `[RealtimeManager] Auth successful for connection ${connection.id} on channel ${channel}`,
    );

    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(connection);
    console.log(
      `[RealtimeManager] Connection ${connection.id} subscribed to channel: ${channel}`,
    );
  }

  /**
   * Removes a local client connection from all its subscriptions.
   * @param connection The connection to remove.
   */
  public removeConnection(connection: RealtimeConnection) {
    for (const [channel, connections] of this.subscriptions.entries()) {
      if (connections.has(connection)) {
        connections.delete(connection);
        console.log(
          `[RealtimeManager] Connection ${connection.id} removed from channel: ${channel}`,
        );
        // Clean up the channel if no connections are left for it on this instance.
        if (connections.size === 0) {
          this.subscriptions.delete(channel);
          console.log(
            `[RealtimeManager] No local connections left for channel: ${channel}`,
          );
        }
      }
    }
  }

  /**
   * Publishes an event to all engine instances via Redis Pub/Sub.
   * @param channel The specific event channel (e.g., 'realtime:metrics').
   * @param payload The data to broadcast.
   */
  public async broadcast<T>(channel: string, payload: T) {
    const message = JSON.stringify({ channel, payload });
    await this.publisher.publish(BROADCAST_CHANNEL, message);
  }

  /**
   * Returns a set of public methods to be exposed on the engine instance.
   * This provides a controlled API for other modules to interact with the real-time system.
   */
  public getPublicAPI() {
    return {
      subscribe: this.subscribe.bind(this),
      broadcast: this.broadcast.bind(this),
    };
  }

  /**
   * Sets up the Redis Pub/Sub listener for this instance.
   */
  private async listenForBroadcasts() {
    await this.subscriber.subscribe(BROADCAST_CHANNEL);
    console.log(
      `[RealtimeManager] Subscribed to Redis channel: ${BROADCAST_CHANNEL}`,
    );

    this.subscriber.on("message", (channel, message) => {
      if (channel === BROADCAST_CHANNEL) {
        this.handleBroadcastMessage(message);
      }
    });
  }

  /**
   * Handles an incoming message from the Redis broadcast channel.
   * @param message The raw message string from Redis.
   */
  private handleBroadcastMessage(message: string) {
    try {
      const { channel, payload } = JSON.parse(message);
      if (!channel || !payload) {
        console.warn(
          "[RealtimeManager] Received malformed broadcast message:",
          message,
        );
        return;
      }

      const connections = this.subscriptions.get(channel);
      if (connections && connections.size > 0) {
        console.log(
          `[RealtimeManager] Pushing broadcast on channel '${channel}' to ${connections.size} local connections.`,
        );
        const payloadString = JSON.stringify(payload);
        for (const connection of connections) {
          this.sendToConnection(connection, payloadString);
        }
      }
    } catch (error) {
      console.error(
        "[RealtimeManager] Error processing broadcast message:",
        error,
      );
    }
  }

  /**
   * Safely sends a message to a single client connection.
   * @param connection The client connection.
   * @param payloadString The stringified payload to send.
   */
  private sendToConnection(
    connection: RealtimeConnection,
    payloadString: string,
  ) {
    try {
      // Assuming the connection object has a `send` method, like a WebSocket.
      connection.send(payloadString);
    } catch (error) {
      console.error(
        `[RealtimeManager] Failed to send to connection ${connection.id}:`,
        error,
      );
      // If sending fails, assume the connection is dead and remove it.
      this.removeConnection(connection);
    }
  }

  /**
   * Disconnects the publisher and subscriber Redis clients.
   * This should be called during a graceful shutdown of the engine.
   */
  public disconnect() {
    this.subscriber.disconnect();
    this.publisher.disconnect();
  }

  /**
   * Extracts the reportId from a channel string.
   * @param channel The channel string, e.g., "report:updates:65a8f3b..."
   * @returns The reportId or null if the format is invalid.
   */
  private getReportIdFromChannel(channel: string): string | null {
    const parts = channel.split(":");
    if (parts.length === 3 && parts[0] === "report" && parts[1] === "updates") {
      return parts[2];
    }
    return null;
  }
}
