import { Connection, Schema } from "mongoose";
import { ApiKey } from "../types.ts";

// --- ApiKey Schema ---
const QuotaSchema = new Schema({
  requestsPerSecond: { type: Number, required: true },
  requestsPerDay: { type: Number, required: true },
  totalRequests: { type: Number, required: true },
}, { _id: false });

const ApiKeySchema = new Schema<ApiKey>({
  key: { type: String, required: true, unique: true, index: true },
  owner: { type: String, required: true, index: true },
  quotas: { type: QuotaSchema, required: true },
  enabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// --- Ownership Schema ---
type EntityType = "report" | "eventSource";

interface IOwnership {
  owner: string;
  entityType: EntityType;
  entityId: string;
}

const OwnershipSchema = new Schema<IOwnership>({
  owner: { type: String, required: true, index: true },
  entityType: { type: String, required: true, enum: ["report", "eventSource"] },
  entityId: { type: String, required: true },
});
OwnershipSchema.index({ owner: 1, entityType: 1, entityId: 1 }, {
  unique: true,
});

export type MongoAuthStorage = ReturnType<typeof createMongoAuthStorage>;

export function createMongoAuthStorage(connection: Connection) {
  const ApiKeyModel = connection.model<ApiKey>(
    "auth_apikeys",
    ApiKeySchema,
    "auth_apikeys",
  );
  const OwnershipModel = connection.model<IOwnership>(
    "auth_ownership",
    OwnershipSchema,
    "auth_ownership",
  );

  return {
    async getApiKey(key: string): Promise<ApiKey | null> {
      return await ApiKeyModel.findOne({ key }).lean();
    },
    async createApiKey(key: ApiKey): Promise<void> {
      await ApiKeyModel.create(key);
    },
    async updateApiKey(
      key: string,
      data: Partial<ApiKey>,
    ): Promise<ApiKey | null> {
      return await ApiKeyModel.findOneAndUpdate({ key }, {
        ...data,
        updatedAt: new Date(),
      }, { new: true }).lean();
    },
    async deleteApiKey(key: string): Promise<void> {
      await ApiKeyModel.deleteOne({ key });
      const apiKey = await this.getApiKey(key);
      if (apiKey) {
        await OwnershipModel.deleteMany({ owner: apiKey.owner });
      }
    },
    async associateEntity(
      owner: string,
      entityType: EntityType,
      entityId: string,
    ): Promise<void> {
      await OwnershipModel.updateOne(
        { owner, entityType, entityId },
        { $setOnInsert: { owner, entityType, entityId } },
        { upsert: true },
      );
    },
    async disassociateEntity(
      owner: string,
      entityType: EntityType,
      entityId: string,
    ): Promise<void> {
      await OwnershipModel.deleteOne({ owner, entityType, entityId });
    },
    async getOwnedEntityIds(
      owner: string,
      entityType: EntityType,
    ): Promise<string[]> {
      const results = await OwnershipModel.find({ owner, entityType }).select(
        "entityId",
      ).lean();
      return results.map((r) => r.entityId);
    },
    async isEntityOwner(
      owner: string,
      entityType: EntityType,
      entityId: string,
    ): Promise<boolean> {
      const count = await OwnershipModel.countDocuments({
        owner,
        entityType,
        entityId,
      });
      return count > 0;
    },
  };
}
