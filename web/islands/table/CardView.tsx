import { useSignal } from "@preact/signals";
import { formatColumnName } from "../../shared/formatters.ts";

interface CardViewProps {
  data: any[];
  columns: string[];
}

export function CardView({ data, columns }: CardViewProps) {
  const collapsedStates = useSignal<Record<number, boolean>>({});

  const toggleCollapse = (rowIndex: number) => {
    collapsedStates.value = {
      ...collapsedStates.value,
      [rowIndex]: !collapsedStates.value[rowIndex],
    };
  };

  if (!data || data.length === 0) {
    return <p>No data to display.</p>;
  }

  return (
    <div class="space-y-4">
      {data.map((row, rowIndex) => (
        <div
          key={rowIndex}
          class={`bg-base-200 shadow-md collapse collapse-arrow ${
            collapsedStates.value[rowIndex] ? "collapse-open" : ""
          }`}
        >
          <div
            class="collapse-title font-medium"
            onClick={() => toggleCollapse(rowIndex)}
          >
            {/* Show the first column's value as a title, or just "Row X" */}
            {row[columns[0]] || `Row ${rowIndex + 1}`}
          </div>
          <div class="collapse-content">
            <div class="space-y-2">
              {columns.map((col) => {
                const formattedName = formatColumnName(col);
                return (
                  <div key={col} class="flex justify-between">
                    <span class="font-semibold text-sm">{formattedName}:</span>
                    <span class="text-right truncate" title={row[col]}>
                      {typeof row[col] === "boolean"
                        ? row[col].toString()
                        : row[col]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
