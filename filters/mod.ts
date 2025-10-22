import type { IDatasetDataPoint } from "@/core/mod.ts";
import init, { filter_dataset } from "./pkg/filter_engine.js";

export * from "./core.plugin.ts";

await init();

/**
 * A class that encapsulates the logic for executing filters using the Rust-based WASM module.
 */
export class WasmFilterExecutor {
  /**
   * Filters a dataset using the high-performance WASM function.
   *
   * @param data The dataset to filter.
   * @param compiledFilter The pre-compiled filter rules.
   * @returns An array of indices of matching rows.
   */
  public filter(
    data: IDatasetDataPoint[],
    compiledFilter: any,
  ): Uint32Array {
    try {
      // The `as unknown as DataRowArray` cast is necessary to bridge the gap
      // between the TypeScript type and the opaque type expected by the WASM binding.
      const matchingIndices = filter_dataset(
        data,
        compiledFilter,
      );
      return matchingIndices;
    } catch (e) {
      console.error(
        "FilterWasmExecutor: Error executing WASM filter function:",
        e,
      );
      // Return an empty array in case of an error to prevent crashes.
      return new Uint32Array(0);
    }
  }
}
