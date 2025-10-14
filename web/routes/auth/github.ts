import { githubOAuth2Client } from "@/auth/oauth.ts";
import { define } from "@/root.ts";

export const handler = define.handlers({
  async GET(ctx) {
    return await githubOAuth2Client.signIn(ctx.req);
  },
});
