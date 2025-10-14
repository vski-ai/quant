import { useEffect, useState } from "preact/hooks";

export default function RealtimeLogger() {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const ws = new WebSocket(
      `ws://${globalThis.location.host}/app/api/realtime?key=1`,
    );
    console.log(ws);
    ws.onopen = () => {
      console.log("[RealtimeLogger] Connected to WebSocket proxy");
    };

    ws.onmessage = (event) => {
      console.log("[RealtimeLogger] Received:", event.data);
      setMessages((prev) => [...prev, event.data]);
    };

    ws.onclose = () => {
      console.log("[RealtimeLogger] Disconnected from WebSocket proxy");
    };

    ws.onerror = (error) => {
      console.error("[RealtimeLogger] WebSocket error:", error);
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <div>
      <h2>Realtime Log</h2>
      <ul>
        {messages.map((msg, index) => <li key={index}>{msg}</li>)}
      </ul>
    </div>
  );
}
