import { IQuery, IReportDataPoint } from "@/core/types.ts";
import { RealtimeConnection, ISubscription } from "./types.ts";

/**
 * Manages real-time subscriptions and pushes data to connected clients.
 */
export class SubscriptionManager {
  // Use a Map to store subscriptions, with a stringified query as the key.
  private subscriptions = new Map<string, ISubscription>();

  /**
   * Adds a new client connection to a subscription based on a query.
   * @param query The analytics query the client is subscribing to.
   * @param connection The real-time connection object for the client.
   */
  public addConnection(query: IQuery, connection: RealtimeConnection) {
    const key = this.getQueryKey(query);
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, { query, connections: new Set() });
    }
    this.subscriptions.get(key)!.connections.add(connection);
    console.log(`[SubscriptionManager] Connection ${connection.id} added for query: ${key}`);
  }

  /**
   * Removes a client connection from a subscription.
   * @param connection The connection to remove.
   */
  public removeConnection(connection: RealtimeConnection) {
    for (const [key, subscription] of this.subscriptions.entries()) {
      if (subscription.connections.has(connection)) {
        subscription.connections.delete(connection);
        console.log(`[SubscriptionManager] Connection ${connection.id} removed.`);
        // If no connections are left for a query, remove the subscription itself.
        if (subscription.connections.size === 0) {
          this.subscriptions.delete(key);
          console.log(`[SubscriptionManager] Subscription removed for query: ${key}`);
        }
        break;
      }
    }
  }

  /**
   * Called when new data is available from the core engine.
   * It finds matching subscriptions and pushes the data to clients.
   * @param report The newly generated report data.
   * @param query The query that generated the report.
   */
  public handleUpdate(report: IReportDataPoint[], query: IQuery) {
    const key = this.getQueryKey(query);
    const subscription = this.subscriptions.get(key);

    if (subscription) {
      console.log(`[SubscriptionManager] Pushing update for query: ${key} to ${subscription.connections.size} connections.`);
      for (const connection of subscription.connections) {
        try {
          connection.send(JSON.stringify(report));
        } catch (error) {
          console.error(`[SubscriptionManager] Failed to send to connection ${connection.id}:`, error);
          // If sending fails, assume the connection is dead and remove it.
          this.removeConnection(connection);
        }
      }
    }
  }

  /**
   * Generates a consistent, unique key from a query object.
   * This is used to identify and group subscriptions.
   * Note: This is a simple implementation. A more robust solution might
   * involve a canonical serialization of the query object.
   */
  private getQueryKey(query: IQuery): string {
    return JSON.stringify(query);
  }
}
