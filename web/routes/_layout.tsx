import { define } from "../utils.ts";
import { LogsIcon, MenuIcon } from "lucide-react";

export default define.layout(function App({ Component, state }) {
  console.log(state);
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>fresh-project</title>
      </head>
      <body class="" data-theme="dark">
        <nav class="main-navbar">
          <LogsIcon
            className=""
            style={{ width: "24px", height: "24px" }}
          />
        </nav>
        <main className="flex w-full bg-base-300">
        </main>
        <Component />
      </body>
    </html>
  );
});
