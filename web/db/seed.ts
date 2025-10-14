import { connectMongo } from "@/db/mongo.ts";
import { Plan } from "@/db/models.ts";

export async function seedDatabase() {
  const db = await connectMongo();
  const Plans = db.collection<Plan>("plans");

  const communityPlan = await Plans.findOne({ name: "community" });
  if (!communityPlan) {
    await Plans.insertOne({
      name: "community",
      quotas: {
        requestsPerDay: 1000,
        requestsPerSecond: 10,
        totalRequests: 100000,
      },
    });
    console.log("Created community plan");
  }

  const enterprisePlan = await Plans.findOne({ name: "enterprise" });
  if (!enterprisePlan) {
    await Plans.insertOne({
      name: "enterprise",
      quotas: {
        requestsPerDay: 100000,
        requestsPerSecond: 100,
        totalRequests: 10000000,
      },
    });
    console.log("Created enterprise plan");
  }
}
