import init, { evaluate, parse_formula } from "./pkg/formula_engine.js";

// Initialize the Wasm module
await init();

// Represents the parsed, serializable AST (as a JSON string)
type CompiledFormula = string;

export class WasmFormulaExecutor {
  private formulaCache = new Map<string, CompiledFormula>();

  constructor() {}

  /**
   * Parses a formula string into a compiled, serializable AST.
   * Results are cached in memory.
   * @param formula The user-defined formula string.
   * @returns A promise that resolves to the compiled formula (AST JSON string).
   */
  public async compile(formula: string): Promise<CompiledFormula> {
    if (this.formulaCache.has(formula)) {
      return this.formulaCache.get(formula)!;
    }

    try {
      const compiled = parse_formula(formula);
      this.formulaCache.set(formula, compiled);
      return compiled;
    } catch (e) {
      throw new Error(`Formula compilation failed: ${e}`);
    }
  }

  /**
   * Executes a pre-compiled formula against a data context.
   * @param compiledFormula The AST string from the compile() method.
   * @param context A data row object, e.g., { revenue: 100, cost: 60 }.
   * @returns The numerical result of the formula.
   */
  public async execute(
    compiledFormula: CompiledFormula,
    context: Record<string, number>,
  ): Promise<number> {
    const keys = Object.keys(context);
    const values = Object.values(context);

    try {
      const result = evaluate(
        compiledFormula,
        keys,
        values as unknown as Float64Array,
      );
      // Handle potential NaN or Infinity from Rust if needed
      return isFinite(result) ? result : 0;
    } catch (e) {
      console.warn(
        `Formula execution failed for context ${JSON.stringify(context)}: ${e}`,
      );
      return 0; // Return a safe default
    }
  }
}
