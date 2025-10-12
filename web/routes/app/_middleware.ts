import { Context } from "fresh";
import { getCookies, setCookie } from "@std/http";
import { State } from "@/root.ts";

const SESSION_COOKIE = "q_session";
const PERIOD_COOKIE = "q_period";

declare module "@/root.ts" {
  interface State {
    session?: string;
    period?: string;
  }
}

export async function handler(
  ctx: Context<State>,
) {
  const cookies = getCookies(ctx.req.headers);
  const session = cookies[SESSION_COOKIE];

  if (!session) {
    return new Response("", {
      status: 307,
      headers: { Location: "/login" },
    });
  }

  ctx.state.session = session;
  const period = ctx.url.searchParams.get("period");
  ctx.state.period = period!;

  const resp = await ctx.next();

  if (period) {
    setCookie(resp.headers, {
      name: PERIOD_COOKIE,
      value: period,
      path: "/",
      maxAge: 31536000, // 1 year
    });
  }
  return resp;
}
