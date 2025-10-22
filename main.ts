import { Engine } from "@/core/mod.ts";
import { createHttp } from "./http/create_http.ts";
import { createHttpAuthPlugin } from "./http/auth/mod.ts";
import { CoreRealtimePlugin } from "./realtime/core.plugin.ts";
import { HttpRealtimePlugin } from "./realtime/http.plugin.ts";
import { AccountRealtimePlugin } from "./realtime/account.plugin.ts";
import { HTTPFormulaPlugin } from "@/formula/http.plugin.ts";
import { HTTPFilterPlugin } from "@/filters/http.plugin.ts";
import { FilterPlugin } from "./filters/mod.ts";
import { FormulaPlugin } from "./formula/mod.ts";

const engine = new Engine({
  mongoUri: Deno.env.get("MONGODB_URI")!,
  bufferAgeMs: 1000 * 60 * 60 * 2, // 2h
});

const masterKey = Deno.env.get("AUTH_MASTER_KEY");

await engine.registerPlugin(
  new CoreRealtimePlugin(masterKey!),
);
await engine.registerPlugin(
  new FilterPlugin(),
);
await engine.registerPlugin(
  new FormulaPlugin(),
);

const authPlugin = createHttpAuthPlugin({
  masterKey: masterKey,
});

export default await createHttp(engine, [
  authPlugin,
  new HttpRealtimePlugin(),
  new AccountRealtimePlugin(masterKey!),
  new HTTPFilterPlugin(),
  new HTTPFormulaPlugin(),
]);
