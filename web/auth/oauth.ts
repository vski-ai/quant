import { createGitHubOAuthConfig, createHelpers } from "@deno/kv-oauth";

export const githubOAuth2Client = createHelpers(createGitHubOAuthConfig());
