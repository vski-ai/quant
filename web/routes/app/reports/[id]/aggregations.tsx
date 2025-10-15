import { define } from "@/root.ts";
import quant from "@/db/quant.ts";
import { PageProps } from "fresh";
import { GetApiAggregationSourcesResponse } from "@/quant/http/client.ts";
import { AggregationView } from "@/islands/reports/AggregationView.tsx";

interface AggregationsData {
  report: any;
  availableMetrics: string[];
  dataset?: any[]; // Results from a POST request
}

export const handler = define.handlers({
  async GET(ctx) {
    const { id } = ctx.params;
    const { state } = ctx;
    const selectedMetrics: any = [];

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
    const granularity = state.granularity || "hour";
    const now = new Date();
    const [magnitude, unit] = [parseInt(period.slice(0, -1)), period.slice(-1)];
    const start = new Date(
      now.getTime() - magnitude * (unit === "h" ? 3600000 : 86400000),
    );

    const timeRange = { start: start.toISOString(), end: now.toISOString() };

    const { data: dataset, error: datasetError } = await quant
      .postApiReportsIdDataset({
        path: { id },
        body: {
          metrics: selectedMetrics,
          timeRange,
          granularity: (granularity as any),
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
  return <AggregationView aggregations={dataset} />;
});
