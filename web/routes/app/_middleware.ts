import { Context } from "fresh";
import { State } from "@/root.ts";
import { Cookie, getCookie, setCookieHeader } from "@/shared/cookies.ts";

declare module "@/root.ts" {
  interface State {
    period?: string;
    granularity?: string;
  }
}

export async function handler(
  ctx: Context<State>,
) {
  const { state } = ctx;

  if (!state.session || !state.user) {
    return new Response("", {
      status: 307,
      headers: { Location: "/login" },
    });
  }

  const period = ctx.url.searchParams.get("period") ??
    getCookie(ctx.req.headers, Cookie.PERIOD);
  ctx.state.period = period!;

  const granularity = ctx.url.searchParams.get("granularity") ??
    getCookie(ctx.req.headers, Cookie.GRANULARITY);
  ctx.state.granularity = granularity!;

  const resp = await ctx.next();

  if (period) {
    setCookieHeader(resp.headers, Cookie.PERIOD, period);
  }

  if (granularity) {
    setCookieHeader(resp.headers, Cookie.GRANULARITY, granularity);
  }

  return resp;
}
