import { Signal, useSignal } from "@preact/signals";
import {
  GetApiAggregationSourcesResponse,
  GetApiEventSourcesResponse,
  GetApiReportsIdResponse,
} from "@/quant/http/client.ts";
import Modal from "@/islands/Modal.tsx";
import { AddAggregationSourceForm } from "./AddAggregationSourceForm.tsx";
import { showAlert } from "@/shared/alert.ts";

interface AggregationSourcesManagerProps {
  report: GetApiReportsIdResponse;
  aggregationSources: GetApiAggregationSourcesResponse;
  availableEventSources: GetApiEventSourcesResponse;
}

export function AggregationSourcesManager({
  report,
  aggregationSources,
  availableEventSources,
}: AggregationSourcesManagerProps) {
  const aggSources = useSignal(aggregationSources);

  const handleDelete = async (sourceId: string) => {
    if (!confirm("Are you sure you want to delete this aggregation source?")) {
      return;
    }

    const res = await fetch(
      `/app/api/reports/${report.id}/aggregation-sources/${sourceId}`,
      {
        method: "DELETE",
      },
    );

    if (res.ok) {
      aggSources.value = aggSources.value.filter((s) => s.id !== sourceId);
    } else {
      showAlert("Failed to delete aggregation source.");
    }
  };

  return (
    <div class="card shadow p-4 bg-base-100">
      {aggSources.value.length === 0
        ? <p>No aggregation sources configured for this report.</p>
        : (
          <div class="overflow-x-auto">
            <table class="table w-full">
              <thead>
                <tr>
                  <th>Target Collection</th>
                  <th>Filtered Sources</th>
                  <th>Filtered Events</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {aggSources.value.map((source) => (
                  <tr key={source.id}>
                    <td>
                      <code>{source.targetCollection}</code>
                    </td>
                    <td>
                      {source.filter?.sources.map((s) => s.name).join(", ") ||
                        "All"}
                    </td>
                    <td>{source.filter?.events.join(", ") || "All"}</td>
                    <td>
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        onClick={() => handleDelete(source.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <div class="flex justify-center items-center">
        <Modal
          id="add-aggregation-source"
          title="Add Aggregation Source"
          triggerClass="btn btn-sm btn-dashed opacity-40 hover:opacity-100 transition-opacity min-w-64"
          trigger="Add Source"
        >
          <AddAggregationSourceForm
            report={report}
            availableSources={availableEventSources}
            aggregationSources={aggSources}
          />
        </Modal>
      </div>
    </div>
  );
}
