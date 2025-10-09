import { define } from "@/utils.ts";
import { RouteConfig } from "fresh";
import { AsideSwitch } from "@/islands/navbar/AsideSwitch.tsx";
import { AsideFold } from "@/islands/navbar/AsideFold.tsx";
import { ThemeSwitch } from "@/islands/navbar/ThemeSwitch.tsx";

export const config: RouteConfig = {
  skipInheritedLayouts: true,
};

export default define.layout(function ({ Component, state }) {
  console.log(1, state);
  return (
    <html>
      {
        /* <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

      </head> */
      }
      <body
        data-theme={state.uiTheme || "dark"}
        data-dense={state.uiDense || "0"}
        data-aside={state.uiAside || "1"}
      >
        <nav class="main-navbar">
          <AsideSwitch />
        </nav>
        <main className="flex w-full bg-base-300">
          <aside className="main-aside">
            <div className="main-aside-bottom">
              <AsideFold />
              <ThemeSwitch theme={state.uiTheme} />
            </div>
          </aside>
          <section className="main-outlet">
            <Component />
          </section>
        </main>
      </body>
    </html>
  );
});
