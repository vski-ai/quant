import { define } from "@/root.ts";
import { Head } from "fresh/runtime";
import { StatsCard } from "@/components/StatsCard.tsx";
import PeriodSelector from "@/islands/PeriodSelector.tsx";
import LineChart from "@/islands/LineChart.tsx";
import BarChart from "@/islands/BarChart.tsx";
import ApiKeysTable from "@/islands/keys/ApiKeysTable.tsx";

const MOCK_KEYS = [
  {
    id: "1",
    name: "My First App",
    key: "sk_live_xxxxxxxxxxxxxxxxxxxx1234",
    status: "active",
    created: "2024-05-01",
    usage: 1024,
  },
  {
    id: "2",
    name: "Staging Environment",
    key: "sk_test_xxxxxxxxxxxxxxxxxxxx5678",
    status: "active",
    created: "2024-04-15",
    usage: 512,
  },
  {
    id: "3",
    name: "Old Integration (Inactive)",
    key: "$$$sk_test_xxxxxxxxxxxxxxxxxxxx9012",
    status: "inactive",
    created: "2023-11-20",
    usage: 8192,
  },
];

const generateDailyData = (days: number, max: number) => {
  const data = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - i));
    data.push({
      date, // Pass date as string
      value: Math.floor(Math.random() * max),
    });
  }
  return data;
};

const requestsData = generateDailyData(30, 1500);
const errorsData = generateDailyData(30, 50);

export default define.page(function ApiKeysPage(ctx) {
  console.log(ctx);
  const period = ctx.state.period || "1d";
  // NOTE: In a real app, you would parse the period and pass the correct
  // date range to your data fetching logic. For now, we'll just display it.
  const periodLabel = period.endsWith("h")
    ? `${period.slice(0, -1)} hours`
    : `${period.slice(0, -1)} days`;

  return (
    <div class="p-4 md:p-8">
      <Head>
        <title>API Keys</title>
      </Head>

      <div class="flex justify-between">
        <h1 class="text-3xl font-bold mb-8">
          API Keys
        </h1>
        <div>
          <PeriodSelector period={period} />
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <StatsCard
          periodLabel={periodLabel}
          counters={[
            {
              label: "rps",
              value: "1K+",
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
              value: "10K+",
              class: "badge-error",
            },
          ]}
        >
          <BarChart data={errorsData} />
        </StatsCard>
      </div>

      <ApiKeysTable keys={MOCK_KEYS} />
    </div>
  );
});
