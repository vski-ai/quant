import { define } from "@/root.ts";
import master from "@/db/quant.ts";
import { Roles } from "@/db/models.ts";

// Proxy requests to the quant api
// Using master key to get user's keys
// Using user's api key to make a request
export const handler = define.handlers(async (ctx) => {
  if (!ctx.state.user || !ctx.state.session) {
    return Response.json({}, { status: 401 });
  }
  const owner = ctx.state.user?._id.toString();
  const { data: keys } = await master.getApiAuthKeys({
    query: {
      owner,
    },
  });

  const userKey = keys?.find((key) => key.enabled);
  if (!userKey) {
    return Response.json({}, { status: 401 });
  }

  const baseUrl = Deno.env.get("QUANT_API_BASE_URL")!;
  const url = new URL(ctx.params.path, baseUrl);
  ctx.url.searchParams.entries().forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });
  const res = await fetch(url, {
    method: ctx.req.method,
    headers: {
      "X-Api-Key": userKey.key,
      "X-Master-Key": ctx.state.user?.roles
          .includes(Roles.admin)
        ? Deno.env.get("QUANT_API_MASTER_KEY")!
        : "",
      "content-type": ctx.req.headers.get("content-type") ?? "",
    },
    body: ctx.req.body,
  });
  return Response.json(await res.json(), { status: res.status });
});
