import { assertEquals, assertRejects } from "@std/assert";
import { WasmFormulaExecutor } from "../mod.ts";

const executor = new WasmFormulaExecutor();

// Mock data context similar to aggregated results
const mockContext = {
  deal_value_sum: 150000,
  deal_value_count: 10,
  cost_sum: 60000,
  nested_value: 5,
};

Deno.test("Formula Executor - Simple Arithmetic", async () => {
  const formula = "deal_value_sum - cost_sum";
  const compiled = executor.compile(formula);
  const result = executor.execute(compiled, mockContext);
  assertEquals(result, 90000);
});

Deno.test("Formula Executor - Operator Precedence", async () => {
  const formula = "10 + deal_value_count * 5"; // Should be 10 + (10 * 5) = 60
  const compiled = executor.compile(formula);
  const result = executor.execute(compiled, mockContext);
  assertEquals(result, 60);
});

Deno.test("Formula Executor - Parentheses", async () => {
  const formula =
    "(deal_value_sum / deal_value_count) - (cost_sum / deal_value_count)";
  const compiled = executor.compile(formula);
  const result = executor.execute(compiled, mockContext);
  assertEquals(result, 9000); // (15000) - (6000)
});

Deno.test("Formula Executor - Function Call (pow)", async () => {
  const formula = "pow(deal_value_count, 2)";
  const compiled = executor.compile(formula);
  const result = executor.execute(compiled, mockContext);
  assertEquals(result, 100);
});

Deno.test("Formula Executor - Division by Zero", async () => {
  const formula = "deal_value_sum / 0";
  const compiled = executor.compile(formula);
  const result = executor.execute(compiled, mockContext);
  assertEquals(result, 0, "Should return a safe default for division by zero");
});

Deno.test("Formula Executor - Missing Identifier", async () => {
  const formula = "revenue - cost"; // These don't exist in mockContext
  const compiled = executor.compile(formula);
  // We expect an error to be thrown, but the executor should catch it and return 0.
  const result = executor.execute(compiled, mockContext);
  assertEquals(
    result,
    0,
    "Should return a safe default for missing identifiers",
  );
});

Deno.test("Formula Executor - Invalid Formula Syntax", async () => {
  const formula = "deal_value_sum -+ cost_sum";
  assertRejects(
    async () => executor.compile(formula),
    Error,
    "Formula compilation failed",
  );
});

Deno.test("Formula Executor - New Functions", async (t) => {
  const formulas = {
    round: { formula: "round(9.5)", expected: 10 },
    ceil: { formula: "ceil(9.1)", expected: 10 },
    floor: { formula: "floor(9.9)", expected: 9 },
    abs: { formula: "abs(-10)", expected: 10 },
    sqrt: { formula: "sqrt(16)", expected: 4 },
    log: { formula: "log(nested_value)", expected: Math.log(5) }, // Natural log
    log10: { formula: "log10(100)", expected: 2 },
    exp: { formula: "exp(nested_value)", expected: Math.exp(5) },
    sin: { formula: "sin(0)", expected: 0 },
    cos: { formula: "cos(0)", expected: 1 },
    tan: { formula: "tan(0)", expected: 0 },
  };

  for (const [name, { formula, expected }] of Object.entries(formulas)) {
    await t.step(`Test function: ${name}`, async () => {
      const compiled = executor.compile(formula);
      const result = executor.execute(compiled, mockContext);
      assertEquals(result, expected);
    });
  }
});

Deno.test("Formula Executor - Identifier with Underscore and Numbers", async () => {
  const formula = "deal_value_sum * my_var_1";
  const context = { ...mockContext, my_var_1: 2 };
  const compiled = executor.compile(formula);
  const result = executor.execute(compiled, context);
  assertEquals(result, 300000);
});

Deno.test("Formula Executor - Compute New Fields", async () => {
  const context = { a: 50, b: 0.5 };
  const computedFields = {
    ab_sum: "a + b",
    ab_prod: "a * b",
    my_ab_metric: "a * b + a",
  };
  const result = executor.compute(context, computedFields);
  console.log(result);
  assertEquals(result, {
    a: 50,
    b: 0.5,
    ab_sum: 50.5,
    ab_prod: 25.0,
    my_ab_metric: 75.0,
  });
});
