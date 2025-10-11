import { Engine, IPlugin } from "@/core/mod.ts";
import { createAuthStorage } from "./db/storage.ts";

declare module "@/core/mod.ts" {
  interface Engine {
    auth: {
      validate(
        apiKey: string,
        context: { reportId: string },
      ): Promise<{ valid: boolean; reason?: string }>;
    };
  }
}

/**
 * Core plugin for authentication.
 * Its primary role is to expose the `engine.auth.validate` method for other
 * parts of the system (like the RealtimeManager) to use.
 */
export class CoreAuthPlugin implements IPlugin {
  name = "CoreAuthPlugin";
  version = "1.0.0";

  registerEngineMethods(engine: Engine) {
    // The storage instance is created here and used by the validation method.
    const storage = createAuthStorage(engine.connection, engine.redisClient);

    return {
      auth: {
        /**
         * Validates an API key and checks its permissions for a given context.
         * @param apiKey The API key to validate.
         * @param context The context for the authorization check (e.g., which report is being accessed).
         * @returns An object indicating if the key is valid and a reason for failure.
         */
        validate: async (apiKey: string, context: { reportId: string }) => {
          const apiKeyData = await storage.getApiKey(apiKey);

          if (!apiKeyData || !apiKeyData.enabled) {
            return { valid: false, reason: "API key not found or disabled." };
          }

          // Check if the API key's owner has access to the requested report.
          const hasAccess = await storage.isReportOwner(
            apiKeyData.owner,
            context.reportId,
          );

          if (!hasAccess) {
            return {
              valid: false,
              reason:
                `API key owner '${apiKeyData.owner}' does not have permission for report '${context.reportId}'.`,
            };
          }

          console.log(
            `Auth validation for report ${context.reportId} passed for key owner: ${apiKeyData.owner}`,
          );
          return { valid: true };
        },
      },
    };
  }
}
