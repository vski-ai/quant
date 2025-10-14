# Development Notes

This document provides notes on how to use the Fresh framework and `valibot` in
the context of this project.

## Fresh Framework

We use a custom `define` object from `@/root.ts` to define our Fresh components.
This helps to ensure consistency and type safety.

### Define A Page

```typescript
// web/routes/some-page.tsx
import { define } from "@/root.ts";

export default define.page((props) => {
  return <div>Some Page</div>;
});
```

### Page Data

Data can be pre-fetched on backend with handlers and accesed through
`props.data` within a page component:

```typescript
// web/routes/some-page.tsx
import { define } from "@/root.ts";

export const handler = define.handlers({
  async GET(ctx) {
    return { data: { test: ["Hello", "World"] } };
  },
});

export default define.page((props) => {
  const { test } = props.data as any;

  return <div>{test.join(" ")}!</div>;
});
```

### Layouts

Layouts are defined using `define.layout`. This is a wrapper around the default
Fresh layout export.

```typescript
// web/routes/_layout.tsx
import { define } from "@/root.ts";

export default define.layout(function App({ Component, state }) {
  return (
    <html>
      <body>
        <Component />
      </body>
    </html>
  );
});
```

To skip inherited layouts, you can export a `config` object with
`skipInheritedLayouts: true`.

```typescript
// web/routes/app/_layout.tsx
export const config: RouteConfig = {
  skipInheritedLayouts: true,
};
```

### Handlers

API route handlers are defined using `define.handlers`. This is a wrapper around
the default Fresh handlers export.

```typescript
// web/routes/api/some-route.ts
import { define } from "@/root.ts";

export const handler = define.handlers({
  async GET(ctx) {
    return new Response("Hello");
  },
  async POST(ctx) {
    const body = await ctx.req.json();
    return Response.json({ received: body });
  },
});
```

### Middleware

Middleware is defined as a regular Fresh middleware handler. The `ctx.state`
object is used to pass data between middleware and handlers.

```typescript
// web/routes/app/_middleware.ts
import { Context } from "fresh";
import { State } from "@/root.ts";

export async function handler(ctx: Context<State>) {
  // ... some logic
  ctx.state.user = await getUserBySession(sessionToken);
  return await ctx.next();
}
```

## Valibot

We use `valibot` for data validation.

### Schemas

Schemas are defined using the `object` function from `valibot`.

```typescript
import { number, object, string } from "valibot";

export const MySchema = object({
  name: string(),
  age: number(),
});
```

### Pipes

You can use `pipe` to add custom validation rules.

```typescript
import { email, minLength, pipe, string } from "valibot";

const EmailSchema = pipe(string(), email("Invalid email address"));
const NameSchema = pipe(string(), minLength(1, "Name is required"));
```

### Parsing

To validate data, use the `parse` function.

```typescript
import { parse } from "valibot";

const data = { name: "John", age: 30 };

try {
  const validatedData = parse(MySchema, data);
  // data is valid
} catch (error) {
  // data is invalid
}
```
