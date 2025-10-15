import { Signal } from "@preact/signals";
import { formatColumnName } from "@/shared/formatters.ts";

interface ColumnManagerProps {
  allColumns: string[];
  selectedColumns: Signal<string[]>;
}

export function ColumnSelector(
  { allColumns, selectedColumns }: ColumnManagerProps,
) {
  const handleCheckboxChange = (column: string, isChecked: boolean) => {
    const currentSelection = selectedColumns.value;
    let newSelection: string[];

    if (isChecked) {
      newSelection = [...currentSelection, column];
    } else {
      newSelection = currentSelection.filter((c) => c !== column);
    }

    // Filter 'allColumns' to preserve the original order.
    selectedColumns.value = allColumns.filter((c) => newSelection.includes(c));
  };

  return (
    <ul
      tabIndex={0}
      class="menu flex-row p-2 shadow-lg bg-base-100 border border-primary font-bold rounded-box max-w-64 max-h-96 overflow-y-auto overflow-x-hidden"
    >
      {allColumns.map((column, i) => {
        const formattedName = formatColumnName(column);
        return (
          <li key={column} class="w-full">
            <label class="label cursor-pointer w-full flex justify-between">
              <span
                class="label-text truncate max-w-52"
                title={formattedName}
              >
                {formattedName}
              </span>
              <input
                type="checkbox"
                class="checkbox checkbox-primary"
                checked={selectedColumns.value.includes(column)}
                onChange={(e) =>
                  handleCheckboxChange(column, e.currentTarget.checked)}
              />
            </label>
          </li>
        );
      })}
    </ul>
  );
}
