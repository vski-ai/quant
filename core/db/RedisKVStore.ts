import { Redis } from "ioredis";

export interface IKVStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  getMany<T>(keys: string[]): Promise<(T | null)[]>;
}

/**
 * A generic Key-Value store implementation using Redis.
 * It handles key prefixing, serialization/deserialization, and TTL management.
 */
export class RedisKVStore implements IKVStore {
  constructor(
    private redis: Redis,
    private prefix: string,
    private defaultTTLSeconds: number = 60 * 60, // 1 hour default
  ) {}

  private getKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  public async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getKey(key);
    const data = await this.redis.get(fullKey);
    if (!data) {
      return null;
    }
    try {
      return JSON.parse(data) as T;
    } catch (e) {
      console.error(`Error parsing JSON from cache for key ${fullKey}:`, e);
      // In case of malformed data, treat it as a cache miss.
      return null;
    }
  }

  public async set<T>(
    key: string,
    value: T,
    ttlSeconds?: number,
  ): Promise<void> {
    const fullKey = this.getKey(key);
    const ttl = ttlSeconds ?? this.defaultTTLSeconds;
    const stringifiedValue = JSON.stringify(value);

    if (ttl > 0) {
      await this.redis.set(fullKey, stringifiedValue, "EX", ttl);
    } else {
      // A TTL of 0 or less means the key should not expire.
      await this.redis.set(fullKey, stringifiedValue);
    }
  }

  public async del(key: string): Promise<void> {
    const fullKey = this.getKey(key);
    await this.redis.del(fullKey);
  }

  public async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) {
      return [];
    }
    const fullKeys = keys.map((key) => this.getKey(key));
    const results = await this.redis.mget(...fullKeys);

    return results.map((data) => {
      if (!data) return null;
      try {
        return JSON.parse(data) as T;
      } catch {
        return null;
      }
    });
  }
}
