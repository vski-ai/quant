import { githubOAuth2Client } from "@/auth/oauth.ts";
import { setCookie } from "@std/http";
import { connectMongo } from "@/db/mongo.ts";
import { Plan, Roles, Session, User, UserProfile } from "@/db/models.ts";
import { define } from "@/root.ts";
import { hashPassword } from "@/auth/password.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const { response, tokens, sessionId } = await githubOAuth2Client
      .handleCallback(ctx.req);

    const githubUser = await (await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })).json();

    const db = await connectMongo();
    const Users = db.collection<User>("users");
    const UserProfiles = db.collection<UserProfile>("userprofiles");
    const Sessions = db.collection<Session>("sessions");
    const Plans = db.collection<Plan>("plans");

    let user = await Users.findOne({ email: githubUser.email });

    if (!user) {
      const communityPlan = await Plans.findOne({ name: "community" });
      if (!communityPlan) {
        return new Response("Default plan not found", { status: 500 });
      }

      const userProfileId = await UserProfiles.insertOne({
        name: githubUser.name ?? githubUser.login,
        plan: communityPlan._id,
      });

      const hashedPassword = await hashPassword(crypto.randomUUID());

      const userId = await Users.insertOne({
        email: githubUser.email,
        password: hashedPassword,
        roles: [Roles.user],
        profile: userProfileId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      user = await Users.findOne({ _id: userId });
    }

    // Create session
    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week

    await Sessions.insertOne({
      sessionToken,
      userId: user!._id,
      expires,
    });

    const headers = new Headers(response.headers);
    setCookie(headers, {
      name: "q_session",
      value: sessionToken,
      expires,
      path: "/",
      httpOnly: true,
    });

    headers.set("location", "/app");
    return new Response(null, {
      status: 302,
      headers,
    });
  },
});
