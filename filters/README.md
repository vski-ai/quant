# VSKI·QUANT Filter Plugin

![Status](https://img.shields.io/badge/Status-experimental-orange)

The Filter Plugin provides data filtering capabilities to the VSKI·QUANT core
engine. It uses a Rust-based filtering engine, compiled to WebAssembly, to
efficiently evaluate complex filter conditions on large datasets.

## Installation & Usage

The plugin is designed to be registered with the core `Engine` instance. It
hooks into the post-processing stage of data retrieval to apply the specified
filters.

```typescript
import { Engine } from "@/core/mod.ts";
import { FilterPlugin } from "@/filters/mod.ts";

// 1. Initialize the engine
const engine = new Engine({
  /* ... engine config ... */
});

// 2. Create and register the plugin instance
const filterPlugin = new FilterPlugin();
await engine.registerPlugin(filterPlugin);

// 3. Use the `filter` parameter in your queries:
const result = await engine.getDataset({
  reportId: "my_report",
  timeRange: { from: "2023-01-01", to: "2023-01-31" },
  filter: {
    value_sum: [{ operator: "GT", value: 1000 }],
    user_count: [{ operator: "GTE", value: 10 }],
  },
  limit: 50,
  offset: 0,
});

console.log(result);
```

## Filter Syntax

Filters are defined in an object where keys correspond to fields in the dataset.

### Operators

| Operator   | Description               | Value Type(s)      |
| :--------- | :------------------------ | :----------------- |
| `EQ`       | Equal to                  | `string`, `number` |
| `NEQ`      | Not equal to              | `string`, `number` |
| `GT`       | Greater than              | `number`           |
| `GTE`      | Greater than or equal to  | `number`           |
| `LT`       | Less than                 | `number`           |
| `LTE`      | Less than or equal to     | `number`           |
| `CONTAINS` | String contains substring | `string`           |

### Combining Filters

#### AND (Implicit)

By default, conditions on different fields are combined with a logical `AND`.

```json
{
  "field_a": [{ "operator": "GT", "value": 10 }],
  "field_b": [{ "operator": "EQ", "value": "example" }]
}
```

This filter will match data points where `field_a` is greater than 10 **AND**
`field_b` is equal to "example".

#### OR (Explicit)

To combine conditions with a logical `OR`:

```json
{
  "field_a": [{
    "OR": [
      { "field": "field_a", "operator": "GT", "value": 15 },
      { "field": "field_a", "operator": "EQ", "value": 10 }
    ]
  }]
}
```

This filter will match data points where `field_a` is equal to 10 **OR** greater
than 15.

### Pagination

- `limit`: The maximum number of data points to return.
- `offset`: The number of data points to skip from the beginning of the result
  set.
