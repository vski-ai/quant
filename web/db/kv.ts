import { connectMongo } from "@/db/mongo.ts";
import { QueryAndFilters, UIPreset } from "@/db/models.ts";
import { LruCache } from "@std/cache";

const mongo = await connectMongo();

export const createKV = <T extends { key: string; value: unknown }>(
  prefix: string,
) => {
  return async function presetStore(...tags: string[]) {
    const cache = new LruCache<string, Promise<T | undefined>>(5000);
    const name = `${prefix}_${tags.join("_")}`;
    const collection = await mongo.createCollection<T>(name);
    collection.createIndexes({
      indexes: [{
        key: { key: 1 },
        name: name + "_idx",
        unique: true,
        background: true,
      }],
    }).catch();
    return {
      get(key: string) {
        return cache.get(key) ??
          // @ts-ignore:
          cache.set(key, collection.findOne({ key })).get(key);
      },
      set(key: string, value: Record<string, unknown>) {
        cache.delete(key);
        // @ts-ignore:
        return collection.updateOne({ key }, { value }, { upsert: true });
      },
      del(key: string) {
        cache.delete(key);
        // @ts-ignore:
        return collection.deleteOne({ key });
      },
    };
  };
};

export const presetStore = createKV<UIPreset>("ui_preset");
export const queryStore = createKV<QueryAndFilters>("queries_filters");
