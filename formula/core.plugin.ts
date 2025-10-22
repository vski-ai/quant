import { WasmFormulaExecutor } from "./mod.ts";
import type {
  IDatasetDataPoint,
  IDatasetQuery,
  IPlugin,
} from "@/core/types.ts";
import type { compute } from "./pkg/formula_engine.js";

type ComputeType = typeof compute;
declare module "@/core/mod.ts" {
  interface IQuery {
    compute?: Record<string, string>;
  }
  interface IDatasetQuery {
    compute?: Record<string, string>;
  }

  interface Engine {
    compute: ComputeType;
  }
}

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
  registerEngineMethods() {
    return {
      compute: this.executor.compute,
    };
  }
}
