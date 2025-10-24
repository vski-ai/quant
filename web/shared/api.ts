import { IS_BROWSER } from "fresh/runtime";
import { client } from "@/root/http/client.ts";

const pathName = "/api/quant"; // this is internal proxy base url
const origin = IS_BROWSER
  ? globalThis.location.origin
  : `http://localhost:${Deno.env.get("PORT")}`;

// Session may be empty on front - the cookie should be sent automatically
// On server available thru `state.client` within authenticated areas
export default (session?: string) => {
  const api = client();
  api.configure({
    baseUrl: origin + pathName,
  });

  if (session) {
    api.client?.setConfig({
      headers: {
        "Cookie": `e=${session};`,
      },
    });
  }
  return api;
};
