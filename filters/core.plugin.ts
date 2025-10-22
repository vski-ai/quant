import { IDatasetDataPoint, IDatasetQuery, IPlugin } from "@/core/mod.ts";
import { WasmFilterExecutor } from "./mod.ts";

/**
 * Represents the compiled, serializable format for filter conditions
 * that can be efficiently processed by the WASM module.
 * [field, operator_enum_value, value]
 */
export type CompiledFilter =
  | { AND: CompiledFilter[] }
  | { OR: CompiledFilter[] }
  | [string, number, any]; // [field, operator, value]

const operatorMap: Record<string, number> = {
  "EQ": 0,
  "NEQ": 1,
  "GT": 2,
  "GTE": 3,
  "LT": 4,
  "LTE": 5,
  "CONTAINS": 6,
  "NOT_CONTAINS": 7,
};

/**
 * Defines the operators for the in-memory filter plugin.
 */
export type FilterOperator = keyof typeof operatorMap;

/**
 * Represents a single filter condition.
 */
export interface IFilterCondition {
  field?: string;
  operator: FilterOperator;
  value: string | number | boolean;
}

/**
 * Represents a filter structure, allowing for AND/OR combinations.
 */
export type IFilter =
  | { AND: IFilter[] }
  | { OR: IFilter[] }
  | IFilterCondition;

export type IFieldBasedFilter = {
  [fieldName: string]: IFilter[];
};

declare module "@/core/mod.ts" {
  interface IQuery {
    filter?: IFieldBasedFilter;
    limit?: number;
    offset?: number;
  }
  interface IDatasetQuery {
    filter?: IFieldBasedFilter;
    limit?: number;
    offset?: number;
  }
  interface IFlatGroupsAggregationQuery {
    filter?: IFieldBasedFilter;
    limit?: number;
    offset?: number;
  }
}

/**
 * A high-performance, Rust-based filtering plugin.
 */
export class FilterPlugin implements IPlugin {
  public name = "Filters Plugin";
  public version = "1.0.0";

  private executor: WasmFilterExecutor;
  private filterCache = new Map<string, CompiledFilter | null>();

  constructor() {
    this.executor = new WasmFilterExecutor();
  }

  /**
   * Hook into the query lifecycle to apply in-memory filtering.
   */
  public async afterAggregateGenerated(
    context: {
      data: IDatasetDataPoint[];
      query: IDatasetQuery;
    },
  ): Promise<void> {
    const filter = context.query.filter;

    if (!filter || context.data.length === 0) {
      return;
    }

    const cacheKey = JSON.stringify(filter);
    let compiledFilter = this.filterCache.get(cacheKey);

    if (compiledFilter === undefined) {
      compiledFilter = this.compileFilter(filter);
      this.filterCache.set(cacheKey, compiledFilter);
    }

    if (!compiledFilter) {
      return; // No valid filters to apply
    }

    const matchingIndices = this.executor.filter(
      context.data,
      compiledFilter,
    );

    const offset = context.query.offset ?? 0;
    const limit = context.query.limit ?? Infinity;
    let zbi = 0;
    for (
      let i = offset;
      i < matchingIndices.length;
      i++
    ) {
      if (i > limit) break;
      const dataIndex = matchingIndices[i];
      context.data[zbi++] = context.data[dataIndex];
    }
    context.data.length = zbi;
  }

  /**
   * Compiles the declarative filter object into a more compact,
   * serializable array format for the WASM function.
   */
  private compileFilter(
    fieldBasedFilter: IFieldBasedFilter,
  ): CompiledFilter | null {
    const compiledFieldFilters: CompiledFilter[] = [];

    for (const fieldName in fieldBasedFilter) {
      const filtersForField = fieldBasedFilter[fieldName];
      if (!filtersForField || filtersForField.length === 0) {
        continue; // Skip empty filter arrays for a field
      }

      const compiledConditionsForField: CompiledFilter[] = filtersForField.map((
        f,
      ) => this.compileNestedFilter(f, fieldName)); // Pass fieldName for validation

      if (compiledConditionsForField.length === 1) {
        compiledFieldFilters.push(compiledConditionsForField[0]);
      } else if (compiledConditionsForField.length > 1) {
        // Implicit AND for multiple conditions on the same field
        compiledFieldFilters.push({ AND: compiledConditionsForField });
      }
    }

    if (compiledFieldFilters.length === 0) {
      return null; // Represents no filter, effectively true
    } else if (compiledFieldFilters.length === 1) {
      return compiledFieldFilters[0];
    } else {
      // Implicit AND for conditions across different fields
      return { AND: compiledFieldFilters };
    }
  }

  // Helper to compile a single IFilter (which could be IFilterCondition, AND, or OR)
  // `expectedField` is used for validation to ensure conditions match the top-level field key.
  private compileNestedFilter(
    filter: IFilter,
    expectedField: string,
  ): CompiledFilter {
    if ("AND" in filter) {
      // Recursively compile sub-filters, passing the same expectedField
      return {
        AND: filter.AND.map((f) => this.compileNestedFilter(f, expectedField)),
      };
    }
    if ("OR" in filter) {
      // Recursively compile sub-filters, passing the same expectedField
      return {
        OR: filter.OR.map((f) => this.compileNestedFilter(f, expectedField)),
      };
    }
    if ("operator" in filter) {
      const op = operatorMap[filter.operator];
      if (op === undefined) {
        throw new Error(
          `Unsupported filter operator: ${filter.operator} for field ${expectedField}`,
        );
      }
      return [expectedField, op, filter.value];
    }
    throw new Error(
      "Invalid filter structure encountered during nested filter compilation.",
    );
  }
}
