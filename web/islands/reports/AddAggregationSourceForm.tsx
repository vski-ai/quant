import { Signal } from "@preact/signals";
import {
  GetApiAggregationSourcesResponse,
  GetApiEventSourcesResponse,
  GetApiReportsIdResponse,
} from "@/quant/http/client.ts";
import { Granularity } from "@/quant/core/types.ts";

interface AddAggregationSourceFormProps {
  report: GetApiReportsIdResponse;
  aggregationSources: Signal<GetApiAggregationSourcesResponse>;
  availableSources: GetApiEventSourcesResponse;
}

export function AddAggregationSourceForm(
  { report, aggregationSources, availableSources }:
    AddAggregationSourceFormProps,
) {
  const handleSubmit = async (ev: Event) => {
    ev.preventDefault();
    const form = ev.target as HTMLFormElement;
    const formData = new FormData(form);

    const selectedSourceIds = formData.getAll("sources") as string[];
    const selectedSources = availableSources.filter((s) =>
      selectedSourceIds.includes(s.id)
    );

    const body = {
      targetCollection: formData.get("targetCollection") as string,
      granularity: formData.get("granularity") as Granularity,
      filter: {
        sources: selectedSources.map((s) => ({ id: s.id, name: s.name })),
        events: [],
      },
    };

    const res = await fetch(`/api/reports/${report.id}/aggregation-sources`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      const newSource = await res.json();
      aggregationSources.value = [...aggregationSources.value, newSource];
      // @ts-ignore: TODO: close modal
      document.getElementById("add-aggregation-source").close();
      form.reset();
    } else {
      alert("Failed to add aggregation source.");
    }
  };
  console.log(1, report);
  const suggestedTarget = `aggr_${
    report.name.toLowerCase().replace(/[^a-z0-9_]/g, "_")
  }`;

  return (
    <form class="space-y-4" onSubmit={handleSubmit}>
      <div class="form-control">
        <label class="label">
          <span class="label-text">Target Collection</span>
        </label>
        <input
          type="text"
          name="targetCollection"
          class="input input-lg input-bordered w-full"
          required
          defaultValue={suggestedTarget}
        />
      </div>

      <div class="form-control">
        <label class="label mb-2">
          <span class="label-text font-bold">Event Sources</span>
        </label>
        <div class="flex flex-col gap-1 max-h-48 overflow-y-auto bg-base-200">
          {availableSources.map((source) => (
            <label
              class="label cursor-pointer flex justify-between border border-primary p-2 rounded-md"
              key={source.id}
            >
              <span class="label-text">{source.name}</span>
              <input
                type="checkbox"
                name="sources"
                value={source.id}
                class="checkbox checkbox-primary"
              />
            </label>
          ))}
        </div>
      </div>

      <div class="form-control">
        <label class="label">
          <span class="label-text">Granularity</span>
        </label>
        <select
          name="granularity"
          class="select select-bordered w-full"
          defaultValue="minute"
        >
          <option value="minute">Minute</option>
          <option value="hour">Hour</option>
          <option value="day">Day</option>
          <option value="month">Month</option>
        </select>
      </div>

      <div class="form-control mt-6">
        <button type="submit" class="btn w-full">
          Add Aggregation Source
        </button>
      </div>
    </form>
  );
}
