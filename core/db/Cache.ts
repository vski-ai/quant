import { createHash } from "node:crypto";
import { Engine } from "../engine.ts";
import { IDatasetDataPoint, IQuery, ITimeRange } from "../types.ts";
import { IReportCacheDoc } from "./ReportCache.ts";

function sortObject<T>(obj: T): T {
  if (obj instanceof Date) {
    return obj.getTime() as any;
  }
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObject) as any;
  }
  if (obj.constructor !== Object) {
    return obj;
  }
  const sortedKeys = Object.keys(obj).sort();
  const newObj: any = {};
  for (const key of sortedKeys) {
    newObj[key] = sortObject((obj as any)[key]);
  }
  return newObj;
}

export function generateCacheKey(query: IQuery | any): string {
  const stableQuery = sortObject({
    ...query,
    rebuildCache: undefined,
    cache: undefined,
  });
  const queryString = JSON.stringify(stableQuery);
  return createHash("sha256").update(queryString).digest("hex");
}

export function generateBaseCacheKey(query: IQuery | any): string {
  const stableQuery = sortObject({
    ...query,
    timeRange: undefined,
    rebuildCache: undefined,
    cache: undefined,
  });
  const queryString = JSON.stringify(stableQuery);
  return createHash("sha256").update(queryString).digest("hex");
}

export async function getFromCache(
  engine: Engine,
  key: string,
): Promise<any[] | null> {
  const cached = await engine.ReportCacheModel.findOne({ cacheKey: key })
    .lean();
  const ttlSeconds = engine.config.cache?.ttlSeconds;

  if (cached && ttlSeconds && ttlSeconds > 0) {
    const isExpired =
      (Date.now() - cached.createdAt.getTime()) > (ttlSeconds * 1000);
    if (isExpired) {
      return null;
    }
  }
  if (cached) {
    return cached.data as any[];
  }
  return null;
}

export function findCacheGaps(
  requestedRange: ITimeRange,
  cachedChunks: IReportCacheDoc[],
): {
  cachedData: IDatasetDataPoint[];
  gaps: ITimeRange[];
} {
  if (cachedChunks.length === 0) {
    return { cachedData: [], gaps: [requestedRange] };
  }

  cachedChunks.sort((a, b) =>
    a.timeRange.start.getTime() - b.timeRange.start.getTime()
  );

  const gaps: ITimeRange[] = [];
  let lastCoveredTime = requestedRange.start.getTime();
  const cachedData = cachedChunks.flatMap((chunk) =>
    chunk.data as IDatasetDataPoint[]
  );

  for (const chunk of cachedChunks) {
    const chunkStart = chunk.timeRange.start.getTime();
    const chunkEnd = chunk.timeRange.end.getTime();

    if (chunkStart > lastCoveredTime) {
      gaps.push({
        start: new Date(lastCoveredTime),
        end: new Date(chunkStart),
      });
    }

    if (chunkEnd > lastCoveredTime) {
      lastCoveredTime = chunkEnd;
    }
  }

  if (requestedRange.end.getTime() > lastCoveredTime) {
    gaps.push({
      start: new Date(lastCoveredTime),
      end: requestedRange.end,
    });
  }

  return { cachedData, gaps };
}

export async function saveToCache(
  query: IQuery | any,
  data: any[],
  engine: Engine,
) {
  const cacheConfig = engine.config.cache;
  if (!cacheConfig?.enabled) return;

  if (cacheConfig.partialHits) {
    const baseKey = generateBaseCacheKey(query);
    await engine.ReportCacheModel.create({
      baseKey,
      timeRange: query.timeRange,
      reportId: query.reportId,
      data,
    });
  } else {
    const cacheKey = generateCacheKey(query);
    await engine.ReportCacheModel.findOneAndUpdate(
      { cacheKey: cacheKey },
      {
        cacheKey: cacheKey,
        baseKey: cacheKey,
        timeRange: query.timeRange,
        data,
        reportId: query.reportId,
      },
      { upsert: true, new: true },
    ).exec();
  }
}
