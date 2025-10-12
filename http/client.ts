export * from "@/http/client/client.gen.ts";
export * from "@/http/client/index.ts";

import { createClient, createConfig } from "@/http/client/client/index.ts";
import * as methods from "@/http/client/index.ts";

export function client() {
  const keys = {
    masterKey: "",
    apiKey: "",
  };
  return {
    ...methods,
    setMasterKey(key: string | null) {
      keys.masterKey = key!;
    },
    setApiKey(key: string | null) {
      keys.apiKey = key!;
    },
    configure({
      baseUrl,
      apiKey,
      masterKey,
    }: {
      baseUrl: string;
      masterKey?: string;
      apiKey?: string;
    }) {
      const client = createClient(createConfig({
        baseUrl,
      }));
      for (const [key, value] of Object.entries(client)) {
        if (typeof value === "function") {
          // @ts-expect-error:
          const fn = client[key];
          // @ts-expect-error:
          client[key] = (opts: any) => {
            delete opts.client;
            return fn(opts);
          };
        }
      }
      keys.masterKey = masterKey!;
      keys.apiKey = apiKey!;
      client.interceptors.request.use((request, _options) => {
        if (keys.masterKey) {
          request.headers.set("X-Master-Key", keys.masterKey);
          return request;
        }
        if (keys.apiKey) {
          request.headers.set("X-Api-Key", keys.apiKey);
          return request;
        }
        return request;
      });

      for (const [key, value] of Object.entries(methods)) {
        if (typeof value === "function") {
          // @ts-ignore:
          this[key as string] = (options: any) =>
            // @ts-ignore:
            methods[key]({ ...options, client });
        }
      }
    },
  };
}
