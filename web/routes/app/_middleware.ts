import { Context } from "fresh";
import { deleteCookie, getCookies, setCookie } from "@std/http";
import { State } from "@/root.ts";
import { getUserBySession } from "@/db/user.ts";
import { Plan, User, UserProfile } from "@/db/models.ts";

const SESSION_COOKIE = "q_session";
const PERIOD_COOKIE = "q_period";
const GRANULARITY_COOKIE = "q_granularity";

declare module "@/root.ts" {
  interface State {
    session?: string;
    user?: User & { profile: UserProfile & { plan: Plan } };
    period?: string;
    granularity?: string;
  }
}

export async function handler(
  ctx: Context<State>,
) {
  const cookies = getCookies(ctx.req.headers);
  const sessionToken = cookies[SESSION_COOKIE];

  if (!sessionToken) {
    return new Response("", {
      status: 307,
      headers: { Location: "/login" },
    });
  }

  const user = await getUserBySession(sessionToken);

  if (!user) {
    const headers = new Headers();
    deleteCookie(headers, SESSION_COOKIE, {
      path: "/",
      domain: ctx.url.hostname,
    });
    headers.set("location", "/login");
    return new Response(null, {
      status: 307,
      headers,
    });
  }

  ctx.state.session = sessionToken;
  ctx.state.user = user;

  const period = ctx.url.searchParams.get("period") ?? cookies[PERIOD_COOKIE];
  ctx.state.period = period!;

  const granularity = ctx.url.searchParams.get("granularity") ??
    cookies[GRANULARITY_COOKIE];
  ctx.state.granularity = granularity!;

  if (ctx.req.headers.get("upgrade") === "websocket") {
    return await ctx.next();
  }

  const resp = await ctx.next();

  if (period) {
    setCookie(resp.headers, {
      name: PERIOD_COOKIE,
      value: period,
      path: "/",
      maxAge: 31536000, // 1 year
    });
  }

  if (granularity) {
    setCookie(resp.headers, {
      name: GRANULARITY_COOKIE,
      value: granularity,
      path: "/",
      maxAge: 31536000, // 1 year
    });
  }

  return resp;
}
