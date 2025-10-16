import { define } from "@/root.ts";
import { connectMongo } from "@/db/mongo.ts";
import { Session, User } from "@/db/models.ts";
import { setCookie } from "@std/http";
import { minLength, object, parse, pipe, string } from "valibot";
import { verifyPassword } from "@/auth/password.ts";
import { APP_SESSION_COOKIE } from "@/routes/constants.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const email = form.get("email")?.toString();
    const password = form.get("password")?.toString();

    try {
      const InputSchema = object({
        email: pipe(string(), minLength(1, "Email is required")),
        password: pipe(string(), minLength(1, "Password is required")),
      });
      parse(InputSchema, { email, password });
    } catch (error) {
      return new Response((error as Error).message, { status: 400 });
    }

    try {
      const db = await connectMongo();
      const Users = db.collection<User>("users");
      const Sessions = db.collection<Session>("sessions");

      const user = await Users.findOne({ email });
      if (!user) {
        return new Response("Invalid email or password", { status: 401 });
      }

      const isMatch = await verifyPassword(password!, user.password);
      if (!isMatch) {
        return new Response("Invalid email or password", { status: 401 });
      }

      // Create session
      const sessionToken = crypto.randomUUID();
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week

      await Sessions.insertOne({
        sessionToken,
        userId: user._id,
        expires,
      });

      const headers = new Headers();
      setCookie(headers, {
        name: APP_SESSION_COOKIE,
        value: sessionToken,
        expires,
        path: "/",
        httpOnly: true,
      });

      headers.set("location", "/app");
      return new Response(null, {
        status: 303, // See Other
        headers,
      });
    } catch (error) {
      console.error("Login error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});
