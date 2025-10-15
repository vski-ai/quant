import { Context } from "fresh";
import { State } from "@/root.ts";
import quant from "@/db/quant.ts";

declare module "@/root.ts" {
  interface State {
    report: any;
  }
}

export async function handler(
  ctx: Context<State>,
) {
  console.log(0, ctx.params);
  const { data: report, error } = await quant.getApiReportsId({
    path: { id: ctx.params.id },
  });
  ctx.state.report = report;
  return await ctx.next();
}
