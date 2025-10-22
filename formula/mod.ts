import init, {
  compute,
  evaluate,
  parse_formula,
} from "./pkg/formula_engine.js";

// Initialize the Wasm module
await init();

// Represents the parsed, serializable AST (as a JSON string)
type CompiledFormula = string;

export class WasmFormulaExecutor {
  private formulaCache = new Map<string, CompiledFormula>();

  constructor() {}

  /**
   * @param context - an object containing values
   * @param spec - an object containing pairs computed_filed: formula
   * @returns A promise that resolves to the compiled formula (AST JSON string).
   */
  compute(
    ctx: Record<string, number>,
    spec: Record<string, string>,
  ): Record<string, number> {
    return compute(
      Object.keys(ctx),
      Float64Array.from(Object.values(ctx)),
      Object.keys(spec),
      Object.values(spec),
    );
  }
  /**
   * Parses a formula string into a compiled, serializable AST.
   * Results are cached in memory.
   * @param formula The user-defined formula string.
   * @returns A promise that resolves to the compiled formula (AST JSON string).
   */
  public compile(formula: string): CompiledFormula {
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
  public execute(
    compiledFormula: CompiledFormula,
    context: Record<string, number>,
  ): number {
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
