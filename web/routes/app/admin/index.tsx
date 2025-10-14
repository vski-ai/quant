import { define } from "@/root.ts";
import { Head } from "fresh/runtime";

export default define.page(function AdminPage(_ctx) {
  return (
    <div class="p-4 md:p-8">
      <Head>
        <title>Admin</title>
      </Head>
      <div class="max-w-screen-md">
        <h1 class="text-4xl font-bold">Admin</h1>
        <p class="my-4">
          Welcome to the admin dashboard.
        </p>
      </div>
    </div>
  );
});
