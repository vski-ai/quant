# VSKI·QUANT Formula Plugin

![Status](https://img.shields.io/badge/Status-experimental-orange)

The Formula Plugin integrates a high-performance, Rust-based formula evaluation
engine (compiled to WebAssembly) into the core engine. It allows for the
creation of "Computed Metrics" by applying mathematical formulas to existing
data points.

This is particularly useful for calculating ratios, compound metrics, or any
value that is a function of other metrics (e.g., `revenue_per_user`,
`conversion_rate`, `average_order_value`).

## Core Features

- **High-Performance**: Built with Rust and compiled to WebAssembly for
  near-native performance, even on large datasets.
- **Rich Operator & Function Library**: Supports standard arithmetic operators
  and a wide range of mathematical functions.
- **Dynamic Context**: Evaluate formulas using variables passed in a dynamic
  context object.
- **Batch Computation**: Compute multiple derived metrics in a single, efficient
  call.

## Installation & Usage

The plugin is designed to be registered with the core `Engine` instance. It uses
the `registerEngineMethods` hook to add a new `compute` method to the engine,
and postprocessing hooks to handle queries with computed fields.

```typescript
import { Engine } from "@/core/mod.ts";
import { FormulaPlugin } from "@/formula/mod.ts";
 
// 1. Initialize the engine
const engine = new Engine({
  /* ... engine config ... */
});

// 2. Create and register the plugin instance
const formulaPlugin = new FormulaPlugin();
await engine.registerPlugin(formulaPlugin);

// 3. Computed fields are now available:
const result = await engine.getDataset({
    reportId: ....,
    timeRange: ....,
    compute: {
      // given that data points contain 'revenue_sum' and 'users_count':
      revenue_per_user: "revenue_sum / users_count",
    },  
  }
);

console.log(result);


// Expected output:
{
  revenue_sum: 1500,
  users_count: 75,
  revenue_per_user: 20
}
```

## API

### `engine.compute(context, computed)`

Evaluates one or more formulas against a given data context.

- **`context`**: `Record<string, number>` An object where keys are variable
  names (identifiers) and values are the numbers they represent. These variables
  can be used in the formulas.

- **`computed`**: `Record<string, string>` An object where keys are the names of
  the new metrics to calculate and values are the string formulas to evaluate.

- **Returns**: `Record<string, number>` Resolves to a new object containing all
  keys from the original `context` plus the newly `computed` keys and their
  calculated values.

## Formula Syntax Guide

### Variables

Any key from the `context` object can be used as a variable in a formula.
Variable names must start with a letter or underscore and can contain letters,
numbers, and underscores.

`total_revenue / user_count`

### Operators

| Operator | Description    |
| :------: | -------------- |
|   `+`    | Addition       |
|   `-`    | Subtraction    |
|   `*`    | Multiplication |
|   `/`    | Division       |

**Note on Division**: Division by zero is handled safely and will result in `0`.

### Functions

The formula engine supports a variety of built-in mathematical functions.

| Function           | Description                                   |
| ------------------ | --------------------------------------------- |
| `pow(base, exp)`   | Raises `base` to the power of `exp`.          |
| `sqrt(n)`          | Calculates the square root of `n`.            |
| `max(n1, n2, ...)` | Returns the largest of the given numbers.     |
| `min(n1, n2, ...)` | Returns the smallest of the given numbers.    |
| `abs(n)`           | Returns the absolute value of `n`.            |
| `round(n)`         | Rounds `n` to the nearest integer.            |
| `ceil(n)`          | Rounds `n` up to the next largest integer.    |
| `floor(n)`         | Rounds `n` down to the next smallest integer. |
| `sin(n)`           | Computes the sine of `n` (in radians).        |
| `cos(n)`           | Computes the cosine of `n` (in radians).      |
| `tan(n)`           | Computes the tangent of `n` (in radians).     |
| `log(n)`           | Computes the natural logarithm of `n`.        |
| `log10(n)`         | Computes the base-10 logarithm of `n`.        |
| `exp(n)`           | Returns e raised to the power of `n`.         |
