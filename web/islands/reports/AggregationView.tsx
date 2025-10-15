import { ColumnSelector } from "@/islands/table/ColumnSelector.tsx";
import { DynamicTable } from "@/islands/table/DynamicTable.tsx";
import { useSignal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import GridIcon from "lucide-react/dist/esm/icons/grid-2x2-plus.js";

export const AggregationView = ({ aggregations }: any) => {
  const columns = Object.keys(aggregations?.[0]);
  const allColumns = useSignal<string[]>(columns);
  const selectedColumns = useSignal<string[]>(columns?.slice(0, 5));
  const parent = useRef<HTMLDivElement>(null);
  const [initialWith, setInitWith] = useState(globalThis.innerWidth - 50);

  useEffect(() => {
    setInitWith(
      parent.current?.getBoundingClientRect().width || globalThis.innerWidth,
    );
  });

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
