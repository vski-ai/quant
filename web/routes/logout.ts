import { define } from "@/root.ts";
import { deleteCookie } from "@std/http";

export const handler = define.handlers({
  GET(ctx) {
    const headers = new Headers();
    deleteCookie(headers, "q_session", { path: "/", domain: ctx.url.hostname });
    headers.set("location", "/login");
    return new Response(null, {
      status: 302,
      headers,
    });
  },
});
