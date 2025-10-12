import { define } from "@/root.ts";

export const handler = define.handlers({
  GET(_ctx) {
    return new Response("", {
      status: 307,
      headers: { Location: "/login" },
    });
  },
});
