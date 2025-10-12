import { deleteCookie } from "@std/http";
import { define } from "@/root.ts";

export const handler = define.handlers({
  GET(ctx) {
    const url = new URL(ctx.req.url);
    const headers = new Headers();
    deleteCookie(headers, "q_session", { path: "/", domain: url.hostname });

    headers.set("location", "/login");
    return new Response(null, {
      status: 302,
      headers,
    });
  },
});
