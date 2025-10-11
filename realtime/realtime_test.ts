import { assertEquals, assertExists } from "@std/assert";
import { CoreRealtimePlugin } from "./core.plugin.ts";
import { HttpRealtimePlugin } from "./http.plugin.ts";
import { withTestApi } from "@/http/tests/utils.ts";
import { delay } from "@std/async/delay";

const dbName = "realtime_module_test_db";

withTestApi({
  dbName,
  httpPlugins: [new HttpRealtimePlugin()],
}, async (t, { engine, client, baseUrl }) => {
  await engine.registerPlugin(new CoreRealtimePlugin());

  // --- Test Setup: Create API Keys ---
  const { data: keyData } = await client.postApiAuthKeys({
    body: {
      owner: "realtime-user",
      quotas: {
        requestsPerDay: 1000,
        requestsPerSecond: 10,
        totalRequests: 10000,
      },
    },
  });
  client.setMasterKey(null);
  client.setApiKey(keyData!.key);
  assertExists(keyData?.key, "Failed to create a valid API key");
  const validApiKey = keyData.key;
  const invalidApiKey = "qnt_invalidkey12345";

  await t.step(
    "should authenticate and only send updates to correctly subscribed clients",
    async () => {
      // 1. Setup: Create two reports and an aggregation source for only the first one.
      // Create reports via the API client to ensure they are associated with the API key owner.
      const { data: targetReport } = await client.postApiReports({
        body: { name: "Target Report", active: true },
      });
      const { data: otherReport } = await client.postApiReports({
        body: { name: "Other Report", active: true },
      });
      assertExists(targetReport?.id, "Failed to create target report");
      assertExists(otherReport?.id, "Failed to create other report");
      const eventSource = await engine.createEventSource({
        name: "realtime-source",
        eventTypes: [{ name: "realtime-event" }],
      });
      await engine.addAggregationSource(targetReport.id.toString(), {
        targetCollection: "aggr_realtime_events",
        filter: {
          sources: [{
            name: "realtime-source",
            id: eventSource.getDefinition().id!,
          }],
          events: ["realtime-event"],
        },
      });

      // 2. Connect: Establish three separate WebSocket connections.
      const wsUrl = baseUrl.replace("http", "ws") + "/realtime";
      const wsValid = new WebSocket(wsUrl); // Subscribes to target report with valid key
      const wsOther = new WebSocket(wsUrl); // Subscribes to other report with valid key
      const wsInvalid = new WebSocket(wsUrl); // Attempts to subscribe with invalid key

      const validMessages: unknown[] = [];
      const validPromise = new Promise<void>((resolve) => {
        wsValid.onmessage = (event) => {
          const data = JSON.parse(event.data);
          validMessages.push(data);
          // We expect two messages: confirmation and the data update.
          if (validMessages.length >= 2) {
            resolve();
          }
        };
      });

      const otherMessages: unknown[] = [];
      wsOther.onmessage = (event) => {
        const data = JSON.parse(event.data);
        otherMessages.push(data);
      };

      const invalidMessages: unknown[] = [];
      const invalidPromise = new Promise<void>((resolve) => {
        wsInvalid.onmessage = (event) => {
          const data = JSON.parse(event.data);
          invalidMessages.push(data);
          // We expect one message: the auth error.
          if (invalidMessages.length >= 1) {
            resolve();
          }
        };
      });

      await Promise.all([
        new Promise<void>((resolve) => wsValid.onopen = () => resolve()),
        new Promise<void>((resolve) => wsOther.onopen = () => resolve()),
        new Promise<void>((resolve) => wsInvalid.onopen = () => resolve()),
      ]);

      // 3. Subscribe: Each client subscribes.
      const targetChannel = `report:updates:${targetReport.id.toString()}`;
      wsValid.send(JSON.stringify({
        action: "subscribe",
        channel: targetChannel,
        apiKey: validApiKey,
      }));

      const otherChannel = `report:updates:${otherReport.id.toString()}`;
      wsOther.send(JSON.stringify({
        action: "subscribe",
        channel: otherChannel,
        apiKey: validApiKey,
      }));

      wsInvalid.send(JSON.stringify({
        action: "subscribe",
        channel: targetChannel,
        apiKey: invalidApiKey,
      }));

      // 4. Trigger: Record an event that will generate metrics and trigger the broadcast
      await eventSource.record({
        uuid: "realtime-test-uuid-1",
        eventType: "realtime-event",
        payload: { value: 100 },
      });

      // Wait for all expected messages to be received.
      await Promise.all([validPromise, invalidPromise]);
      await delay(200); // Wait a brief moment to ensure no other messages are sent.

      // 5. Assert: Check messages for the valid client (should receive update)
      assertEquals((validMessages[0] as any).status, "success");
      assertEquals(
        (validMessages[0] as any).message,
        `Subscribed to ${targetChannel}`,
      );
      const broadcastMessage = validMessages[1] as {
        type: string;
        payload: { changes: number };
      };
      assertExists(
        broadcastMessage,
        "Second message should be the broadcast data",
      );
      assertEquals(broadcastMessage.type, "realtime:metrics");
      assertEquals(
        broadcastMessage.payload.changes,
        2,
        "Expected 2 metric changes (COUNT and SUM)",
      );

      // 6. Assert: Check messages for the other client (should NOT receive update)
      assertEquals(
        otherMessages.length,
        1,
        "Client 2 should only receive one message",
      );
      assertEquals(
        (otherMessages[0] as any).status,
        "success",
        "Client 2's only message should be subscription confirmation",
      );
      assertEquals(
        (otherMessages[0] as any).message,
        `Subscribed to ${otherChannel}`,
      );

      // 7. Assert: Check messages for the invalid client (should receive an error)
      assertEquals(
        invalidMessages.length,
        1,
        "Invalid client should only receive one message",
      );
      assertEquals(
        (invalidMessages[0] as any).status,
        "error",
        "Invalid client's message should be an error",
      );
      assertExists(
        (invalidMessages[0] as any).message.includes("Invalid API Key"),
        "Error message should indicate auth failure",
      );

      wsValid.close();
      wsOther.close();
      wsInvalid.close();
    },
  );
});
