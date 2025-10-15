import { define } from "@/root.ts";
import quant from "@/db/quant.ts";

export const handler = define.handlers({
  async DELETE(ctx) {
    const { sourceId } = ctx.req.param();

    const { data, error } = await quant.deleteApiAggregationSourcesSourceId({
      path: { sourceId },
    });

    if (error) {
      return new Response((error as any).error, { status: 400 });
    }

    return Response.json(data);
  },
});
