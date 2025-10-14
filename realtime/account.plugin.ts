import { Hono } from "hono";
import { HonoEnv, IHttpPlugin } from "@/http/types.ts";
import { Engine } from "@/core/mod.ts";
import { upgradeWebSocket } from "hono/deno";
import { RealtimeConnection } from "./types.ts";

interface WebSocketMessage {
  action: "subscribe" | "unsubscribe";
  channel: string;
  masterKey: string;
}

export class AccountRealtimePlugin implements IHttpPlugin {
  name = "AccountRealtimePlugin";
  version = "1.0.0";
  namespace = "root" as const;

  private masterKey: string;

  constructor(masterKey: string) {
    this.masterKey = masterKey;
  }

  async register(app: Hono<HonoEnv>, engine: Engine) {
    app.get(
      "/realtime/account",
      upgradeWebSocket((c) => {
        const realtimeAPI = (engine as any).realtime;
        if (!realtimeAPI) {
          console.error(
            "[AccountRealtimePlugin] Realtime API not found on engine. Is CoreRealtimePlugin registered?",
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
              `[AccountRealtimePlugin] Connection opened: ${connectionId}`,
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
                if (message.masterKey !== this.masterKey) {
                  throw new Error("Invalid master key");
                }
                await realtimeAPI.subscribe(
                  message.channel,
                  connection,
                  this.masterKey,
                );
                connection.send(JSON.stringify({
                  status: "success",
                  message: `Subscribed to ${message.channel}`,
                }));
              } else {
                console.warn(
                  `[AccountRealtimePlugin] Unknown action: ${message.action}`,
                );
              }
            } catch (error) {
              console.error(
                `[AccountRealtimePlugin] Error processing message from ${connection.id}:`,
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
              `[AccountRealtimePlugin] Connection closed: ${connection.id}`,
            );
            if (connection) {
              engine.realtimeManager.removeConnection(connection);
            }
          },
          onError: (evt) => {
            console.error(
              `[AccountRealtimePlugin] WebSocket error on ${connection.id}:`,
              evt,
            );
          },
        };
      }),
    );
  }
}
