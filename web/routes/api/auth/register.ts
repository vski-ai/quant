import { define } from "@/root.ts";
import { connectMongo } from "@/db/mongo.ts";
import { Plan, Roles, User, UserProfile } from "@/db/models.ts";
import { minLength, object, parse, pipe, string } from "valibot";
import { hashPassword } from "@/auth/password.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = form.get("name")?.toString();
    const email = form.get("email")?.toString();
    const password = form.get("password")?.toString();

    try {
      const InputSchema = object({
        name: pipe(string(), minLength(1, "Name is required")),
        email: pipe(string(), minLength(1, "Email is required")),
        password: pipe(string(), minLength(1, "Password is required")),
      });
      parse(InputSchema, { name, email, password });
    } catch (error) {
      return new Response((error as Error).message, { status: 400 });
    }

    try {
      const db = await connectMongo();
      const Users = db.collection<User>("users");
      const UserProfiles = db.collection<UserProfile>("userprofiles");
      const Plans = db.collection<Plan>("plans");

      const existingUser = await Users.findOne({ email });
      if (existingUser) {
        return new Response("User with this email already exists", {
          status: 409,
        });
      }

      const communityPlan = await Plans.findOne({ name: "community" });
      if (!communityPlan) {
        return new Response("Default plan not found", { status: 500 });
      }

      const userProfileId = await UserProfiles.insertOne({
        name: name!,
        plan: communityPlan._id,
      });

      const hashedPassword = await hashPassword(password!);

      await Users.insertOne({
        email: email!,
        password: hashedPassword,
        roles: [Roles.user],
        profile: userProfileId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const headers = new Headers();
      headers.set(
        "location",
        "/login?message=Registration successful. Please login.",
      );
      return new Response(null, {
        status: 303, // See Other
        headers,
      });
    } catch (error) {
      console.error("Registration error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});
