import type { Context } from "fresh";
import type { State } from "@/root.ts";
import { Roles } from "@/db/models.ts";

export const isAdmin = ({ state }: Context<State>) => {
  return state.user?.roles.includes(Roles.admin);
};

export const isAdminOn = (ctx: Context<State>) => {
  const adminOn = ctx.url.searchParams.get("admin") == "1";
  return isAdmin(ctx) && adminOn;
};
