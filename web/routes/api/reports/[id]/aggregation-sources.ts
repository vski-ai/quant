import { define } from "@/root.ts";
import quant from "@/db/quant.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const { id } = ctx.params;
    const body = await ctx.req.json();

    const { data, error } = await quant.postApiAggregationSources({
      query: { reportId: id },
      body: body,
    });

    if (error) {
      return new Response((error as any).error, { status: 400 });
    }

    return Response.json(data);
  },
});
