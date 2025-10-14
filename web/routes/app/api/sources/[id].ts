import { define } from "@/root.ts";
import quant from "@/db/quant.ts";

export const handler = define.handlers({
  async PATCH(ctx) {
    const { params } = ctx;
    const { name, description } = await ctx.req.json();
    const { data, error } = await quant.patchApiEventSourcesId({
      path: { id: params.id },
      body: { name, description },
    });
    if (error) {
      return new Response(error.error, { status: 400 });
    }
    return Response.json(data);
  },
  async DELETE(ctx) {
    const { params } = ctx;
    const { data, error } = await quant.deleteApiEventSourcesId({
      path: { id: params.id },
    });
    if (error) {
      return new Response(error.error, { status: 400 });
    }
    return Response.json(data);
  },
});
