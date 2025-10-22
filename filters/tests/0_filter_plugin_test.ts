import { assertEquals } from "@std/assert";
import { FilterPlugin } from "../mod.ts";

// Mock data for testing
const mockData: any[] = [
  { id: 1, category: "A", value: 10, enabled: true, name: "Apple" },
  { id: 2, category: "B", value: 25, enabled: false, name: "Banana" },
  { id: 3, category: "A", value: 15, enabled: true, name: "Avocado" },
  { id: 4, category: "C", value: 30, enabled: true, name: "Cherry" },
  { id: 5, category: "B", value: 20, enabled: true, name: "Blueberry" },
];

Deno.test("FilterPlugin - Simple EQ filter", async () => {
  const plugin = new FilterPlugin();
  const context = {
    data: [...mockData],
    query: {
      filter: {
        category: [{ field: "category", operator: "EQ", value: "A" }],
      },
    } as any,
  };

  await plugin.afterAggregateGenerated(context);

  assertEquals(context.data.length, 2);
  assertEquals(context.data.map((d) => d.id), [1, 3]);
});

Deno.test("FilterPlugin - Numeric GT and LTE filter (AND)", async () => {
  const plugin = new FilterPlugin();
  const context = {
    data: [...mockData],
    query: {
      filter: {
        value: [
          { field: "value", operator: "GT", value: 10 },
          { field: "value", operator: "LTE", value: 25 },
        ],
      },
    } as any,
  };

  await plugin.afterAggregateGenerated(context);

  assertEquals(context.data.length, 3);
  assertEquals(context.data.map((d) => d.id), [2, 3, 5]);
});

Deno.test("FilterPlugin - Compound filter (different fields, implicit AND)", async () => {
  const plugin = new FilterPlugin();
  const context = {
    data: [...mockData],
    query: {
      filter: {
        category: [{ operator: "EQ", value: "B" }],
        enabled: [{ operator: "EQ", value: true }],
      },
    } as any,
  };

  await plugin.afterAggregateGenerated(context);

  assertEquals(context.data.length, 1);
  assertEquals(context.data[0].id, 5);
});

Deno.test("FilterPlugin - OR filter", async () => {
  const plugin = new FilterPlugin();
  const context = {
    data: [...mockData],
    query: {
      filter: {
        id: [
          {
            OR: [
              { operator: "EQ", value: 2 },
              { operator: "EQ", value: 4 },
            ],
          },
        ],
      },
    } as any,
  };

  await plugin.afterAggregateGenerated(context);

  assertEquals(context.data.length, 2);
  assertEquals(context.data.map((d) => d.id), [2, 4]);
});

Deno.test("FilterPlugin - CONTAINS filter", async () => {
  const plugin = new FilterPlugin();
  const context = {
    data: [...mockData],
    query: {
      filter: {
        name: [{ operator: "CONTAINS", value: "berry" }],
      },
    } as any,
  };

  await plugin.afterAggregateGenerated(context);

  assertEquals(context.data.length, 1);
  assertEquals(context.data[0].id, 5);
});

Deno.test("FilterPlugin - Filter with limit and offset", async () => {
  const plugin = new FilterPlugin();
  const context = {
    data: [...mockData],
    query: {
      filter: {
        value: [{ operator: "GT", value: 10 }], // Matches 25, 15, 30, 20 (ids 2,3,4,5)
      },
      offset: 1,
      limit: 2,
    } as any,
  };

  await plugin.afterAggregateGenerated(context);

  assertEquals(context.data.length, 2);
  // Original matches: [2, 3, 4, 5]. After offset(1): [3, 4, 5]. After limit(2): [3, 4]
  assertEquals(context.data.map((d) => d.id), [3, 4]);
});

Deno.test("FilterPlugin - No filter", async () => {
  const plugin = new FilterPlugin();
  const context = {
    data: [...mockData],
    query: {} as any,
  };

  await plugin.afterAggregateGenerated(context);

  assertEquals(context.data.length, 5);
});

Deno.test("FilterPlugin - Empty data", async () => {
  const plugin = new FilterPlugin();
  const context = {
    data: [],
    query: {
      filter: {
        category: [{ operator: "EQ", value: "A" }],
      },
    } as any,
  };

  await plugin.afterAggregateGenerated(context);

  assertEquals(context.data.length, 0);
});
