import LineChart from "@/islands/LineChart.tsx";
import { useSignal } from "@preact/signals";

export function MetricsView(
  { initialChartData, reportId, initialPeriod, initialGranularity }: any,
) {
  const isRealtime = useSignal(false);
  const isLoading = useSignal(false);
  const realtimeChartData = useSignal<any[] | null>(null);

  return (
    <div>
      {isLoading.value && <div class="skeleton w-full h-64"></div>}
      {!isLoading.value && (
        <LineChart
          data={isRealtime.value ? realtimeChartData.value : initialChartData}
        />
      )}
    </div>
  );
}
