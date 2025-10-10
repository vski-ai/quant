import { Redis } from "ioredis";
import type { ApiKey, Usage } from "../types.ts";
import { ApiKeyNotFoundError } from "../errors.ts";

const API_KEY_PREFIX = "api_key:";
const USAGE_PREFIX = "usage:";
const OWNER_REPORTS_PREFIX = "owner_reports:";
const OWNER_SOURCES_PREFIX = "owner_sources:";

export type RedisAuthStorage = ReturnType<typeof createRedisAuthStorage>;

export function createRedisAuthStorage(redis?: Redis) {
  const client = redis || new Redis();

  return {
    async createApiKey(key: ApiKey): Promise<void> {
      await client.set(`${API_KEY_PREFIX}${key.key}`, JSON.stringify(key));
    },

    async getApiKey(key: string): Promise<ApiKey | null> {
      const data = await client.get(`${API_KEY_PREFIX}${key}`);
      if (!data) {
        return null;
      }
      return JSON.parse(data);
    },

    async updateApiKey(
      key: string,
      data: Partial<ApiKey>,
    ): Promise<void> {
      const apiKey = await this.getApiKey(key);
      if (!apiKey) {
        throw new ApiKeyNotFoundError(key);
      }
      const updatedApiKey = {
        ...apiKey,
        ...data,
        // Deep merge quotas if they are part of the update
        quotas: data.quotas
          ? { ...apiKey.quotas, ...data.quotas }
          : apiKey.quotas,
        updatedAt: new Date(),
      };
      await client.set(
        `${API_KEY_PREFIX}${key}`,
        JSON.stringify(updatedApiKey),
      );
    },

    async deleteApiKey(key: string): Promise<void> {
      await client.del(`${API_KEY_PREFIX}${key}`);
    },

    async getUsage(
      key: string,
      window: "second" | "day" | "total",
    ): Promise<Usage | null> {
      const data = await client.get(`${USAGE_PREFIX}${key}:${window}`);
      if (!data) {
        return null;
      }
      return JSON.parse(data);
    },

    async incrementUsage(
      key: string,
      window: "second" | "day" | "total",
    ): Promise<number> {
      const keyName = `${USAGE_PREFIX}${key}:${window}`;
      const result = await client.incr(keyName);

      if (window !== "total" && result === 1) {
        const ttl = window === "second" ? 1 : 60 * 60 * 24;
        await client.expire(keyName, ttl);
      }

      return result;
    },

    async getAllUsage(): Promise<Record<string, Record<string, number>>> {
      const usageData: Record<string, Record<string, number>> = {};
      const stream = client.scanStream({
        match: `${USAGE_PREFIX}*`,
        count: 100,
      });

      const keys: string[] = await new Promise((res) => {
        const keys: string[] = [];
        stream.on("data", (resultKeys) => keys.push(...resultKeys));
        stream.on("end", () => res(keys));
      });

      if (keys.length === 0) return usageData;

      const values = await client.mget(...keys);

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = values[i];
        const parts = key.split(":");
        const apiKey = parts[1];
        const window = parts[2];

        if (!usageData[apiKey]) {
          usageData[apiKey] = {};
        }

        if (value) {
          usageData[apiKey][window] = parseInt(value, 10);
        }
      }

      return usageData;
    },

    async getAllUsageFor(
      key: string,
    ): Promise<Record<string, number>> {
      const keys = [
        `${USAGE_PREFIX}${key}:second`,
        `${USAGE_PREFIX}${key}:day`,
        `${USAGE_PREFIX}${key}:total`,
      ];

      const values = await client.mget(...keys);

      return {
        second: parseInt(values[0] ?? "0", 10),
        day: parseInt(values[1] ?? "0", 10),
        total: parseInt(values[2] ?? "0", 10),
      };
    },

    // --- Ownership Methods ---

    async associateReport(owner: string, reportId: string): Promise<void> {
      await client.sadd(`${OWNER_REPORTS_PREFIX}${owner}`, reportId);
    },

    async disassociateReport(owner: string, reportId: string): Promise<void> {
      await client.srem(`${OWNER_REPORTS_PREFIX}${owner}`, reportId);
    },

    async getOwnedReportIds(owner: string): Promise<string[]> {
      return await client.smembers(`${OWNER_REPORTS_PREFIX}${owner}`);
    },

    async isReportOwner(owner: string, reportId: string): Promise<boolean> {
      return (await client.sismember(
        `${OWNER_REPORTS_PREFIX}${owner}`,
        reportId,
      )) === 1;
    },

    async associateEventSource(owner: string, sourceId: string): Promise<void> {
      await client.sadd(`${OWNER_SOURCES_PREFIX}${owner}`, sourceId);
    },

    async disassociateEventSource(
      owner: string,
      sourceId: string,
    ): Promise<void> {
      await client.srem(`${OWNER_SOURCES_PREFIX}${owner}`, sourceId);
    },

    async getOwnedEventSourceIds(owner: string): Promise<string[]> {
      return await client.smembers(`${OWNER_SOURCES_PREFIX}${owner}`);
    },

    async isEventSourceOwner(
      owner: string,
      sourceId: string,
    ): Promise<boolean> {
      return (await client.sismember(
        `${OWNER_SOURCES_PREFIX}${owner}`,
        sourceId,
      )) === 1;
    },
  };
}
