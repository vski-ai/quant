import { assert, assertEquals, assertExists } from "@std/assert";
import { withTestDatabase } from "./utils.ts";
import { IDataOffloader } from "../types.ts";
import { Connection } from "mongoose";
import { getPartitionedCollectionName } from "../db/Partition.ts";

const dbName = "lifecycle_management_test_db";

/**
 * A mock offloader for testing that archives data to an in-memory array.
 */
class TestOffloader implements IDataOffloader {
  name = "test-offloader";
  public archivedData: any[] = [];

  async offload(context: {
    collectionName: string;
    connection: Connection;
  }): Promise<void> {
    const data = await context.connection.db!
      .collection(context.collectionName)
      .find({})
      .toArray();
    this.archivedData.push(...data);
  }

  public clear() {
    this.archivedData = [];
  }
}

withTestDatabase({ dbName }, async (t, engine) => {
  // --- 1. SETUP ---
  const testOffloader = new TestOffloader();
  engine.registerOffloader(testOffloader);

  await t.step(
    "should delete stale events from event collections based on retention policy",
    async () => {
      const hotDays = 7;
      const source = await engine.createEventSource({
        name: "EventRetentionSource",
        retention: { hotDays },
        eventTypes: [{ name: "some_event" }],
      });

      const collectionName = `events_eventretentionsource`;
      const collection = engine.connection.db!.collection(collectionName);

      // Record one stale and one recent event
      const staleTimestamp = new Date(
        Date.now() - (hotDays + 2) * 24 * 60 * 60 * 1000,
      );
      const recentTimestamp = new Date();
      await source.record({
        uuid: crypto.randomUUID(),
        eventType: "some_event",
        payload: { a: "stale" },
        attributions: [],
        timestamp: staleTimestamp,
      });
      await source.record({
        uuid: crypto.randomUUID(),
        eventType: "some_event",
        payload: { a: "recent" },
        attributions: [],
        timestamp: recentTimestamp,
      });

      // Wait for events to be recorded
      await new Promise((r) => setTimeout(r, 500));

      const countBefore = await collection.countDocuments();
      assertEquals(
        countBefore,
        2,
        "Both events should exist before lifecycle run",
      );

      // Manually run the lifecycle manager
      await engine.lifecycleManager.runChecks();

      const countAfter = await collection.countDocuments();
      assertEquals(
        countAfter,
        1,
        "Only the recent event should remain after lifecycle run",
      );

      const remainingDoc = await collection.findOne();
      assertExists(remainingDoc);
      assertEquals(remainingDoc.payload.a, "recent");
    },
  );

  await t.step(
    "should drop stale aggregation partitions without an offloader",
    async () => {
      const source = await engine.createEventSource({
        name: "RetentionNoOffloadSource",
        eventTypes: [{ name: "stale_event" }],
      });
      const report = await engine.createReport({
        name: "Retention No Offload Report",
        active: true,
      });

      const targetCollection = "aggr_no_offload";
      await engine.addAggregationSource(report._id.toString(), {
        targetCollection,
        granularity: "day",
        filter: {
          sources: [{
            name: source.getDefinition().name,
            id: source.getDefinition().id!,
          }],
          events: ["stale_event"],
        },
        partition: { enabled: true, length: 1 }, // 1 day per partition
        retention: { hotDays: 5 }, // Data older than 5 days is stale
      });

      // Record an event that is 10 days old, creating a stale partition
      const staleTimestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await source.record({
        uuid: crypto.randomUUID(),
        eventType: "stale_event",
        payload: { value: 1 },
        attributions: [],
        timestamp: staleTimestamp,
      });

      // Wait for aggregation
      await new Promise((r) => setTimeout(r, 2000));

      const staleCollectionName = getPartitionedCollectionName(
        targetCollection,
        staleTimestamp,
        "day",
        1,
      );
      const collectionsBefore = await engine.connection.db!.listCollections({
        name: staleCollectionName,
      }).toArray();
      assertEquals(
        collectionsBefore.length,
        1,
        "Stale collection should exist before lifecycle run",
      );

      // Manually run the lifecycle manager
      await engine.lifecycleManager.runChecks();

      const collectionsAfter = await engine.connection.db!.listCollections({
        name: staleCollectionName,
      }).toArray();
      assertEquals(
        collectionsAfter.length,
        0,
        "Stale collection should be dropped after lifecycle run",
      );
    },
  );

  await t.step(
    "should offload and drop stale aggregation partitions",
    async () => {
      // Clear any data from previous tests
      testOffloader.clear();

      const source = await engine.createEventSource({
        name: "RetentionWithOffloadSource",
        eventTypes: [{ name: "offload_event" }],
      });
      const report = await engine.createReport({
        name: "Retention With Offload Report",
        active: true,
      });

      const targetCollection = "aggr_with_offload";
      await engine.addAggregationSource(report._id.toString(), {
        targetCollection,
        granularity: "day",
        filter: {
          sources: [{
            name: source.getDefinition().name,
            id: source.getDefinition().id!,
          }],
          events: ["offload_event"],
        },
        partition: { enabled: true, length: 1 },
        retention: {
          hotDays: 3,
          offloaderPlugin: testOffloader.name,
        },
      });

      // Record a stale event (e.g., 4 days old)
      const staleTimestamp = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      await source.record({
        uuid: crypto.randomUUID(),
        eventType: "offload_event",
        payload: { value: 123 },
        attributions: [],
        timestamp: staleTimestamp,
      });

      // Wait for aggregation
      await new Promise((r) => setTimeout(r, 2000));

      const staleCollectionName = getPartitionedCollectionName(
        targetCollection,
        staleTimestamp,
        "day",
        1,
      );
      const collectionsBefore = await engine.connection.db!.listCollections({
        name: staleCollectionName,
      }).toArray();
      assertEquals(
        collectionsBefore.length,
        1,
        "Stale collection should exist before lifecycle run",
      );

      // Manually run the lifecycle manager
      await engine.lifecycleManager.runChecks();

      // --- Assertions ---
      // 1. Check that the offloader was called and has data
      assert(
        testOffloader.archivedData.length > 0,
        "TestOffloader should have archived data",
      );
      const offloadedMetric = testOffloader.archivedData.find(
        (d) => d.payloadField === "value",
      );
      assertExists(
        offloadedMetric,
        "The specific metric should be in the offloaded data",
      );
      assertEquals(offloadedMetric.value, 123);

      // 2. Check that the collection was dropped from the primary DB
      const collectionsAfter = await engine.connection.db!.listCollections({
        name: staleCollectionName,
      }).toArray();
      assertEquals(
        collectionsAfter.length,
        0,
        "Stale collection should be dropped after offloading",
      );
    },
  );
});
