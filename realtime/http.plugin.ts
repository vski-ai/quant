import { Hono } from "hono";
import { IHttpPlugin, HonoEnv } from "@/http/types.ts";
import { Engine } from "@/core/mod.ts";
import { upgradeWebSocket } from "hono/deno";
import { IQuery } from "@/core/types.ts";
import { RealtimeConnection } from "./types.ts";

/**
 * The HttpSubscriptionPlugin exposes the subscription functionality via WebSockets.
 * It creates a `/subscribe` endpoint that clients can connect to.
 */
export class HttpSubscriptionPlugin implements IHttpPlugin {
  name = "HttpSubscriptionPlugin";
  version = "1.0.0";

  /**
   * Registers the WebSocket route with the Hono application.
   * @param app The Hono app instance.
   * @param engine The core engine instance, used to access the SubscriptionManager.
   */
  async register(app: Hono<HonoEnv>, engine: Engine) {
    app.get(
      "/subscribe",
      upgradeWebSocket(async (c) => {
        const rawQuery = c.req.query('q');
        if (!rawQuery) {
            return {
                onOpen: (_evt, ws) => {
                    ws.close(1007, "Query parameter is missing");
                }
            }
        }

        const query = JSON.parse(rawQuery) as IQuery;
        const manager = engine.subscriptionManager;

        if (!manager) {
          console.error("[HttpSubscriptionPlugin] SubscriptionManager not found on engine. CoreSubscriptionPlugin might not be registered.");
          // Close the connection immediately if the manager isn't available.
          return {
            onOpen: (_evt, ws) => {
              ws.close(1011, "Internal server error");
            }
          }
        }

        console.log(`[HttpSubscriptionPlugin] WebSocket connection opened for query:`, query);

        let connection: RealtimeConnection;

        return {
          onOpen: (_evt, ws) => {
            connection = {
              id: crypto.randomUUID(),
              send: (data: any) => ws.send(data),
              close: () => ws.close(),
            };
            manager.addConnection(query, connection);
          },
          onClose: (_evt) => {
            console.log("[HttpSubscriptionPlugin] WebSocket connection closed.");
            if (connection) {
              manager.removeConnection(connection);
            }
          },
          onError: (evt) => {
            console.error("[HttpSubscriptionPlugin] WebSocket error:", evt);
          },
        };
      }),
    );
  }
}
