import { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { HonoEnv } from "../types.ts";

export const httpErrorHandler: ErrorHandler<HonoEnv> = (err, c) => {
  if (err instanceof HTTPException) {
    // Use the HTTPException's response if it's a known HTTP error
    console.log(123123, err)
    return err.getResponse();
  }

  // Log the full error for debugging purposes
  console.error("[HTTP Error]", err);

  // Return a generic 500 Internal Server Error response
  return c.json(
    {
      error: "Internal Server Error",
      message: "An unexpected error occurred.",
    },
    500,
  );
};
