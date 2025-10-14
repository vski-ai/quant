import { Connection } from "mongoose";
import { Redis } from "ioredis";
import { ApiKey } from "../types.ts";
import { createMongoAuthStorage } from "./mongo.ts";
import { createRedisAuthStorage } from "./redis.ts";
import { ApiKeyNotFoundError } from "../errors.ts";

export type AuthStorage = ReturnType<typeof createAuthStorage>;

/**
 * Implements read-through and write-through strategy.
 * Redis is primary - Mongo is a backup
 */
export function createAuthStorage(connection: Connection, redis?: Redis) {
  const redisStorage = createRedisAuthStorage(redis);
  const mongoStorage = createMongoAuthStorage(connection);

  return {
    async getApiKey(key: string): Promise<ApiKey | null> {
      let apiKey = await redisStorage.getApiKey(key);
      if (apiKey) return apiKey;
      apiKey = await mongoStorage.getApiKey(key);
      if (apiKey) {
        await redisStorage.createApiKey(apiKey);
      }
      return apiKey;
    },

    async createApiKey(key: ApiKey): Promise<void> {
      await mongoStorage.createApiKey(key);
      await redisStorage.createApiKey(key);
    },

    async updateApiKey(id: string, data: Partial<ApiKey>): Promise<void> {
      const keyData = await mongoStorage.getApiKeyById(id);
      if (!keyData) {
        throw new Error("Failed to delete api key");
      }
      const key = keyData.key;
      const updatedKey = await mongoStorage.updateApiKey(key, data);
      if (!updatedKey) {
        throw new ApiKeyNotFoundError(key);
      }
      await redisStorage.createApiKey(updatedKey);
    },

    async deleteApiKey(id: string): Promise<void> {
      const keyData = await mongoStorage.getApiKeyById(id);
      if (!keyData) {
        throw new Error("Failed to delete api key");
      }
      await mongoStorage.deleteApiKey(keyData.key);
      await redisStorage.deleteApiKey(keyData.key);
    },

    async listApiKeys(filter: { owner?: string }): Promise<ApiKey[]> {
      return await mongoStorage.listApiKeys(filter);
    },

    async isReportOwner(owner: string, reportId: string): Promise<boolean> {
      const isOwnerInCache = await redisStorage.isReportOwner(owner, reportId);
      if (isOwnerInCache) return true;

      const isOwnerInDb = await mongoStorage.isEntityOwner(
        owner,
        "report",
        reportId,
      );
      if (isOwnerInDb) {
        await redisStorage.associateReport(owner, reportId);
      }
      return isOwnerInDb;
    },

    async getOwnedReportIds(owner: string): Promise<string[]> {
      return await mongoStorage.getOwnedEntityIds(owner, "report");
    },

    async isEventSourceOwner(
      owner: string,
      sourceId: string,
    ): Promise<boolean> {
      const isOwnerInCache = await redisStorage.isEventSourceOwner(
        owner,
        sourceId,
      );
      if (isOwnerInCache) return true;

      const isOwnerInDb = await mongoStorage.isEntityOwner(
        owner,
        "eventSource",
        sourceId,
      );
      if (isOwnerInDb) {
        await redisStorage.associateEventSource(owner, sourceId);
      }
      return isOwnerInDb;
    },

    async getOwnedEventSourceIds(owner: string): Promise<string[]> {
      return await mongoStorage.getOwnedEntityIds(owner, "eventSource");
    },

    async associateReport(owner: string, reportId: string): Promise<void> {
      await mongoStorage.associateEntity(owner, "report", reportId);
      await redisStorage.associateReport(owner, reportId);
    },

    async disassociateReport(owner: string, reportId: string): Promise<void> {
      await mongoStorage.disassociateEntity(owner, "report", reportId);
      await redisStorage.disassociateReport(owner, reportId);
    },

    async associateEventSource(owner: string, sourceId: string): Promise<void> {
      await mongoStorage.associateEntity(owner, "eventSource", sourceId);
      await redisStorage.associateEventSource(owner, sourceId);
    },

    async disassociateEventSource(
      owner: string,
      sourceId: string,
    ): Promise<void> {
      await mongoStorage.disassociateEntity(owner, "eventSource", sourceId);
      await redisStorage.disassociateEventSource(owner, sourceId);
    },

    // Usage is ephemeral and high-frequency, so it stays in Redis.
    incrementUsage: redisStorage.incrementUsage,
    getAllUsage: redisStorage.getAllUsage,
    getAllUsageFor: redisStorage.getAllUsageFor,
    getUsage: redisStorage.getUsage,
  };
}
