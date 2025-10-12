import { client } from "@/quant/http/client.ts";

const api = client();

api.configure({
  baseUrl: Deno.env.get("QUANT_API_BASE_URL")!,
  masterKey: Deno.env.get("QUANT_API_MASTER_KEY")!,
});

export default api;
