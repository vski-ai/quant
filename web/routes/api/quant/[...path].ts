import { define } from "@/root.ts";
import master from "@/db/quant.ts"

// Proxy requests to the quant api
// Using master key to get user's keys 
// Using user's api key to make a request
export const handler = define.handlers(async (ctx) => {
  if (!ctx.state.user || !ctx.state.session) {
    return Response.json(null, { status: 401 })
  }
  const owner = ctx.state.user?._id.toString();
  const { data: keys } = await master.getApiAuthKeys({
    query: {
      owner,
    },
  });
  
  const userKey = keys?.find(key => key.enabled)
  if (!userKey) {
    return Response.json(null, { status: 401 })
  }

  const baseUrl = Deno.env.get("QUANT_API_BASE_URL")!
  const res = fetch(new URL(ctx.params.path, baseUrl), {
    method: ctx.req.method,
    headers: {
      "X-Api-Key": userKey.key
    }
  })
  return res
})