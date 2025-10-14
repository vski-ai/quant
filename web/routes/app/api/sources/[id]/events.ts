import { define } from "@/root.ts";
import quant from "@/db/quant.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const { params } = ctx;
    const { data, error } = await quant.getApiEventSourcesIdEvents({
      path: { id: params.id },
      query: { limit: "20" },
    });
    if (error) {
      return new Response(error.error, { status: 400 });
    }
    return Response.json(data);
  },
});
