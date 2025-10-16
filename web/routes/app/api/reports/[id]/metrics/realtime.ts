import { define } from "@/root.ts";
import quant from "@/db/quant.ts";
import { AggregationType, Granularity } from "@/core/types.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const { id } = ctx.req.param();
    const { timeRange, granularity, metric } = await ctx.req.json();

    // Note: The client SDK might not have a dedicated `realtime` method.
    // We are calling the standard data endpoint and adding the `realtime: true` flag,
    // assuming the backend API is designed to handle this.
    const { data, error } = await quant.postApiReportsIdData({
      path: { id },
      body: {
        timeRange,
        granularity: granularity as Granularity,
        metric: metric as { type: AggregationType; field?: string },
        realtime: true,
      },
    });

    if (error) {
      return new Response((error as any).error, { status: 400 });
    }

    return Response.json(data);
  },
});
