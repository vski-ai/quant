import { define } from "@/root.ts";
import { connectMongo } from "@/db/mongo.ts";
import { UserProfile } from "@/db/models.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const form = await ctx.req.formData();
    const name = form.get("name")?.toString();

    if (!name) {
      return new Response("Missing name", { status: 400 });
    }

    try {
      await connectMongo();
      await UserProfile.updateOne({ _id: user.profile._id }, { name });

      const headers = new Headers();
      headers.set("location", "/app/profile");
      return new Response(null, {
        status: 303, // See Other
        headers,
      });
    } catch (error) {
      console.error("Profile update error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});
