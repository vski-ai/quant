# Developer Documentation

This document provides an in-depth overview of the analytics engine's
architecture, data flow, and implementation details for developers contributing
to the project.

## 1. Architecture Overview

The engine is designed as a real-time event processing and aggregation system.
It uses MongoDB for persistent storage and Redis for queuing, caching, and
real-time data buffering.

### Core Components

- **Engine (`engine.ts`)**: The main entry point and orchestrator. It
  initializes database connections, the aggregator, and caching layers. It
  provides the public API for interacting with the system (e.g., creating event
  sources, defining reports, querying data).

- **EventSource (`event_source.ts`)**: The interface for recording events. Each
  `EventSource` corresponds to a logical source of data (e.g., 'Stripe',
  'WebApp'). It handles event validation, storage of raw events, and initiation
  of the aggregation process.

- **Aggregator (`aggregator.ts`)**: A background worker service that processes
  events asynchronously. It consumes events from a Redis queue, generates
  multiple metric documents from each event, and writes them to the appropriate
  aggregation collections in MongoDB.

- **RealtimeBuffer (`db/RealtimeBuffer.ts`)**: A Redis-based buffer that stores
  metrics for very recent events. This allows for real-time queries that include
  data not yet permanently stored in MongoDB, providing immediate feedback.

- **ReliableQueue (`db/RedisQueue.ts`)**: A robust job queue built on Redis. It
  ensures that event processing is durable and can recover from worker failures.
  It supports atomic operations, retries with exponential backoff, and a
  dead-letter queue.

### Data Stores

- **MongoDB**:
  - **Raw Events**: Stored in collections partitioned by source (e.g.,
    `events_stripe`). This isolates data and improves query performance.
  - **Aggregated Metrics**: Stored in collections defined by the user (e.g.,
    `aggr_payments`). These can be further partitioned by time
    (`aggr_payments_xxxx`) for performance at scale.
  - **Configuration**: Collections for `Report`, `AggregationSource`,
    `EventSourceDefinition`, and `EventType` store the system's configuration.

- **Redis**:
  - **Job Queue**: The `ReliableQueue` uses Redis Lists for the main queue and
    processing list, and a Sorted Set for delayed jobs.
  - **Real-time Buffer**: The `RealtimeBuffer` uses Redis Sorted Sets (ZSETs) to
    store recent metric updates. The score is the timestamp, allowing for
    efficient time-range queries.
  - **Caching**: A generic `RedisKVStore` is used to cache frequently accessed
    configuration data like `EventSource` definitions, `EventType` definitions,
    and active `AggregationSource` configurations to reduce database load.

## 2. Data Flow

1. **Event Recording**:
   - A client calls `source.record()` via an `EventSource` instance.
   - The event is saved as a raw document in its source-specific MongoDB
     collection (e.g., `events_my_app`). This ensures data durability.
   - The event's `_id` and collection name are pushed as a job to the Redis
     `aggregator_queue`.
   - For recent events (within the `bufferAgeMs` window), metrics are generated
     on the fly and pushed to the `RealtimeBuffer` in Redis.

2. **Asynchronous Aggregation**:
   - The `Aggregator` worker fetches a job from the Redis queue.
   - It retrieves the full event document from MongoDB using the `_id` from the
     job.
   - It fetches all active `AggregationSource` configurations (from cache or
     DB).
   - For each matching configuration, it calls `getMetricsFromEvent()`. This
     function generates multiple metric documents for different aggregation
     types (`COUNT`, `SUM`, `CATEGORY`, `COMPOUND_SUM`) and for each
     attribution.
   - The generated metrics are written to the target MongoDB aggregation
     collection (which may be a time-partitioned collection) using a single
     `bulkWrite` operation for efficiency.
   - The job is acknowledged and removed from the queue. If processing fails,
     the job is moved to a delayed queue for a later retry.

3. **Querying**:
   - **Historical (`engine.getReport`, `engine.getDataset`)**:
     - The query is sent to MongoDB.
     - The system identifies all relevant aggregation collections, including
       handling time partitions (`getPartitionedCollectionNames`).
     - MongoDB's aggregation pipeline is used to match, group, and sum the data
       according to the query's time range, granularity, and filters.
     - Results from multiple collections (if applicable) are merged.
   - **Real-time (`engine.getRealtimeReport`, `engine.getRealtimeDataset`)**:
     - The query is sent to the `RealtimeBuffer` (Redis).
     - A Lua script (`queryRedisBuffer`) filters the members of the relevant
       Redis ZSETs by time range and metadata.
     - The results are aggregated in memory to produce the final report.
   - **Combined (Future)**: A complete query would merge results from both the
     historical MongoDB data and the real-time Redis buffer. The current
     implementation keeps them separate.

## 3. Technical Details & Gotchas

- **Idempotency**: The `event_source.record()` method is idempotent based on the
  `uuid` field. If an event with the same UUID is recorded twice, the system
  returns the original event and does not process it again.

- **Partitioning**: Aggregation collections can be partitioned by time. The
  collection name is generated based on a bucket index derived from the event
  timestamp, the storage granularity, and a configured partition length. This is
  crucial for managing large datasets and keeping query times low.

- **Concurrency & Race Conditions**:
  - The use of `rpoplpush` in the `ReliableQueue` makes job fetching atomic,
    preventing multiple workers from processing the same job.
  - There's a potential race condition where an event is recorded before its
    corresponding `AggregationSource` configuration is created and cached. The
    `setTimeout` calls in the tests are a symptom of this. A more robust
    solution might involve a versioned cache or an event-driven cache
    invalidation mechanism.
  - The `bulkWrite` operation with `upsert: true` can still face duplicate key
    errors (`E11000`) under high concurrency if multiple workers try to insert
    the same new aggregate document simultaneously. The code currently handles
    this with a simple retry-with-delay mechanism, which is effective but could
    be improved.

- **Automatic Metric Discovery**: The system automatically creates `SUM` metrics
  for all numerical payload fields and `CATEGORY` counts for all string/boolean
  fields. It also creates `COMPOUND_SUM` metrics (a numerical field broken down
  by a categorical field). This is powerful but can lead to a high volume of
  metric documents if payloads are highly variable.

- **Telemetry**: The system is instrumented with OpenTelemetry (`telemetry.ts`),
  manually wrapping key methods for Mongoose and IORedis. This is great for
  observability but requires manual maintenance as new methods are used.

## 4. TODO & Future Improvements

- **[ ] Combined Queries**: Implement a query path that seamlessly merges
  historical data from MongoDB with real-time data from the Redis buffer for a
  single, unified view.

- **[ ] Cache Invalidation Strategy**: Replace `setTimeout` workarounds in tests
  and production with a more robust cache invalidation strategy. A pub/sub model
  on Redis could be used where updating a configuration publishes an
  invalidation message to all engine instances.

- **[ ] Schema Validation**: The `IEventType` interface includes a `_schema`
  property, but payload validation is not yet implemented. Integrating a library
  like Zod would add significant type safety.

- **[ ] Worker Management**: The current implementation spawns workers using
  `Deno.Command`. This is simple but lacks sophisticated management (e.g.,
  health checks, automatic restarts). Consider using a process manager or Deno's
  native `Worker` API for better control.

- **[ ] Dead-Letter Queue Management**: The `ReliableQueue` moves failed jobs to
  a dead-letter queue, but there is no mechanism to inspect or re-process these
  jobs. An admin UI or CLI command should be added.

- **[ ] Dataset Query from Buffer**: The `getRealtimeDataset` implementation in
  `engine.ts` appears to be incomplete, as it returns a flat array from multiple
  sources without merging them into single data points per timestamp. This needs
  to be corrected to match the behavior of `getDataset`.

- **[ ] Refine `queryRedisBuffer`**: The function `queryRedisBuffer` uses `KEYS`
  to find collections if none are provided, which is a major performance risk in
  production Redis. The code correctly avoids this by requiring the calling
  context to provide collections, but this contract should be strictly enforced
  and documented. The current implementation in `engine.ts` correctly provides
  the collections.

- **[ ] Event Type Filter in Aggregator**: The `processEvent` method in
  `aggregator.ts` has a `// TODO:` comment to add event type filtering. This is
  a critical feature that needs to be implemented to ensure aggregations only
  process relevant events.

---

## 5. Plugin System

The engine features a hook-based plugin system to allow for extending its core
functionality without modifying the source code. This is useful for adding
custom aggregation types, enriching event data, or triggering external actions.

### Creating a Plugin

A plugin is an object that implements the `IAnalyticsPlugin` interface. It must
have a `name` and `version`, and can optionally implement one or more hook
methods.

```typescript
import { Engine, IAnalyticsPlugin } from "./core/types.ts";

export class MyAwesomePlugin implements IAnalyticsPlugin {
  name = "my-awesome-plugin";
  version = "1.0.0";

  async onEngineInit(engine: Engine) {
    console.log("My plugin has been initialized!");
  }

  // Other hook methods...
}
```

### Registering a Plugin

To use a plugin, you must register it with the engine instance after it has been
created.

```typescript
import { Engine } from "./core/engine.ts";
import { MyAwesomePlugin } from "./plugins/my_awesome_plugin.ts";

const engine = new Engine({ mongoUri: "..." });
await engine.registerPlugin(new MyAwesomePlugin());
```

### Available Hooks

- **`onEngineInit(engine)`**: Called once when the plugin is registered. Ideal
  for setup tasks.
- **`beforeEventRecord(context)`**: A "waterfall" hook that allows you to modify
  an event's `payload` and `attributions` before it is saved.
- **`afterEventRecord(context)`**: An "action" hook that is called after an
  event has been successfully saved to the database.
- **`onGetMetrics(context)`**: A "collector" hook that allows you to generate
  custom `IMetricUpdate` objects from an event during the aggregation process.
- **`registerEngineMethods(engine)`**: Allows you to add new public methods
  directly to the `engine` instance.
