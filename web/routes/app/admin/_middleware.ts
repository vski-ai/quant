import { Context } from "fresh";
import { State } from "@/root.ts";

export async function handler(
  ctx: Context<State>,
) {
  if (!ctx.state.user?.roles.includes("admin")) {
    return new Response("", {
      status: 307,
      headers: { Location: "/app" },
    });
  }
  return await ctx.next();
}
