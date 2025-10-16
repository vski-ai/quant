import { App, staticFiles } from "fresh";
import { define, type State } from "./root.ts";
import { seedDatabase } from "@/db/seed.ts";

await seedDatabase();

export const app = new App<State>();

app.use(staticFiles());

// this can also be defined via a file. feel free to delete this!
const exampleLoggerMiddleware = define.middleware((ctx) => {
  console.log(`${ctx.req.method} ${ctx.req.url}`);
  return ctx.next();
});
app.use(exampleLoggerMiddleware);

// Include file-system based routes here
app.fsRoutes();
