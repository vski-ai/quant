export * from "@/http/client/client.gen.ts";
export * from "@/http/client/index.ts";

import { client } from "@/http/client/client.gen.ts";
import * as methods from "@/http/client/index.ts";

export function configure({
  baseUrl,
  apiKey,
  masterKey,
}: {
  baseUrl: string;
  masterKey?: string;
  apiKey?: string;
}) {
  client.setConfig({
    baseUrl,
  });

  client.interceptors.request.use((request, _options) => {
    if (masterKey) {
      request.headers.set("X-Master-Key", masterKey);
      return request;
    }
    if (apiKey) {
      request.headers.set("X-Api-Key", apiKey);
      return request;
    }
    return request;
  });
}
export function configureFromEnv() {
  const baseUrl = Deno.env.get("ENGINE_HTTP_BASE_URL");
  if (!baseUrl) {
    throw "ENGINE_HTTP_BASE_URL is required";
  }
  configure({
    baseUrl,
    masterKey: Deno.env.get("ENGINE_MASTER_KEY"),
    apiKey: Deno.env.get("ENGINE_API_KEY"),
  });
}

export function api() {
  return methods;
}
