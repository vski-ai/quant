import { define } from "@/root.ts";
import quant from "@/db/quant.ts";
import { AggregationType, Granularity } from "@/quant/core/types.ts";
import { MetricsView } from "@/islands/reports/MetricsView.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const { id } = ctx.params;
    const { state } = ctx;

    const period = state.period || "1d";
    const granularity = state.granularity || "hour";
    const now = new Date();
    const [magnitude, unit] = [parseInt(period.slice(0, -1)), period.slice(-1)];
    const start = new Date(
      now.getTime() - magnitude * (unit === "h" ? 3600000 : 86400000),
    );

    const timeRange = { start: start.toISOString(), end: now.toISOString() };

    const { data: reportData, error: reportError } = await quant
      .postApiReportsIdData({
        path: { id },
        body: {
          timeRange,
          granularity: granularity as Granularity,
          metric: { type: AggregationType.COUNT },
        },
      });

    if (reportError) {
      console.error("Could not fetch initial chart data:", reportError);
    }

    const chartData = reportData?.map((d) => ({
      date: new Date(d.timestamp),
      value: d.value,
    })) || [];

    return { data: { chartData, period, granularity } };
  },
});

export default define.page((props) => {
  const { report } = props.state;
  const { chartData, period, granularity } = props.data as any;

  return (
    <div>
      <MetricsView
        initialChartData={chartData}
        reportId={report.id}
        initialPeriod={period}
        initialGranularity={granularity}
      />
    </div>
  );
});
