import { IDatasetDataPoint, IDatasetQuery, IPlugin } from "@/core/types.ts";
import { WasmFormulaExecutor } from "./mod.ts";

export class FormulaPlugin implements IPlugin {
  constructor(
    public name: string = "Formula Plugin",
    public version: string = "0.0.1",
    private executor = new WasmFormulaExecutor(),
  ) {}

  async afterAggregateGenerated(
    context: { data: IDatasetDataPoint[]; query: IDatasetQuery },
  ) {
    if (context.query.compute) {
      context.data?.forEach((dataPoint) => {
        const ctx = Object.fromEntries(
          Object.entries(dataPoint)
            .filter(([_, v]) => typeof v === "number"),
        ) as Record<string, number>;
        const result = this.executor.compute(ctx, context.query.compute!);
        Object.assign(dataPoint, result);
      });
    }
  }
}
