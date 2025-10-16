import { PageProps } from "fresh";
import { Head } from "fresh/runtime";
import { define } from "@/root.ts";

export default define.page(function LoginPage(props: PageProps) {
  const message = props.url.searchParams.get("message");

  return (
    <>
      <Head>
        <title>Login | VSKI·QUANT</title>
      </Head>
      <div class="min-h-screen bg-base-200 flex items-center w-full">
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
            {message && <p class="text-center text-green-500">{message}</p>}
            <form method="POST" action="/api/auth/login">
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
            <div class="divider">OR</div>
            <a href="/auth/github" class="btn btn-outline w-full">
              Login with GitHub
            </a>
            <p class="text-center text-sm mt-4">
              Don't have an account?{" "}
              <a href="/register" class="link">Register</a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
});
