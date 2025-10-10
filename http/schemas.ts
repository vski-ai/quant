import * as v from "valibot";
import { resolver } from "hono-openapi";

export const ErrorSchema = v.object({
  error: v.string(),
});

export const ErrorResponse = {
  description: "Error response",
  content: {
    "application/json": {
      schema: resolver(ErrorSchema),
    },
  },
};

export const SuccessSchema = v.object({
  success: v.boolean(),
});

export const SuccessResponse = {
  description: "Successful operation",
  content: {
    "application/json": {
      schema: resolver(SuccessSchema),
    },
  },
};
