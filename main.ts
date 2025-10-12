import { Engine } from "@/core/mod.ts";
import { createHttp } from "./http/create_http.ts";
import { createHttpAuthPlugin } from "./http/auth/mod.ts";
import { CoreRealtimePlugin } from "./realtime/core.plugin.ts";
import { HttpRealtimePlugin } from "./realtime/http.plugin.ts";

const engine = new Engine({
  mongoUri: Deno.env.get("MONGODB_URI")!,
  bufferAgeMs: 1000 * 60 * 60 * 2, // 2h
});

await engine.registerPlugin(new CoreRealtimePlugin());

const authPlugin = createHttpAuthPlugin({
  masterKey: Deno.env.get("AUTH_MASTER_KEY"),
});

export default await createHttp(engine, [
  authPlugin,
  new HttpRealtimePlugin(),
]);
