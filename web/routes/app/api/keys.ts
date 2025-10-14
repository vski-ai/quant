import { define } from "@/root.ts";
import api from "@/db/quant.ts";
import { connectMongo } from "@/db/mongo.ts";
import { Plan } from "@/db/models.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const { name } = await ctx.req.json();
    const user = ctx.state.user;

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    let quotas;
    if (user.profile?.plan?.quotas) {
      quotas = user.profile.plan.quotas!;
    } else {
      const db = await connectMongo();
      const Plans = db.collection<Plan>("plans");
      const communityPlan = await Plans.findOne({ name: "community" });
      quotas = communityPlan?.quotas!;
    }

    try {
      const { data: newKey, error } = await api.postApiAuthKeys({
        body: {
          owner: user._id.toString(),
          name,
          quotas,
        },
      });
      if (error) {
        return new Response(error.error, { status: 400 });
      }
      return Response.json(newKey);
    } catch (error) {
      return new Response((error as Error).message, { status: 500 });
    }
  },
  async DELETE(ctx) {
    const { id } = await ctx.req.json();
    const user = ctx.state.user;

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const { data: key, error: getKeyError } = await api.getApiAuthKeysId({
        path: { id },
      });
      if (getKeyError) {
        return new Response(getKeyError.error, { status: 404 });
      }

      if (key.owner !== user._id.toString()) {
        return new Response("Forbidden", { status: 403 });
      }

      const { error } = await api.deleteApiAuthKeysId({ path: { id } });
      if (error) {
        return new Response(error.error, { status: 400 });
      }
      return new Response(null, { status: 204 });
    } catch (error) {
      return new Response((error as Error).message, { status: 500 });
    }
  },
  async PATCH(ctx) {
    const { id, enabled } = await ctx.req.json();
    const user = ctx.state.user;

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const { data: key, error: getKeyError } = await api.getApiAuthKeysId({
        path: { id },
      });
      if (getKeyError) {
        return new Response(getKeyError.error, { status: 404 });
      }

      if (key.owner !== user._id.toString()) {
        return new Response("Forbidden", { status: 403 });
      }

      const { error } = await api.patchApiAuthKeysId({
        path: { id },
        body: { enabled },
      });
      if (error) {
        return new Response(error.error, { status: 400 });
      }
      return new Response(null, { status: 204 });
    } catch (error) {
      return new Response((error as Error).message, { status: 500 });
    }
  },
});
