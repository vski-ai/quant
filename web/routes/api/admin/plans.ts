import { define } from "@/root.ts";
import { connectMongo } from "@/db/mongo.ts";
import { Plan } from "@/db/models.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = form.get("name")?.toString();
    const requestsPerDay = Number(form.get("requestsPerDay"));
    const requestsPerSecond = Number(form.get("requestsPerSecond"));
    const totalRequests = Number(form.get("totalRequests"));

    if (!name || !requestsPerDay || !requestsPerSecond || !totalRequests) {
      return new Response("Missing required fields", { status: 400 });
    }

    try {
      await connectMongo();

      const newPlan = new Plan({
        name,
        quotas: {
          requestsPerDay,
          requestsPerSecond,
          totalRequests,
        },
      });

      await newPlan.save();

      const headers = new Headers();
      headers.set("location", "/app/admin/plans");
      return new Response(null, {
        status: 303, // See Other
        headers,
      });
    } catch (error) {
      console.error("Plan creation error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});
