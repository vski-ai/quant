import { define } from "@/root.ts";
import { Head } from "fresh/runtime";

export default define.page(function ProfilePage(ctx) {
  const { user } = ctx.state;

  return (
    <div class="p-4 md:p-8">
      <Head>
        <title>Profile</title>
      </Head>
      <div class="max-w-screen-md">
        <h1 class="text-4xl font-bold">User Profile</h1>
        <p class="my-4">
          Welcome,{" "}
          <code class="font-mono bg-base-100 p-1 rounded">
            {user.profile.name} ({user.email})
          </code>!
        </p>
        <div class="mt-8">
          <h2 class="text-2xl font-bold">Update Profile</h2>
          <form method="POST" action="/api/profile" class="mt-4 space-y-4">
            <input
              name="name"
              placeholder="New Name"
              class="input input-bordered w-full"
              defaultValue={user.profile.name}
              required
            />
            <button type="submit" class="btn btn-primary">Update Name</button>
          </form>
        </div>

        <p class="mt-8">
          This is where you will manage your API keys and view usage statistics.
        </p>
        <a href="/logout" class="btn btn-secondary mt-4">Logout</a>
      </div>
    </div>
  );
});
