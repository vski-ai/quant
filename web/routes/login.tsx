import { PageProps } from "fresh";
import { setCookie } from "@std/http";
import { Head } from "fresh/runtime";
import { define } from "@/root.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const email = form.get("email")?.toString();

    // Mocked login: any user is valid
    const headers = new Headers();
    setCookie(headers, {
      name: "q_session",
      value: email || "user", // Use email as session identifier
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: "/",
      httpOnly: true,
    });

    headers.set("location", "/app");
    return new Response(null, {
      status: 303, // See Other
      headers,
    });
  },
});

export default define.page(function LoginPage(props: PageProps) {
  return (
    <>
      <Head>
        <title>Login | VSKI·QUANT</title>
      </Head>
      <div class="min-h-screen bg-base-200 flex items-center">
        <div class="card mx-auto w-full max-w-sm shadow-xl">
          <div class="card-body">
            <img
              src="/logo.svg"
              width="64"
              height="64"
              alt="VSKI·QUANT Logo"
              class="mx-auto"
            />
            <h2 class="card-title text-2xl font-bold text-center block">
              Sign in to your account
            </h2>
            <form method="POST">
              <input
                type="email"
                name="email"
                placeholder="Email"
                class="input input-bordered w-full my-2"
                required
              />
              <input
                type="password"
                name="password"
                placeholder="Password"
                class="input input-bordered w-full my-2"
                required
              />
              <button type="submit" class="btn btn-primary w-full mt-4">
                Login
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
});
