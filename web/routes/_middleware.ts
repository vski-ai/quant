import { define } from "@/root.ts";
import { getUserBySession } from "@/db/user.ts";
import { Plan, Roles, User, UserProfile } from "@/db/models.ts";
import { Cookie, getCookie } from "@/shared/cookies.ts";
import userApi from "@/shared/api.ts";
import masterApi from "@/db/quant.ts";

declare module "@/root.ts" {
  interface State {
    ui: {
      theme?: string;
      dense?: string;
      aside?: string;
      width?: number;
      height?: number;
    };
    session?: string;
    user?: User & { profile: UserProfile & { plan: Plan } };
    client: ReturnType<typeof userApi>;
  }
}

export const handler = define.middleware(async (ctx) => {
  ctx.state.ui = ctx.state.ui || {};
  ctx.state.ui.theme = getCookie(ctx.req.headers, Cookie.UI_THEME);
  ctx.state.ui.dense = getCookie(ctx.req.headers, Cookie.UI_DENSE);
  ctx.state.ui.aside = getCookie(ctx.req.headers, Cookie.UI_ASIDE);

  const [w, h] = getCookie(ctx.req.headers, Cookie.UI_SCREEN)?.split("|")
    .filter(Boolean)
    .map(Number) ?? [800, 600];

  ctx.state.ui.width = w;
  ctx.state.ui.height = h;

  const sessionToken = getCookie(ctx.req.headers, Cookie.APP_SESSION);
  if (sessionToken) {
    const user = await getUserBySession(sessionToken).catch(console.error);
    if (user) {
      ctx.state.session = sessionToken;
      ctx.state.user = user;
      ctx.state.client = userApi(sessionToken);
    }
  }
  return await ctx.next();
});
