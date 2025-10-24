import { Context } from "fresh";
import { State } from "@/root.ts";
import quant from "@/db/quant.ts";
import { GetApiReportsIdResponse } from "@/root/http/client.ts";

declare module "@/root.ts" {
  interface State {
    report: GetApiReportsIdResponse;
  }
}

export async function handler(
  ctx: Context<State>,
) {
  const { data: report } = await quant.getApiReportsId({
    path: { id: ctx.params.id },
  });
  if (!report) {
    return Response.json({ error: "API Server Error" }, { status: 400 });
  }
  ctx.state.report = report;
  return await ctx.next();
}
