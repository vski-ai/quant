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
          <div class="breadcrumbs font-bold">
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
              <li>
                <a>
                  {report?.name}
                </a>
              </li>
            </ul>
          </div>
          <div role="tablist" class="tabs tabs-boxed">
            <a
              role="tab"
              class={`tab ${activeTab === "metrics" ? "tab-active" : ""}`}
              href={`${basePath}/metrics`}
            >
              Metrics
            </a>
            <a
              role="tab"
              class={`tab ${activeTab === "aggregations" ? "tab-active" : ""}`}
              href={`${basePath}/aggregations`}
            >
              Aggregations
            </a>
            <a
              role="tab"
              class={`tab ${activeTab === "settings" ? "tab-active" : ""}`}
              href={`${basePath}/settings`}
            >
              Settings
            </a>
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
