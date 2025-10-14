import { Connection, createConnection, Model, Types } from "mongoose";
import { mergeAndAggregateResults } from "./db/ReportQuery.ts";
import { getReportModel, IReportDoc } from "./db/Report.ts";
import {
  createEventModel,
  getEventSourceDefinitionModel,
  getEventTypeModel,
  IEventSourceDefinitionDoc,
  IEventTypeDoc,
} from "./db/Event.ts";
import {
  getAggregationSourceModel,
  IAggregationSource,
} from "./db/Aggregation.ts";
import { getReport } from "./db/ReportQuery.ts";
import { getDataset } from "./db/DatasetQuery.ts";
import {
  EventPayload,
  IDataOffloader,
  IDatasetDataPoint,
  IDatasetQuery,
  IEventSource,
  IEventSourceDefinition,
  IPlugin,
  IQuery,
  IReport,
} from "./types.ts";
import { Aggregator } from "./aggregator.ts";
import { EventSource } from "./event_source.ts";
import { PluginManager } from "./plugin_manager.ts";
import { Redis } from "ioredis";
import { tracer } from "./telemetry.ts";
import { IKVStore, RedisKVStore } from "./db/RedisKVStore.ts";
import { LifecycleManager } from "./lifecycle_manager.ts";
import { IEngineStats, IStatsService, StatsService } from "./stats.ts";
import { getReportCacheModel, IReportCacheDoc } from "./db/ReportCache.ts";

export interface EngineConfig {
  mongoUri: string;
  redisClient?: Redis;
  redisUri?: string;
  bufferAgeMs?: number;
  cache?: {
    enabled: boolean;
    ttlSeconds: number;
    controlled?: boolean;
    partialHits?: boolean;
  };
}

export class Engine {
  public connection: Connection;
  public redisClient: Redis;
  public aggregator: Aggregator;
  public lifecycleManager: LifecycleManager;
  public pluginManager: PluginManager;
  public statsService: IStatsService;

  public eventSourceDefCache: IKVStore;
  public eventTypeCache: IKVStore;
  public aggregationConfigCache: IKVStore;

  private reportModel: ReturnType<typeof getReportModel>;
  private eventSourceDefinitionModel: ReturnType<
    typeof getEventSourceDefinitionModel
  >;
  private eventTypeModel: ReturnType<typeof getEventTypeModel>;
  private reportCacheModel: Model<IReportCacheDoc>;
  private aggregationSourceModel: ReturnType<typeof getAggregationSourceModel>;

  private offloaders = new Map<string, IDataOffloader>();

  constructor(public config: EngineConfig) {
    this.connection = createConnection(config.mongoUri);
    this.redisClient = config.redisUri
      ? new Redis(config.redisUri, {
        maxRetriesPerRequest: null, // ioredis v5 change
      })
      : new Redis();
    this.reportModel = getReportModel(this.connection);
    this.eventSourceDefinitionModel = getEventSourceDefinitionModel(
      this.connection,
    );
    this.eventTypeModel = getEventTypeModel(this.connection);
    this.aggregationSourceModel = getAggregationSourceModel(this.connection);
    this.reportCacheModel = getReportCacheModel(
      this.connection,
      config.cache?.ttlSeconds,
    );
    this.aggregator = new Aggregator(
      this,
      config.bufferAgeMs,
    );
    this.lifecycleManager = new LifecycleManager(this);
    this.pluginManager = new PluginManager(this);
    this.statsService = new StatsService(
      this,
      this.redisClient,
      this.connection,
      this.aggregator.queue,
    );
    this.statsService.start();
    this.lifecycleManager.start();

    this.eventSourceDefCache = this.getCache("event-source-defs", 3600); // 1 hour TTL
    this.eventTypeCache = this.getCache("event-types", 3600); // 1 hour TTL
    this.aggregationConfigCache = this.getCache("agg-configs", 600); // 10 min TTL
  }

  get ReportModel() {
    return this.reportModel;
  }

  get EventSourceDefinitionModel() {
    return this.eventSourceDefinitionModel;
  }

  get EventTypeModel() {
    return this.eventTypeModel;
  }

  get AggregationSourceModel() {
    return this.aggregationSourceModel;
  }

  get ReportCacheModel() {
    return this.reportCacheModel;
  }

  public async disconnect(): Promise<void> {
    this.aggregator.stop();
    this.lifecycleManager.stop();
    await this.statsService.stop();
    await this.connection.close();
    this.redisClient.disconnect();
    await this.pluginManager.executeShutdownHooks();
  }

  /**
   * Creates a namespaced Key-Value store for caching.
   * @param prefix The prefix for all keys in this store.
   * @param defaultTTLSeconds The default time-to-live for keys in seconds.
   * @returns An instance of IKVStore.
   */
  public getCache(prefix: string, defaultTTLSeconds?: number): IKVStore {
    const dbName = this.connection.getClient().options.dbName ?? "global";
    return new RedisKVStore(
      this.redisClient,
      `${dbName}:cache:${prefix}`,
      defaultTTLSeconds,
    );
  }

  /**
   * Retrieves the latest internal engine statistics.
   */
  public getEngineStats(): Promise<IEngineStats | null> {
    return this.statsService.getStats();
  }

  /**
   * Registers a plugin with the engine.
   * @param plugin The plugin to register.
   */
  public async registerPlugin(plugin: IPlugin): Promise<void> {
    await this.pluginManager.register(plugin);
  }

  /**
   * Registers a data offloader plugin with the engine.
   * @param offloader The offloader plugin instance.
   */
  public registerOffloader(offloader: IDataOffloader): void {
    if (this.offloaders.has(offloader.name)) {
      console.warn(
        `Offloader plugin '${offloader.name}' is already registered. Overwriting.`,
      );
    }
    this.offloaders.set(offloader.name, offloader);
    console.log(`Registered offloader: ${offloader.name}`);
  }

  /**
   * Retrieves a registered offloader by its name.
   */
  public getOffloader(name: string): IDataOffloader | undefined {
    return this.offloaders.get(name);
  }

  public createEventSource(
    definition: Partial<IEventSourceDefinition>,
  ): Promise<IEventSource> {
    return EventSource.create(this, definition);
  }

  public findOrCreateEventSource(
    definition: Partial<IEventSourceDefinition>,
  ): Promise<IEventSource> {
    // EventSource.create already uses findOneAndUpdate with upsert,
    // so it behaves as a "find or create".
    return EventSource.create(this, definition);
  }

  public async createReport(reportData: IReport): Promise<IReportDoc> {
    const report = new this.ReportModel(reportData);
    await report.save();
    return report;
  }

  public async findOrCreateReport(
    definition: IReport,
  ): Promise<IReportDoc> {
    return await this.ReportModel.findOneAndUpdate(
      { name: definition.name },
      { $setOnInsert: definition },
      { new: true, upsert: true, runValidators: true },
    );
  }

  public getReportDefinition(
    reportId: string,
  ): Promise<IReportDoc | null> {
    return tracer.startActiveSpan(
      "engine.getReportDefinition",
      async (span) => {
        const report = await this.ReportModel.findById(reportId).lean();
        span.end();
        return report;
      },
    );
  }

  public async listReportDefinitions(ids?: string[]): Promise<IReportDoc[]> {
    const query = ids ? { _id: { $in: ids } } : {};
    return await this.ReportModel.find(query).lean();
  }

  public async updateReport(
    reportId: string,
    updates: Partial<IReport>,
  ): Promise<IReportDoc | null> {
    // Invalidate cache if the 'active' status might have changed.
    if (updates.active !== undefined) {
      await this.invalidateActiveAggregationSourcesCache();
    }
    return await this.ReportModel.findByIdAndUpdate(reportId, updates, {
      new: true,
    }).lean();
  }

  public async deleteReport(reportId: string): Promise<void> {
    await this.invalidateActiveAggregationSourcesCache();
    await this.AggregationSourceModel.deleteMany({
      reportId: new Types.ObjectId(reportId),
    });
    await this.ReportModel.findByIdAndDelete(reportId);
  }

  public async addAggregationSource(
    reportId: string,
    sourceData: Omit<IAggregationSource, "reportId" | "_id">,
  ): Promise<IAggregationSource> {
    await this.invalidateActiveAggregationSourcesCache();
    const aggregationSource = new this.AggregationSourceModel({
      ...sourceData,
      reportId: new Types.ObjectId(reportId),
    });
    await aggregationSource.save();
    return aggregationSource;
  }

  public async findOrCreateAggregationSource(
    reportId: string,
    definition: Omit<IAggregationSource, "reportId" | "_id">,
  ): Promise<IAggregationSource> {
    await this.invalidateActiveAggregationSourcesCache();
    const doc = await this.AggregationSourceModel.findOneAndUpdate(
      {
        reportId: new Types.ObjectId(reportId),
        targetCollection: definition.targetCollection,
      },
      {
        $setOnInsert: { ...definition, reportId: new Types.ObjectId(reportId) },
      },
      { new: true, upsert: true, runValidators: true },
    );
    // The return type of findOneAndUpdate is a Mongoose document, which matches IAggregationSource
    return doc;
  }

  public getAllActiveAggregationSources(): Promise<IAggregationSource[]> {
    return tracer.startActiveSpan(
      "engine.getAllActiveAggregationSources",
      async (span) => {
        const cacheKey = "all_active";
        const cached = await this.aggregationConfigCache.get<
          IAggregationSource[]
        >(cacheKey);
        if (cached) {
          span.setAttribute("cache.hit", true);
          span.end();
          return cached;
        }
        span.setAttribute("cache.hit", false);
        const activeReportIds = await this.ReportModel
          .find({ active: true })
          .select("_id")
          .lean();
        const sources = await this.AggregationSourceModel.find({
          reportId: { $in: activeReportIds.map((r) => r._id) },
        }).lean();
        await this.aggregationConfigCache.set(cacheKey, sources);
        span.end();
        return sources as IAggregationSource[];
      },
    );
  }
  public listAggregationSources(
    reportId: string,
  ): Promise<IAggregationSource[]> {
    return tracer.startActiveSpan(
      "engine.listAggregationSources",
      async (span) => {
        const sources = await this.AggregationSourceModel.find({ reportId })
          .lean();
        span.end();
        return sources as IAggregationSource[];
      },
    );
  }

  public async removeAggregationSource(
    aggregationSourceId: string,
  ): Promise<void> {
    await this.invalidateActiveAggregationSourcesCache();
    await this.AggregationSourceModel.findByIdAndDelete(
      aggregationSourceId,
    );
  }

  public async listEventSources(): Promise<IEventSourceDefinitionDoc[]> {
    return await this.EventSourceDefinitionModel.find().lean();
  }

  public async listEventTypesForSource(
    sourceName: string,
  ): Promise<IEventTypeDoc[]> {
    const source = await this.EventSourceDefinitionModel.findOne({
      name: sourceName,
    }).lean();
    if (!source) {
      return [];
    }
    return this.EventTypeModel.find({ sourceId: source._id }).lean();
  }

  public getReport(
    query: IQuery,
  ) {
    return tracer.startActiveSpan("engine.getReport", async (span) => {
      const result = await getReport(query, this);
      span.end();
      return result;
    });
  }

  public getDataset(
    query: IDatasetQuery,
  ) {
    return tracer.startActiveSpan("engine.getDataset", async (span) => {
      const result = await getDataset(query, this);
      span.end();
      return result;
    });
  }

  public async getEventSourceDefinitionById(
    id: string,
  ): Promise<IEventSourceDefinitionDoc | null> {
    const cacheKey = `id:${id}`;
    const cached = await this.eventSourceDefCache.get<
      IEventSourceDefinitionDoc
    >(
      cacheKey,
    );
    if (cached) return cached;

    const sourceDoc = await this.EventSourceDefinitionModel.findById(id).lean();
    if (sourceDoc) {
      await this.eventSourceDefCache.set(cacheKey, sourceDoc);
    }
    return sourceDoc;
  }

  public async getEventTypeById(
    id: string,
  ): Promise<IEventTypeDoc | null> {
    const cacheKey = `id:${id}`;
    const cached = await this.eventTypeCache.get<IEventTypeDoc>(cacheKey);
    if (cached) return cached;

    const eventTypeDoc = await this.EventTypeModel.findById(id).lean();
    if (eventTypeDoc) {
      await this.eventTypeCache.set(cacheKey, eventTypeDoc);
    }
    return eventTypeDoc;
  }

  public async getEventTypeByName(
    sourceId: Types.ObjectId,
    name: string,
  ): Promise<IEventTypeDoc | null> {
    const cacheKey = `source:${sourceId}:name:${name}`;
    const cached = await this.eventTypeCache.get<IEventTypeDoc>(cacheKey);
    if (cached) return cached;

    const eventTypeDoc = await this.EventTypeModel.findOne({
      sourceId: sourceId,
      name: name,
    }).lean();

    if (eventTypeDoc) {
      // also cache by id for consistency
      await this.eventTypeCache.set(cacheKey, eventTypeDoc);
      await this.eventTypeCache.set(`id:${eventTypeDoc._id}`, eventTypeDoc);
    }

    return eventTypeDoc;
  }

  /**
   * Retrieves an EventSource instance by its name.
   * This is the primary way to interact with a specific event source.
   * @param name The name of the event source.
   * @returns An IEventSource instance or null if not found.
   */
  public async getEventSource(
    name: string,
  ): Promise<IEventSource | null> {
    const sourceDef = await this.EventSourceDefinitionModel.findOne({
      name,
    }).lean();

    if (!sourceDef) {
      return null;
    }

    return new EventSource(this, sourceDef);
  }

  private async invalidateActiveAggregationSourcesCache(): Promise<void> {
    await this.aggregationConfigCache.del("all_active");
  }

  /**
   * Safely gets or creates a Mongoose model for a given event source name.
   * This prevents OverwriteModelError by checking if the model already exists.
   * @param sourceName The name of the event source.
   * @returns The Mongoose model for the event source's collection.
   */
  private getOrCreateModelForSource(
    sourceName: string,
  ): Model<EventPayload> {
    return createEventModel(this.connection, sourceName) as unknown as Model<
      EventPayload
    >;
  }

  /**
   * Retrieves all event source definitions from the database.
   * @returns A promise that resolves to an array of event source definitions.
   */
  public getEventSourceDefinitions(): Promise<IEventSourceDefinitionDoc[]> {
    return this.EventSourceDefinitionModel.find().lean();
  }

  /**
   * Counts the raw event documents in the database for each event source.
   * This is a diagnostic method to verify event recording before aggregation.
   * @returns A promise that resolves to a record mapping source names to their raw event counts.
   */
  public async getRawEventCountBySource(): Promise<Record<string, number>> {
    const sources = await this.getEventSourceDefinitions();
    const counts: Record<string, number> = {};

    for (const source of sources) {
      const eventModel = this.getOrCreateModelForSource(source.name);
      counts[source.name] = await eventModel.countDocuments();
    }

    return counts;
  }

  /**
   * Calculates the grand total of all raw event documents recorded in the system.
   * This is a diagnostic method.
   * @returns A promise that resolves to the total number of events.
   */
  public async getTotalRawEventCount(): Promise<number> {
    const countsBySource = await this.getRawEventCountBySource();
    return Object.values(countsBySource).reduce(
      (sum, count) => sum + count,
      0,
    );
  }

  public getRealtimeReport(
    query: IQuery,
  ) {
    return tracer.startActiveSpan("engine.getRealtimeReport", async (span) => {
      if (!this.aggregator.bufferService) return [];

      const aggregationSources = await this.listAggregationSources(
        query.reportId,
      );
      if (!aggregationSources || aggregationSources.length === 0) {
        return [];
      }

      const queryPromises = aggregationSources.map((source) => {
        return this.aggregator.bufferService!.query(
          query,
          source.targetCollection,
          source.filter,
        );
      });

      const bufferResults = (await Promise.all(queryPromises)).flat();

      const result = mergeAndAggregateResults(
        bufferResults,
        query.granularity,
        query.metric.type,
      );
      span.end();
      return result;
    });
  }

  public async getRealtimeDataset(
    query: IDatasetQuery,
  ): Promise<IDatasetDataPoint[]> {
    if (!this.aggregator.bufferService) return [];

    const aggregationSources = await this.listAggregationSources(
      query.reportId,
    );
    if (!aggregationSources || aggregationSources.length === 0) {
      return [];
    }

    const queryPromises = aggregationSources.map((source) => {
      return this.aggregator.bufferService!.queryDataset(
        query,
        source.targetCollection,
        source.filter,
      );
    });

    return (await Promise.all(queryPromises)).flat();
  }
}
