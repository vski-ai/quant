import { define, State } from "@/root.ts";
import quant from "@/db/quant.ts";
import { PageProps } from "fresh";
import { GetApiAggregationSourcesResponse } from "@/quant/http/client.ts";
import { AggregationView } from "@/islands/reports/AggregationView.tsx";
import { calculateTimeRange } from "@/shared/time.ts";
import { Granularity } from "@/quant/core/types.ts";

interface AggregationsData {
  availableMetrics: string[];
  dataset?: Record<string, unknown>[]; // Results from a POST request
}

export const handler = define.handlers({
  async GET(ctx) {
    const { id } = ctx.params;
    const { state } = ctx;
    const selectedMetrics: string[] = [];

    // Re-fetch available metrics for rendering
    const { data: aggregationSources, error: sourcesError } = await quant
      .getApiAggregationSources({ query: { reportId: id } });
    if (sourcesError) {
      return new Response((sourcesError as any).error, { status: 500 });
    }
    const availableMetrics = [
      ...new Set(
        (aggregationSources as GetApiAggregationSourcesResponse).flatMap((as) =>
          as.aggregations?.map((a) => a.payloadField).filter(Boolean)
        ),
      ),
    ];

    const period = state.period || "1d";
    const granularity: Granularity =
      (state.granularity || "hour") as Granularity;
    const timeRange = calculateTimeRange(period);

    const { data: dataset, error: datasetError } = await quant
      .postApiReportsIdDataset({
        path: { id },
        body: {
          metrics: selectedMetrics,
          timeRange,
          granularity,
        },
      });

    if (datasetError) {
      // Handle error, maybe render page with an error message
      console.error(datasetError);
    }

    return { data: { availableMetrics, dataset: dataset || [] } };
  },
});

export default define.page((props: PageProps<AggregationsData>) => {
  const { dataset } = props.data;
  const state = props.state as State;
  return (
    <AggregationView
      aggregations={dataset!}
      ui={state.ui}
    />
  );
});
