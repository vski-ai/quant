import { Hono } from "hono";
import { HonoEnv, IHttpPlugin } from "@/http/types.ts";
import { Engine } from "@/core/mod.ts";
import { upgradeWebSocket } from "hono/deno";
import { RealtimeConnection } from "./types.ts";

/**
 * Defines the structure of messages expected from clients over WebSocket.
 */
interface WebSocketMessage {
  action: "subscribe" | "unsubscribe";
  channel: string;
  apiKey: string;
}

/**
 * The HttpRealtimePlugin exposes the real-time subscription functionality via WebSockets.
 * It creates a `/realtime` endpoint and handles the WebSocket lifecycle directly.
 */
export class HttpRealtimePlugin implements IHttpPlugin {
  name = "HttpRealtimePlugin";
  version = "1.0.0";
  namespace = "root" as const;

  /**
   * Registers the `/realtime` WebSocket route with the Hono application.
   * @param app The Hono app instance.
   * @param engine The core engine instance.
   */
  async register(app: Hono<HonoEnv>, engine: Engine) {
    app.get(
      "/realtime",
      upgradeWebSocket((c) => {
        const realtimeAPI = (engine as any).realtime;
        if (!realtimeAPI) {
          console.error(
            "[HttpRealtimePlugin] Realtime API not found on engine. Is CoreRealtimePlugin registered?",
          );
          return {
            onOpen: (_evt, ws) => {
              ws.close(1011, "Internal server error");
            },
          };
        }

        let connection: RealtimeConnection;

        return {
          onOpen: (_evt, ws) => {
            const connectionId = crypto.randomUUID();
            console.log(
              `[HttpRealtimePlugin] Connection opened: ${connectionId}`,
            );
            connection = {
              id: connectionId,
              send: (data: string) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(data);
                }
              },
            };
          },
          onMessage: async (evt, _ws) => {
            try {
              const message: WebSocketMessage = JSON.parse(evt.data as string);

              if (message.action === "subscribe") {
                await realtimeAPI.subscribe(
                  message.channel,
                  connection,
                  message.apiKey,
                );
                connection.send(JSON.stringify({
                  status: "success",
                  message: `Subscribed to ${message.channel}`,
                }));
              } else {
                console.warn(
                  `[HttpRealtimePlugin] Unknown action: ${message.action}`,
                );
              }
            } catch (error) {
              console.error(
                `[HttpRealtimePlugin] Error processing message from ${connection.id}:`,
                error,
              );
              connection.send(JSON.stringify({
                status: "error",
                message: (error as Error).message ||
                  "Invalid message format or subscription failed.",
              }));
            }
          },
          onClose: () => {
            console.log(
              `[HttpRealtimePlugin] Connection closed: ${connection.id}`,
            );
            if (connection) {
              // Use the direct manager method for cleanup.
              engine.realtimeManager.removeConnection(connection);
            }
          },
          onError: (evt) => {
            console.error(
              `[HttpRealtimePlugin] WebSocket error on ${connection.id}:`,
              evt,
            );
          },
        };
      }),
    );
  }
}
