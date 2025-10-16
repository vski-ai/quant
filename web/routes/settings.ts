import { define } from "@/root.ts";
import { Cookie, setCookieHeader } from "@/shared/cookies.ts";

export const handler = define.handlers({
  GET(ctx) {
    const res = new Response();
    setCookieHeader(
      res.headers,
      Cookie.UI_THEME,
      ctx.req.headers.get("ui-theme")!,
    );
    setCookieHeader(
      res.headers,
      Cookie.UI_DENSE,
      ctx.req.headers.get("ui-dense")!,
    );
    setCookieHeader(
      res.headers,
      Cookie.UI_ASIDE,
      ctx.req.headers.get("ui-aside")!,
    );
    const w = ctx.req.headers.get("ui-width") || 800;
    const h = ctx.req.headers.get("ui-height") || 600;

    setCookieHeader(res.headers, Cookie.UI_SCREEN, `${w}|${h}`);
    return res;
  },
});
