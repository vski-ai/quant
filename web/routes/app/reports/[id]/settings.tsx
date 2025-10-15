import { define } from "@/root.ts";
import quant from "@/db/quant.ts";
import { AggregationSourcesManager } from "@/islands/reports/AggregationSourcesManager.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const { id } = ctx.params;

    // Fetch the data needed for the settings page
    const { data: aggregationSources, error: sourcesError } = await quant
      .getApiAggregationSources({
        query: { reportId: id },
      });

    const { data: availableEventSources, error: availableSourcesError } =
      await quant.getApiEventSources({});

    if (sourcesError || availableSourcesError) {
      // Handle errors appropriately
      return new Response("Error fetching settings data", { status: 500 });
    }

    return { data: { aggregationSources, availableEventSources } };
  },
});

export default define.page((props) => {
  const { report } = props.state;
  const { aggregationSources, availableEventSources } = props.data as any;

  return (
    <AggregationSourcesManager
      report={report}
      aggregationSources={aggregationSources}
      availableEventSources={availableEventSources}
    />
  );
});
