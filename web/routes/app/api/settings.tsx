import { define } from "@/utils.ts";

export const handler = define.handlers({
  GET(ctx) {
    const res = new Response();
    res.headers.append(
      "Set-Cookie",
      `ui-theme=${ctx.req.headers.get("ui-theme")}; Path=/;`,
    );
    res.headers.append(
      "Set-Cookie",
      `ui-dense=${ctx.req.headers.get("ui-dense")}; Path=/;`,
    );
    res.headers.append(
      "Set-Cookie",
      `ui-aside=${ctx.req.headers.get("ui-aside")}; Path=/;`,
    );
    return res;
  },
});
