import { define } from "@/root.ts";

export const handler = define.handlers(
  async (ctx) => {
    const { socket: clientSocket, response } = Deno.upgradeWebSocket(ctx.req);

    const owner = ctx.state.session;
    if (!owner) {
      return new Response("Unauthorized", { status: 401 });
    }

    const backendUrl = Deno.env.get("QUANT_API_BASE_URL")?.replace(
      /^http/,
      "ws",
    );

    const backendSocket = new WebSocket(`${backendUrl}/realtime/account`);

    const connectLock = Promise.withResolvers();
    backendSocket.onopen = () => {
      console.log("[Realtime API] Connected to backend");
      backendSocket.send(JSON.stringify({
        action: "subscribe",
        channel: `account:events:${owner}`,
        masterKey: Deno.env.get("QUANT_API_MASTER_KEY"),
      }));
      connectLock.resolve(0);
    };

    backendSocket.onmessage = (event) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(event.data);
      }
    };

    backendSocket.onclose = () => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close();
      }
    };

    backendSocket.onerror = (error) => {
      console.error("[Realtime API] Backend error:", error);
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(1011, "Internal server error");
      }
    };

    clientSocket.onclose = () => {
      console.log(12438575478487);
      if (backendSocket.readyState === WebSocket.OPEN) {
        backendSocket.close();
      }
    };

    await connectLock.promise;

    return response;
  },
);
