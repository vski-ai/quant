import { Database, MongoClient } from "deno_mongo";

let db: Database | null = null;

export async function connectMongo(): Promise<Database> {
  if (db) {
    return db;
  }

  const mongoUri = Deno.env.get("MONGO_URI");
  if (!mongoUri) {
    throw new Error("MONGO_URI is not defined in the environment variables.");
  }

  const client = new MongoClient();
  await client.connect(mongoUri);
  console.log("MongoDB connected");
  db = client.database();
  return db;
}
