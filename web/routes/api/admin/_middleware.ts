import { Context } from "fresh";
import { State } from "@/root.ts";

export async function handler(
  ctx: Context<State>,
) {
  // The app/_middleware already populates the user state, so we can check it here.
  if (!ctx.state.user?.roles.includes("admin")) {
    return new Response("Unauthorized", { status: 401 });
  }
  return await ctx.next();
}
