import { Granularity } from "@/quant/core/types.ts";
import { ColumnSelector } from "@/islands/table/ColumnSelector.tsx";
import { GroupingSelector } from "@/islands/table/GroupingSelector.tsx";
import { DynamicTable } from "@/islands/table/index.tsx";
import { useSignal } from "@preact/signals";
import { useRef, useState } from "preact/hooks";
import GridIcon from "lucide-react/dist/esm/icons/grid-2x2-plus.js";
import GroupIcon from "lucide-react/dist/esm/icons/group.js";
import { ColumnSorter, SortState } from "@/islands/table/ColumnSorter.tsx";

interface AggregationViewProps {
  granularity?: Granularity;
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
  const selectedGroups = useSignal<string[]>([]);
  const parent = useRef<HTMLDivElement>(null);
  const delta = ui.dense === "1" ? 130 : 320;
  const [initialWith] = useState(
    globalThis.innerWidth <= 980
      ? 100
      : (ui.width ?? globalThis.innerWidth) - delta,
  );
  const sortState = useSignal<SortState>({
    column: "timestamp",
    sort: "asc",
  });
  const selected = useSignal<any[]>([]);
  const expanded = useSignal<any>({});

  return (
    <div ref={parent} class="-mx-4">
      <div className="fixed z-50 bottom-2 right-6 flex flex-col gap-2">
        <div className="dropdown dropdown-top dropdown-end">
          <button
            tabIndex={0}
            type="button"
            className="btn btn-md btn-primary transition-opacity opacity-40 hover:opacity-100 focus:opacity-100"
          >
            <GroupIcon />
            <span class="badge badge-xs">{selectedGroups.value.length}</span>
          </button>
          <div class="dropdown-content z-100 mb-2">
            <GroupingSelector
              allColumns={allColumns.value}
              selectedGroups={selectedGroups}
            />
          </div>
        </div>
        <div className="dropdown dropdown-top dropdown-end">
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
      </div>
      <DynamicTable
        data={aggregations}
        columns={selectedColumns.value}
        initialWidth={initialWith}
        selectedRows={selected}
        expandedRows={expanded}
        renderExpandedRow={(row) => {
          return <p>Hello World!</p>;
        }}
        columnExtensions={(column: string) => (
          <ColumnSorter
            key={sortState.value.column}
            column={column}
            state={sortState}
            onChange={(s) => {
              console.log("needs update");
            }}
          />
        )}
      />
    </div>
  );
};
