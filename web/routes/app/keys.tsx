import { define } from "@/root.ts";
import { Head } from "fresh/runtime";
import { StatsCard } from "@/components/StatsCard.tsx";
import PeriodSelector from "@/islands/PeriodSelector.tsx";
import GranularitySelector from "@/islands/GranularitySelector.tsx";
import LineChart from "@/islands/LineChart.tsx";
import BarChart from "@/islands/BarChart.tsx";
import ApiKeysTable from "@/islands/keys/ApiKeysTable.tsx";
import api from "@/db/quant.ts";
import { obfuscate } from "@/shared/obfuscate.ts";
import { ApiKey } from "@/root/http/auth/types.ts";
import { AggregationType, Granularity } from "@/root/core/types.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const owner = ctx.state.user?._id.toString();
    const { data: keys } = await api.getApiAuthKeys({
      query: {
        owner,
      },
    });
    // @ts-ignore:
    // keys?.forEach((record: ApiKey) => {
    //   record.key = obfuscate(record.key);
    // });

    const period = ctx.state.period || "1d";
    const granularity = ctx.state.granularity || "hour";
    const now = new Date();
    const [magnitude, unit] = [parseInt(period.slice(0, -1)), period.slice(-1)];
    const start = new Date(
      now.getTime() - magnitude * (unit === "h" ? 3600000 : 86400000),
    );

    const timeRange = { start: start.toISOString(), end: now.toISOString() };

    const { data: requestsReport } = await api.postApiAuthUsageReport({
      body: {
        owner,
        timeRange,
        granularity: granularity as Granularity,
      },
    });

    const { data: errorsReport } = await api.postApiAuthUsageReport({
      body: {
        owner,
        timeRange,
        granularity: granularity as Granularity,
        metric: { type: AggregationType.CATEGORY, field: "status" },
      },
    });

    const requestsData = requestsReport?.map((d) => ({
      date: new Date(d.timestamp),
      value: d.value,
    }));
    const errorsData = errorsReport?.filter((d) => d.category === "error")
      .map((d) => ({ date: new Date(d.timestamp), value: d.value }));

    const totalRequests = requestsData?.reduce((acc, d) => acc + d.value, 0);
    const totalErrors = errorsData?.reduce((acc, d) => acc + d.value, 0);

    return {
      data: {
        keys,
        requestsData,
        errorsData,
        totalRequests,
        totalErrors,
      },
    };
  },
});

export default define.page((ctx) => {
  const { keys, requestsData, errorsData, totalRequests, totalErrors } = ctx
    .data as any;

  const period = ctx.state.period || "1d";
  const granularity = ctx.state.granularity || "hour";
  const periodLabel = period.endsWith("h")
    ? `${period.slice(0, -1)} hours`
    : `${period.slice(0, -1)} days`;

  return (
    <div class="dashboard-page">
      <Head>
        <title>API Keys</title>
      </Head>

      <div class="flex justify-between items-center mb-12">
        <h1 class="text-2xl font-bold">
          API Keys
        </h1>
        <div class="flex gap-2">
          <PeriodSelector period={period} />
          <GranularitySelector granularity={granularity} />
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <StatsCard
          periodLabel={periodLabel}
          counters={[
            {
              label: "requests",
              value: totalRequests.toLocaleString(),
              class: "badge-success",
            },
          ]}
        >
          <LineChart data={requestsData} />
        </StatsCard>
        <StatsCard
          periodLabel={periodLabel}
          counters={[
            {
              label: "errors",
              value: totalErrors.toLocaleString(),
              class: "badge-error",
            },
          ]}
        >
          <BarChart data={errorsData} />
        </StatsCard>
      </div>

      <ApiKeysTable keys={keys} />
    </div>
  );
});
