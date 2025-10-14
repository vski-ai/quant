import { connectMongo } from "@/db/mongo.ts";
import { Plan, Session, User, UserProfile } from "@/db/models.ts";
import { ObjectId } from "deno_mongo";

export async function getUserBySession(
  sessionToken: string,
): Promise<(User & { profile: UserProfile & { plan: Plan } }) | null> {
  const db = await connectMongo();
  const Sessions = db.collection<Session>("sessions");
  const Users = db.collection<User>("users");
  const UserProfiles = db.collection<UserProfile>("userprofiles");
  const Plans = db.collection<Plan>("plans");

  const session = await Sessions.findOne({ sessionToken });

  if (!session || session.expires < new Date()) {
    return null;
  }

  const user = await Users.findOne({ _id: new ObjectId(session.userId) });
  if (!user) {
    return null;
  }

  const userProfile = await UserProfiles.findOne({ _id: user.profile });
  const plan = userProfile
    ? await Plans.findOne({ _id: userProfile.plan })
    : null;

  return {
    ...user,
    profile: {
      ...userProfile,
      plan: plan,
    },
  } as User & { profile: UserProfile & { plan: Plan } };
}
