import { Engine } from "@/core/mod.ts";
import { createHttp } from "./http/create_http.ts";
import { createAuthPlugin } from "./http/auth/mod.ts";

const engine = new Engine({
  mongoUri: Deno.env.get("MONGODB_URI")!,
  bufferAgeMs: 1000 * 60 * 60 * 2, // 2h
});

const authPlugin = createAuthPlugin({
  masterKey: Deno.env.get("AUTH_MASTER_KEY"),
});

export default await createHttp(engine, [
  authPlugin,
]);
