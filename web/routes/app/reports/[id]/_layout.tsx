import { define } from "@/root.ts";
import PeriodSelector from "@/islands/PeriodSelector.tsx";
import GranularitySelector from "@/islands/GranularitySelector.tsx";
import { RealtimeSwitch } from "@/islands/reports/RealtimeSwitch.tsx";
import HomeIcon from "lucide-react/dist/esm/icons/home.js";

export default define.layout(({ params: { id }, url, Component, state }) => {
  const { report, period, granularity } = state;
  const basePath = `/app/reports/${id}`;
  const activeTab = url.pathname.split("/").pop();
  return (
    <div class="dashboard-page">
      <div class="mb-4">
        <div class="flex justify-between items-center">
          <div
            class="breadcrumbs font-bold"
            style={{
              paddingBlock: "unset",
              overflow: "unset",
            }}
          >
            <ul>
              <li>
                <a href="/app">
                  <HomeIcon style={{ width: 16, height: 16 }} />
                </a>
              </li>
              <li>
                <a href="/app/reports">
                  Reports
                </a>
              </li>
              <li class="dropdown dropdown-bottom dropdown-end hover:decoration-0">
                <a type="button" tabIndex={0}>
                  {report?.name}
                </a>
                {
                  /* <div class="dropdown-content mt-2 menu card bg-base-100 hover:decoration-0 grid">
                  <a
                    class={`p-2 ${activeTab === "metrics" ? "active" : ""}`}
                    href={`${basePath}/metrics`}
                  >
                    Metrics
                  </a>
                  <a
                    class={`p-2 ${
                      activeTab === "aggregations" ? "active" : ""
                    }`}
                    href={`${basePath}/aggregations`}
                  >
                    Aggregations
                  </a>
                  <a
                    class={`p-2  ${activeTab === "settings" ? "active" : ""}`}
                    href={`${basePath}/settings`}
                  >
                    Settings
                  </a>
                </div> */
                }
              </li>
            </ul>
          </div>
          <div role="tablist" class="tabs tabs-boxed">
          </div>
          <div class="flex justify-end gap-2">
            <PeriodSelector period={period!} />
            <GranularitySelector granularity={granularity!} />
            <span class="divider divider-horizontal"></span>
            <RealtimeSwitch />
            <span class="ml-2"></span>
          </div>
        </div>
      </div>

      <div>
        <Component />
      </div>
    </div>
  );
});
