import { assert, assertEquals, assertExists, assertRejects } from "@std/assert";
import { IAttribution, IEventSourceDefinition } from "../mod.ts";
import { withTestDatabase } from "./utils.ts";

const dbName = "event_module_test_db";

// Run the test suite using the wrapper.
withTestDatabase({ dbName }, async (t, engine, down) => {
  await t.step(
    "should create a new event source without any event types",
    async () => {
      const sourceDef: IEventSourceDefinition = {
        name: "TestSource1",
        description: "A test source for basic creation.",
      };
      const source = await engine.createEventSource(sourceDef);
      assertExists(source);
      assertEquals(source.getDefinition().name, "TestSource1");
      const eventTypes = await source.listEventTypes();
      assertEquals(eventTypes.length, 0);
    },
  );

  await t.step(
    "should retrieve an existing event source instead of creating a new one",
    async () => {
      const sourceDef: IEventSourceDefinition = {
        name: "TestSource1",
        description: "A different description that should be ignored.",
      };
      const source = await engine.createEventSource(sourceDef);
      assertExists(source);
      assertEquals(source.getDefinition().name, "TestSource1");
      // The description should not be updated because findOneAndUpdate uses $setOnInsert.
      assertEquals(
        source.getDefinition().description,
        "A test source for basic creation.",
      );
    },
  );

  await t.step(
    "should create a new event source with pre-defined event types",
    async () => {
      const sourceDef: IEventSourceDefinition = {
        name: "TestSource2",
        description: "A source created with initial types.",
        eventTypes: [
          {
            name: "user_registered",
            description: "Fired when a new user signs up.",
          },
          {
            name: "user_deleted",
            description: "Fired when a user account is removed.",
          },
        ],
      };
      const source = await engine.createEventSource(sourceDef);
      assertExists(source);
      const eventTypes = await source.listEventTypes();
      assertEquals(eventTypes.length, 2);
      assert(
        eventTypes.some((et) => et.name === "user_registered"),
        "Expected 'user_registered' type to be defined",
      );
      assert(
        eventTypes.some((et) => et.name === "user_deleted"),
        "Expected 'user_deleted' type to be defined",
      );
    },
  );

  await t.step(
    "should define a new event type on an existing source",
    async () => {
      const source = await engine.createEventSource({ name: "TestSource1" });

      let eventTypes = await source.listEventTypes();
      assertEquals(
        eventTypes.length,
        0,
        "Source should have no event types initially",
      );

      await source.defineEventType({
        name: "item_added_to_cart",
        description: "An item was added to the shopping cart.",
      });

      eventTypes = await source.listEventTypes();
      assertEquals(
        eventTypes.length,
        1,
        "Source should have one event type after definition",
      );
      assertEquals(eventTypes[0].name, "item_added_to_cart");
    },
  );

  await t.step(
    "should successfully record a valid event with a payload",
    async () => {
      const source = await engine.createEventSource({
        name: "RecordingSource",
        eventTypes: [{ name: "test_event" }],
      });

      const payload = { data: "sample_data", value: 12345 };
      const recordedEvent = await source.record({
        uuid: crypto.randomUUID(),
        eventType: "test_event",
        payload,
        attributions: [],
      });

      assertExists(recordedEvent.id, "Recorded event should have an ID");
      assertEquals(recordedEvent.eventType, "test_event"); //
      assertEquals(recordedEvent.payload, payload);
      assertExists(
        recordedEvent.timestamp,
        "Recorded event should have a timestamp",
      );
      assertEquals(
        recordedEvent.attributions,
        [],
        "Attributions should be an empty array when not provided",
      );
    },
  );

  await t.step(
    "should successfully record an event with attributions",
    async () => {
      const source = await engine.createEventSource({
        name: "AttributionSource",
        eventTypes: [{ name: "purchase_completed" }],
      });

      const payload = { amount: 999, currency: "USD" };
      const attributions: IAttribution[] = [
        { type: "identity", value: "user_abc_123" },
        { type: "session", value: "session_xyz_789" },
      ];
      const recordedEvent = await source.record({
        uuid: crypto.randomUUID(),
        eventType: "purchase_completed",
        payload,
        attributions,
      });

      assertExists(
        recordedEvent.attributions,
        "Attributions should be present on the recorded event",
      );
      assertEquals(recordedEvent.attributions?.length, 2);
      assertEquals(recordedEvent.attributions, attributions);
    },
  );

  await t.step(
    "should throw an error when attempting to record an undefined event type",
    async () => {
      const source = await engine.createEventSource({ name: "ErrorSource" });

      await assertRejects(
        async () => {
          await source.record({
            uuid: crypto.randomUUID(),
            eventType: "non_existent_event",
            payload: {
              data: "this should fail",
            },
          });
        },
        Error, // Expected error type
        'Event type "non_existent_event" is not defined for source "ErrorSource". Please define it first.',
      );
    },
  );

  await down();
});
