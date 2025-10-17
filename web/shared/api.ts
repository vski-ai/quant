import { IS_BROWSER } from "fresh/runtime";
import { client } from "@/quant/http/client.ts";


const pathName = '/api/quant'
const origin = IS_BROWSER ? globalThis.location.origin : `http://localhost:${Deno.env.get('PORT')}`

// Session may be empty on client
export default (session?: string) => {
  const api = client();

  api.configure({
    baseUrl: origin + pathName
  });

  if (session) api.client?.setConfig({
    headers: {
      "Cookie": `e=${session};`
    }
  })
  return api
};