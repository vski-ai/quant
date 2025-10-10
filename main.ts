import { Engine } from "@/core/mod.ts";
import { createHttp } from "./http/create_http.ts";
import { createAuthPlugin } from "./http/auth/mod.ts";
import { CoreSubscriptionPlugin } from "./subscription/core.plugin.ts";
import { HttpSubscriptionPlugin } from "./subscription/http.plugin.ts";

const engine = new Engine({
  mongoUri: Deno.env.get("MONGODB_URI")!,
  bufferAgeMs: 1000 * 60 * 60 * 2, // 2h
});

await engine.registerPlugin(new CoreSubscriptionPlugin());

const authPlugin = createAuthPlugin({
  masterKey: Deno.env.get("AUTH_MASTER_KEY"),
});

export default await createHttp(engine, [
  authPlugin,
  new HttpSubscriptionPlugin(),
]);
