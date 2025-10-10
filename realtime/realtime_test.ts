import { assertEquals, assertExists } from "@std/assert";
import { CoreSubscriptionPlugin } from "./core.plugin.ts";
import { HttpSubscriptionPlugin } from "./http.plugin.ts";
import { withTestDatabase } from "../core/tests/utils.ts";
import { createHttp } from "../http/create_http.ts";
import { AggregationType, IQuery } from "@/core/types.ts";

const dbName = "subscription_module_test_db";

withTestDatabase({ dbName }, async (t, engine) => {
    // Register the core plugin to enable the subscription manager
    await engine.registerPlugin(new CoreSubscriptionPlugin());

    // Create the HTTP server with the subscription plugin
    const app = await createHttp(engine, [new HttpSubscriptionPlugin()]);

    await t.step("should receive real-time updates via WebSocket after subscribing", async () => {
        const controller = new AbortController();
        const serverPromise = Deno.serve({ port: 8001, signal: controller.signal }, app.fetch).finished;
        await new Promise(resolve => setTimeout(resolve, 100));

        const report = await engine.createReport({ name: "test-sub-report", active: true });
        const eventSource = await engine.createEventSource({ name: "sub-source", eventTypes: [{ name: "sub-event" }] });
        await engine.addAggregationSource(report._id.toString(), {
            targetCollection: "aggr_sub_events",
            filter: {
                sources: [{ name: "sub-source", id: eventSource.getDefinition().id! }],
                events: ["sub-event"],
            },
        });

        const query: IQuery = {
            reportId: report._id.toString(),
            metric: { type: AggregationType.COUNT },
            timeRange: { start: new Date(0), end: new Date() },
            granularity: "day",
        };

        const wsUrl = `ws://localhost:8001/api/subscribe?q=${encodeURIComponent(JSON.stringify(query))}`;
        const ws = new WebSocket(wsUrl);

        let receivedMessage: any = null;
        const messagePromise = new Promise((resolve) => {
            ws.onmessage = (event) => {
                receivedMessage = JSON.parse(event.data);
                resolve(null);
            };
        });

        await new Promise(resolve => ws.onopen = () => resolve(null));
        await eventSource.record({ uuid: "sub-test-uuid", eventType: "sub-event", payload: {} });

        await engine.getReport(query);

        await messagePromise;

        assertExists(receivedMessage);
        assertEquals(Array.isArray(receivedMessage), true);
        assertEquals(receivedMessage.length, 1);
        assertEquals(receivedMessage[0].value, 1);

        ws.close();
        controller.abort();
        await serverPromise;
    });
});
