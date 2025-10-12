import { define } from "@/root.ts";
import { Head } from "fresh/runtime";

export default define.page(function ProfilePage(ctx) {
  const { session } = ctx.state;

  return (
    <div class="p-4 md:p-8">
      <Head>
        <title>Profile</title>
      </Head>
      <div class="max-w-screen-md">
        <h1 class="text-4xl font-bold">User Profile</h1>
        <p class="my-4">
          Welcome,{" "}
          <code class="font-mono bg-base-100 p-1 rounded">{session}</code>!
        </p>
        <p>
          This is where you will manage your API keys and view usage statistics.
        </p>
        <a href="/logout" class="btn btn-secondary mt-4">Logout</a>
      </div>
    </div>
  );
});
