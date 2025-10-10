import { assertEquals, assertExists } from "@std/assert";
import { withTestDatabase } from "./utils.ts";
import { IDatasetDataPoint, IDatasetQuery } from "../types.ts";

const dbName = "dataset_boolean_groups_buffer_test_db";

withTestDatabase({ dbName, bufferAgeMs: 1000 * 60 * 10 }, async (t, engine) => {
  // --- 1. SETUP ---
  const source = await engine.createEventSource({
    name: "BooleanGroupBufferSource",
    eventTypes: [{ name: "user_interaction" }],
  });

  const report = await engine.createReport({
    name: "Boolean Group Buffer Test Report",
    active: true,
  });

  await engine.addAggregationSource(report._id.toString(), {
    targetCollection: "aggr_dataset_boolean_buffer_test",
    granularity: "minute",
    filter: {
      sources: [{
        name: "BooleanGroupBufferSource",
        id: source.getDefinition().id!,
      }],
      events: ["user_interaction"],
    },
  });

  // Wait for aggregator to pick up new config
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // --- 2. EXECUTION ---
  const now = new Date();
  const firstMinute = new Date(now.getTime() - 2 * 60 * 1000);
  const secondMinute = new Date(now.getTime() - 1 * 60 * 1000);

  // Events in the first time bucket
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "user_interaction",
    payload: { is_premium: true, score: 100 },
    attributions: [],
    timestamp: new Date(firstMinute.getTime() + 1000),
  });
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "user_interaction",
    payload: { is_premium: false, is_trial: true, score: 50 },
    attributions: [],
    timestamp: new Date(firstMinute.getTime() + 2000),
  });
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "user_interaction",
    payload: { score: 25 },
    attributions: [],
    timestamp: new Date(firstMinute.getTime() + 3000),
  });

  // Event in the second time bucket
  await source.record({
    uuid: crypto.randomUUID(),
    eventType: "user_interaction",
    payload: { is_premium: true, is_trial: false },
    attributions: [],
    timestamp: new Date(secondMinute.getTime() + 1000),
  });

  // Wait for events to be pushed to the Redis buffer
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await t.step(
    "should query realtime dataset and correctly form boolean groups",
    async () => {
      const query: IDatasetQuery = {
        reportId: report._id.toString(),
        timeRange: {
          start: new Date(now.getTime() - 5 * 60 * 1000),
          end: now,
        },
        granularity: "minute",
        metrics: ["score"],
      };

      const dataset: IDatasetDataPoint[] = await engine.getRealtimeDataset(
        query,
      );

      // --- 3. ASSERTION ---
      assertEquals(
        dataset.length,
        2,
        "Should have two data points for two minutes",
      );

      // --- Verify first data point ---
      const firstPoint = dataset[0];
      assertEquals(firstPoint.user_interaction_count, 3);
      assertEquals(firstPoint.score_sum, 175);
      assertExists(firstPoint.$boolean_groups);
      assertEquals(firstPoint.$boolean_groups!.length, 3);

      // Sort for predictable order
      const sortedBooleans1 = firstPoint.$boolean_groups!.sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      assertEquals(sortedBooleans1[0].name, "is_premium");
      assertEquals(sortedBooleans1[0].value, true);
      assertEquals(
        sortedBooleans1[0].timestamp.getTime(),
        firstMinute.getTime() + 1000,
      );

      assertEquals(sortedBooleans1[1].name, "is_premium");
      assertEquals(sortedBooleans1[1].value, false);
      assertEquals(
        sortedBooleans1[1].timestamp.getTime(),
        firstMinute.getTime() + 2000,
      );

      assertEquals(sortedBooleans1[2].name, "is_trial");
      assertEquals(sortedBooleans1[2].value, true);
      assertEquals(
        sortedBooleans1[2].timestamp.getTime(),
        firstMinute.getTime() + 2000,
      );

      // --- Verify second data point ---
      const secondPoint = dataset[1];
      assertEquals(secondPoint.user_interaction_count, 1);
      assertEquals(
        secondPoint.score_sum,
        undefined,
        "score_sum should not exist if no score was recorded",
      );
      assertExists(secondPoint.$boolean_groups);
      assertEquals(secondPoint.$boolean_groups!.length, 2);

      const sortedBooleans2 = secondPoint.$boolean_groups!.sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      assertEquals(sortedBooleans2[0].name, "is_premium");
      assertEquals(sortedBooleans2[0].value, true);
      assertEquals(
        sortedBooleans2[0].timestamp.getTime(),
        secondMinute.getTime() + 1000,
      );

      assertEquals(sortedBooleans2[1].name, "is_trial");
      assertEquals(sortedBooleans2[1].value, false);
      assertEquals(
        sortedBooleans2[1].timestamp.getTime(),
        secondMinute.getTime() + 1000,
      );
    },
  );
});
