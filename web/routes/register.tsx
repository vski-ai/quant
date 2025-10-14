import { PageProps } from "fresh";
import { Head } from "fresh/runtime";
import { define } from "@/root.ts";

export default define.page(function RegisterPage(props: PageProps) {
  return (
    <>
      <Head>
        <title>Register | VSKI·QUANT</title>
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
              Create an account
            </h2>
            <form method="POST" action="/api/auth/register">
              <input
                type="text"
                name="name"
                placeholder="Name"
                class="input input-bordered w-full my-2"
                required
              />
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
                Register
              </button>
            </form>
            <p class="text-center text-sm mt-4">
              Already have an account? <a href="/login" class="link">Login</a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
});
