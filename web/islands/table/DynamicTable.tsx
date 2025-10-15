import { useSignal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { useMediaQuery } from "../../shared/useMediaQuery.ts";
import { CardView } from "./CardView.tsx";
import { ResizableHeader } from "./ResizableHeader.tsx";

interface DynamicTableProps {
  data: any[];
  columns: string[];
  initialWidth?: number;
}

function TableView({ data, columns, initialWidth }: DynamicTableProps) {
  const columnWidths = useSignal<Record<string, number>>({});
  const [initColumns] = useState(columns.length);
  const [initWidth, setInitWidth] = useState(initialWidth);

  useEffect(() => {
    const currentWidths = columnWidths.peek();
    let needsUpdate = false;
    const newWidths = { ...currentWidths };
    const defaultWidth = (initialWidth ?? globalThis.innerWidth) / initColumns;
    // Check for new columns to add
    for (const col of columns) {
      if (newWidths[col] !== undefined && initialWidth === initWidth) continue;
      newWidths[col] = defaultWidth;
      needsUpdate = true;
    }

    // Check for old columns to remove
    const currentColsInState = Object.keys(newWidths);
    for (const col of currentColsInState) {
      if (!columns.includes(col)) {
        delete newWidths[col];
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      columnWidths.value = newWidths;
    }
    setInitWidth(initialWidth);
  }, [columns, initialWidth]);

  const handleResize = (column: string, newWidth: number) => {
    columnWidths.value = {
      ...columnWidths.value,
      [column]: newWidth,
    };
  };

  const totalWidth = Object.values(columnWidths.value).reduce(
    (sum, width) => sum + width,
    0,
  );

  return (
    // <div class="overflow-auto">
    <table
      style={{ width: `${totalWidth}px` }}
      class="table w-auto bg-base-100 table-bordered table-fixed border-separate border-spacing-0"
    >
      <thead>
        <tr>
          {columns.map((col) => (
            <ResizableHeader
              key={col}
              column={col}
              width={columnWidths.value[col]}
              onResize={handleResize}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {columns.map((col) => (
              <td
                key={col}
                style={{ width: `${columnWidths.value[col]}px` }}
                class="border border-base-300"
              >
                <div class="truncate" title={row[col]}>
                  {typeof row[col] === "boolean"
                    ? row[col].toString()
                    : row[col]}
                </div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    // </div>
  );
}

export function DynamicTable(
  { data, columns, initialWidth }: DynamicTableProps,
) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  if (!data || data.length === 0) {
    return <p>No data to display.</p>;
  }

  if (isMobile.value) {
    return <CardView data={data} columns={columns} />;
  }

  return (
    <TableView
      data={data}
      columns={columns}
      initialWidth={initialWidth}
    />
  );
}
