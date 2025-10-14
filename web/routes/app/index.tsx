import { useSignal } from "@preact/signals";
import { Head } from "fresh/runtime";
import { define } from "@/root.ts";
import Counter from "@/islands/Counter.tsx";

export default define.page(function Home(ctx) {
  const count = useSignal(3);

  return (
    <div class="dashboard-page fresh-gradient ">
      <Head>
        <title>App</title>
      </Head>
      <div class="max-w-screen-md mx-auto flex flex-col items-center justify-center">
        <img
          class="my-6"
          src="/logo.svg"
          width="128"
          height="128"
          alt="the Fresh logo: a sliced lemon dripping with juice"
        />
        <h1 class="text-4xl font-bold">Welcome to Fresh</h1>
        <p class="my-4">
          Try updating this message in the asdasdasd
          <code class="mx-2">./routes/index.tsx</code> file, and refresh.
        </p>
        <Counter count={count} />
      </div>
    </div>
  );
});
