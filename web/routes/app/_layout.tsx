import { define } from "@/root.ts";
import { RouteConfig } from "fresh";
import { AsideSwitch } from "@/islands/navbar/AsideSwitch.tsx";
import { AsideFold } from "@/islands/navbar/AsideFold.tsx";
import { ThemeSwitch } from "@/islands/navbar/ThemeSwitch.tsx";
import { AlertDialog } from "@/islands/AlertDialog.tsx";
import { Roles } from "@/db/models.ts";

import UserIcon from "lucide-react/dist/esm/icons/user.js";
import FolderKeyIcon from "lucide-react/dist/esm/icons/folder-key.js";
import LayoutDashboardIcon from "lucide-react/dist/esm/icons/layout-dashboard.js";
import ShieldIcon from "lucide-react/dist/esm/icons/shield.js";
import PlugZapIcon from "lucide-react/dist/esm/icons/plug-zap.js";
import ChartIcon from "lucide-react/dist/esm/icons/chart-column-increasing.js";

export const config: RouteConfig = {
  skipInheritedLayouts: true,
};

export default define.layout(function ({ Component, state, url }) {
  const isAdmin = state.user?.roles.includes(Roles.admin);

  return (
    <html>
      {
        /* <head>
        <meta charset="utf-8" />


      </head> */
      }
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body
        class="scr"
        data-theme={state.ui.theme || "dark"}
        data-dense={state.ui.dense || "0"}
        data-aside={state.ui.aside || "1"}
      >
        <nav class="main-navbar">
          <AsideSwitch />
          <div class="flex-1" />
        </nav>
        <main className="flex min-w-full w-fit bg-base-300">
          <aside className="main-aside">
            <div class="h-12"></div>
            <ul className="main-aside-menu">
              <li>
                <a href="/app" class="aria-[current=page]:active">
                  <LayoutDashboardIcon />
                  Dashboard
                </a>
              </li>
              <li>
                <a href="/app/reports" class="aria-[current=page]:active">
                  <ChartIcon />
                  Reports
                </a>
                <ul class="dense:ml-0 dense:pl-0">
                  <li>
                    <a href="/app/sources" class="aria-[current=page]:active">
                      <PlugZapIcon />
                      Event Sources
                    </a>
                  </li>
                </ul>
              </li>
              <li>
                <a href="/app/keys" class="aria-[current=page]:active">
                  <FolderKeyIcon />
                  API Keys
                </a>
              </li>
              {isAdmin && (
                <li>
                  <a href="/app/admin" class="aria-[current=page]:active">
                    <ShieldIcon />
                    Admin
                  </a>
                </li>
              )}
            </ul>
            <div className="main-aside-bottom">
              <a
                href="/app/profile"
                class="btn btn-ghost btn-circle"
                aria-label="Profile"
              >
                <UserIcon style={{ width: "24px", height: "24px" }} />
              </a>
              <AsideFold />
              <ThemeSwitch theme={state.ui.theme!} />
            </div>
          </aside>
          <section className="main-outlet">
            <Component />
          </section>
          <AlertDialog />
        </main>
      </body>
    </html>
  );
});
