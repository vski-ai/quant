import { ColumnSelector } from "@/islands/table/ColumnSelector.tsx";
import { DynamicTable } from "@/islands/table/DynamicTable.tsx";
import { useSignal } from "@preact/signals";
import { useRef, useState } from "preact/hooks";
import GridIcon from "lucide-react/dist/esm/icons/grid-2x2-plus.js";

interface AggregationViewProps {
  aggregations: Record<string, unknown>[];
  ui: {
    dense?: string;
    width?: number;
  };
}

export const AggregationView = (
  { aggregations, ui }: AggregationViewProps,
) => {
  const columns = Object.keys(aggregations?.[0] ?? {});
  const allColumns = useSignal<string[]>(columns);
  const selectedColumns = useSignal<string[]>(columns?.slice(0, 5));
  const parent = useRef<HTMLDivElement>(null);
  const delta = ui.dense === "1" ? 130 : 320;
  const [initialWith] = useState((ui.width ?? globalThis.innerWidth) - delta);
  return (
    <div ref={parent} class="-mx-4">
      <div className="fixed z-50 bottom-2 right-6 dropdown dropdown-top dropdown-end">
        {/* a focusable div with tabIndex is necessary to work on all browsers. role="button" is necessary for accessibility */}
        <button
          tabIndex={0}
          type="button"
          className="btn btn-md btn-primary transition-opacity opacity-40 hover:opacity-100 focus:opacity-100"
        >
          <GridIcon />
          <span class="badge badge-xs">{selectedColumns.value.length}</span>
        </button>

        <div class="dropdown-content z-100 mb-2">
          <ColumnSelector
            allColumns={allColumns.value}
            selectedColumns={selectedColumns}
          />
        </div>
      </div>
      <DynamicTable
        data={aggregations}
        columns={selectedColumns.value}
        initialWidth={initialWith}
      />
    </div>
  );
};
