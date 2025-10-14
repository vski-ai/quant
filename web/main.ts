import { App, staticFiles } from "fresh";
import { define, type State } from "./root.ts";
import { seedDatabase } from "@/db/seed.ts";

await seedDatabase();

export const app = new App<State>();

app.use(staticFiles());

// Pass a shared value from a middleware
app.use(async (ctx) => {
  ctx.req.headers.get("cookie")?.split(";").forEach((cookie) => {
    console.log("Cookie: " + cookie);
    const [name, value] = cookie.split("=").map((v) => v.trim());
    switch (name) {
      case "ui-theme":
        ctx.state.uiTheme = value;
        break;
      case "ui-dense":
        ctx.state.uiDense = value;
        break;
      case "ui-aside":
        ctx.state.uiAside = value;
        break;
      default:
        break;
    }
  });
  return await ctx.next();
});

// this can also be defined via a file. feel free to delete this!
const exampleLoggerMiddleware = define.middleware((ctx) => {
  console.log(`${ctx.req.method} ${ctx.req.url}`);
  return ctx.next();
});
app.use(exampleLoggerMiddleware);

// Include file-system based routes here
app.fsRoutes();
