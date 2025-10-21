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

- **PluginManager (`plugin_manager.ts`)**: Manages the registration and
  execution of plugins, allowing for the extension of the engine's core
  functionality.

- **LifecycleManager (`lifecycle_manager.ts`)**: Manages data retention
  policies, including offloading and deleting old data from partitioned
  collections.

### Data Stores

- **MongoDB**:
  - **Raw Events**: Stored in collections partitioned by source (e.g.,
    `events_stripe`). This isolates data and improves query performance.
  - **Aggregated Metrics**: Stored in collections defined by the user (e.g.,
    `aggr_payments`). These can be further partitioned by time
    (`aggr_payments_xxxx`) for performance at scale.
  - **Configuration**: Collections for `Report`, `AggregationSource`,
    `EventSourceDefinition`, and `EventType` store the system's configuration.

- **MongoDB (Cache)**:
  - `report_cache`: A dedicated collection for caching the results of expensive
    `getReport` and `getDataset` queries.

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
     types:
     - `COUNT`: A simple count of events.
     - `SUM`: A sum of a numerical field in the payload.
     - `CATEGORY`: A count of the occurrences of each unique value of a string
       field.
     - `COMPOUND_SUM`: A sum of a numerical field, categorized by the value of
       another string field.
     - `LEAF_SUM`: A sum of a numerical field, with a `leafKey` containing all
       categorical fields. This is used for flat group aggregations.
   - The generated metrics are written to the target MongoDB aggregation
     collection (which may be a time-partitioned collection) using a single
     `bulkWrite` operation for efficiency.
   - The job is acknowledged and removed from the queue. If processing fails,
     the job is moved to a delayed queue for a later retry.

3. **Querying**:
   - **Historical (e.g., `engine.getReport`,
     `engine.getFlatGroupsAggregation`)**:
     - The query is sent to MongoDB.
     - The system identifies all relevant aggregation collections, including
       handling time partitions (`getPartitionedCollectionNames`).
     - If caching is enabled, the system first checks the `report_cache`
       collection for a valid entry.
     - MongoDB's aggregation pipeline is used to match, group, and sum the data.
   - **Real-time (e.g., `engine.getRealtimeReport`,
     `engine.getRealtimeFlatGroupsAggregation`)**:
     - The query is sent to the `RealtimeBuffer` (Redis).
     - `queryRedisBuffer` filters the members of the relevant Redis ZSETs by
       time range and metadata.
     - The results are aggregated in memory to produce the final report.

## 3. Query Types

The engine supports several types of queries, each with a different purpose:

- **`IQuery` (`getReport`)**: For fetching a single metric (e.g., total revenue,
  or revenue by country). This is the simplest query type.
- **`IDatasetQuery` (`getDataset`)**: For fetching multiple metrics for the same
  time range, resulting in a wide, dataset-like format.
- **`IGroupsAggregationQuery` (`getGroupsAggregation`)**: For creating nested
  group aggregations.
- **`IFlatGroupsAggregationQuery` (`getFlatGroupsAggregation`)**: For creating
  "flat group" aggregations, which are ordered, flattened tree structures. This
  query type uses the `LEAF_SUM` aggregation type and a hierarchy builder that
  can be run in either TypeScript or WebAssembly for performance.

## 4. Technical Details & Gotchas

- **Idempotency**: The `event_source.record()` method is idempotent based on the
  `uuid` field.
- **Partitioning**: Aggregation collections can be partitioned by time, which is
  crucial for managing large datasets.
- **Redis Key Format**: The Redis key for the real-time buffer is a
  colon-delimited string. To prevent corruption, the `leafKey` (which is a JSON
  string) is Base64 encoded.
- **Code Duplication**: There is significant code duplication in the `core/db`
  query files, especially for caching and query setup logic. A refactoring is
  planned to extract this into shared utilities.
- **Type Safety**: The codebase uses `@ts-ignore` and `any` in several places,
  particularly in the `Engine` and `PluginManager`. These should be addressed in
  the future to improve type safety.
- **WASM for Performance**: The flat group hierarchy builder (`FGAHierarchy.ts`)
  has a dual implementation in TypeScript and Rust (compiled to WASM), allowing
  for performance-critical code to be optimized.

## 5. TODO & Future Improvements

- **[ ] Refactor Query Layer**: Create shared utilities for caching (`Cache.ts`)
  and query execution (`QueryRunner.ts`) to reduce code duplication in the
  `core/db` directory.
- **[ ] Improve Type Safety**: Remove all instances of `@ts-ignore` and `any` to
  make the codebase more robust.
- **[ ] Combined Queries**: Implement a query path that seamlessly merges
  historical data from MongoDB with real-time data from the Redis buffer for a
  single, unified view.
- **[ ] Cache Invalidation Strategy**: Replace `setTimeout` workarounds with a
  more robust cache invalidation strategy, such as a Redis pub/sub model.
- **[ ] Schema Validation**: Implement payload validation using a library like
  Zod.
- **[ ] Dead-Letter Queue Management**: Add a UI or CLI to inspect and
  re-process jobs in the dead-letter queue.
- **[ ] Lifecycle Manager Enhancements**:
  - Make the check interval configurable.
  - Add support for offloading non-partitioned collections.
- **[ ] Event Type Filter in Aggregator**: The `processEvent` method in
  `aggregator.ts` has a `// TODO:` comment to add event type filtering. This is
  a critical feature that needs to be implemented.

## 6. Caching Layer

The engine includes a sophisticated, optional caching layer to improve
performance for `getReport` and `getDataset` queries. It uses a dedicated
MongoDB collection (`report_cache`) to store query results.

### Caching Strategies

1. **Standard Caching**: The result of every unique query is stored as a single
   document in the cache.
2. **Controlled Caching**: Caching is opt-in on a per-query basis by passing
   `cache: true` in the query object.
3. **Partial Hits Caching**: The system can use smaller, previously cached
   time-range "chunks" to assemble a response for a larger query.

### Usage and Invalidation

- **Opting-in (Controlled Mode)**: `engine.getReport({ ..., cache: true });`
- **Manual Invalidation**: `engine.getReport({ ..., rebuildCache: true });`
- **Automatic Expiration**: The system uses a combination of an
  application-level TTL check and a MongoDB TTL index to expire stale documents.

### Important Considerations

- **Partial Hits Invalidation**: There is **no mechanism to invalidate a single
  chunk** of a partially cached report. Using `rebuildCache: true` re-fetches
  the entire range and saves it as a new, single chunk. This mode is best for
  immutable data.
- **Cache Key Generation**: The cache key is a hash of the query object. Any
  minor difference between two query objects will result in a cache miss.

## 7. Plugin System

The engine features a hook-based plugin system to allow for extending its core
functionality.

### Creating a Plugin

A plugin is an object that implements the `IPlugin` interface.

### Registering a Plugin

Register a plugin with the `engine.registerPlugin()` method.

### Available Hooks

- **`onEngineInit(engine)`**: Called once when the plugin is registered.
- **`beforeEventRecord(context)`**: A "waterfall" hook that allows you to modify
  an event's `payload` and `attributions` before it is saved.
- **`afterEventRecord(context)`**: An "action" hook that is called after an
  event has been successfully saved to the database.
- **`onGetMetrics(context)`**: A "collector" hook that allows you to generate
  custom `IMetricUpdate` objects from an event.
- **`registerEngineMethods(engine)`**: Allows you to add new public methods
  directly to the `engine` instance.
