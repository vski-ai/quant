import { type JSX } from "preact";
import { type Signal, useSignal } from "@preact/signals";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { useVariableVirtualizer } from "./useVariableVirtualizer.ts";
import { ResizableHeader } from "./ResizableHeader.tsx";
import { VirtualTableViewProps } from "./types.ts";

export function VirtualTableView(
  {
    data,
    columns,
    initialWidth,
    columnExtensions,
    onLoadMore,
    loading,
    rowHeight = 41,
    buffer = 5,
    scrollContainerRef,
    selectedRows,
    rowIdentifier,
    renderExpandedRow,
    expandedRows,
  }: VirtualTableViewProps,
) {
  const columnWidths = useSignal<Record<string, number>>({});
  const [initColumns] = useState(columns.length);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null); // For body table
  const headerContainerRef = useRef<HTMLDivElement>(null);
  const bodyContainerRef = useRef<HTMLDivElement>(null);

  const rowKey = useMemo(() => {
    if (rowIdentifier && columns.includes(rowIdentifier)) return rowIdentifier;
    if (columns.includes("id")) return "id";
    return columns[0];
  }, [columns, rowIdentifier]);
  const rowHeights = useMemo(() => {
    if (!expandedRows) return data.map(() => rowHeight);
    return data.map((row) => {
      const isExpanded = expandedRows.value[row[rowKey]];
      // TODO: Replace 100 with a dynamic height calculation
      return isExpanded ? rowHeight + 100 : rowHeight; // 100 is a placeholder for the expanded content height
    });
  }, [data, expandedRows, rowHeight, rowKey]);

  const { startIndex, endIndex, paddingTop, paddingBottom } =
    useVariableVirtualizer({
      scrollContainerRef,
      tableRef: tableRef as any,
      itemCount: data.length,
      rowHeights,
      buffer,
    });

  // Effect to sync horizontal scroll
  useEffect(() => {
    const bodyEl = bodyContainerRef.current;
    if (!bodyEl) return;

    const handleScroll = () => {
      if (headerContainerRef.current) {
        headerContainerRef.current.scrollLeft = bodyEl.scrollLeft;
      }
    };

    bodyEl.addEventListener("scroll", handleScroll);
    return () => bodyEl.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const currentWidths = columnWidths.peek();
    let needsUpdate = false;
    const newWidths = { ...currentWidths };
    const defaultWidth = (initialWidth ?? globalThis.innerWidth) /
      (initColumns || 1);
    for (const col of columns) {
      if (newWidths[col] !== undefined) continue;
      newWidths[col] = defaultWidth;
      needsUpdate = true;
    }

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
  }, [columns, initialWidth]);

  useEffect(() => {
    if (!onLoadMore) return;

    const loadMoreObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loading) {
          onLoadMore();
        }
      },
      { root: null, rootMargin: "0px", threshold: 1.0 },
    );

    if (loadMoreRef.current) {
      loadMoreObserver.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        loadMoreObserver.unobserve(loadMoreRef.current);
      }
    };
  }, [onLoadMore, loading]);

  const handleResize = (column: string, newWidth: number) => {
    columnWidths.value = {
      ...columnWidths.value,
      [column]: newWidth,
    };
  };

  const totalWidth = Object.values(columnWidths.value).reduce(
    (sum, width) => sum + width,
    0,
  ) + (selectedRows ? 50 : 0) + (renderExpandedRow ? 50 : 0);

  const tableStyle = {
    width: `${totalWidth}px`,
    ...columns.reduce((acc, col) => {
      const sanitizedCol = col.replace(/[^a-zA-Z0-9]/g, "_");
      acc[`--col-width-${sanitizedCol}`] = `${columnWidths.value[col]}px`;
      return acc;
    }, {} as Record<string, string>),
  };

  const visibleData = data.slice(startIndex, endIndex + 1);

  return (
    <div>
      <div
        ref={headerContainerRef}
        style={{ position: "sticky", top: 0, zIndex: 10, overflowX: "hidden" }}
      >
        <table
          style={tableStyle}
          class="table w-auto bg-base-100 table-bordered table-fixed border-separate border-spacing-0"
        >
          <thead>
            <tr>
              {renderExpandedRow && (
                <th class="border border-base-300" style={{ width: "50px" }}>
                </th>
              )}
              {selectedRows && (
                <th class="border border-base-300" style={{ width: "50px" }}>
                  <input
                    type="checkbox"
                    class="checkbox"
                    checked={selectedRows.value.length === data.length}
                    onChange={(e) => {
                      if ((e.target as HTMLInputElement).checked) {
                        selectedRows.value = data.map((row) =>
                          row[rowKey]
                        );
                      } else {
                        selectedRows.value = [];
                      }
                    }}
                  />
                </th>
              )}
              {columns.map((col) => (
                <ResizableHeader
                  key={col}
                  column={col}
                  width={columnWidths.value[col]}
                  onResize={handleResize}
                  extensions={columnExtensions}
                />
              ))}
            </tr>
          </thead>
        </table>
      </div>
      <div ref={bodyContainerRef} style={{ overflowX: "auto" }}>
        <table
          ref={tableRef}
          style={tableStyle}
          class="table w-auto bg-base-100 table-bordered table-fixed border-separate border-spacing-0 -mt-px"
        >
          <tbody>
            <tr style={{ height: `${paddingTop}px` }}>
              {renderExpandedRow && (
                <td style={{ width: "50px", height: 0, border: 0, padding: 0 }}>
                </td>
              )}
              {selectedRows && (
                <td style={{ width: "50px", height: 0, border: 0, padding: 0 }}>
                </td>
              )}
              {columns.map((col) => (
                <td
                  style={{
                    width: columnWidths.value[col],
                    height: 0,
                    border: 0,
                    padding: 0,
                  }}
                >
                </td>
              ))}
            </tr>
            {visibleData.map((row, i) => {
              const rowIndex = startIndex + i;
              const isSelected = selectedRows
                ? selectedRows.value.includes(row[rowKey])
                : false;
              const isExpanded = expandedRows
                ? expandedRows.value[row[rowKey]]
                : false;

              const rowContent = (
                <tr key={rowIndex} class={isSelected ? "bg-base-200" : ""}>
                  {renderExpandedRow && expandedRows && (
                    <td
                      class="border border-base-300 align-center text-center p-0"
                      style={{ width: "50px" }}
                    >
                      <button
                        type="button"
                        class="btn btn-ghost btn-md"
                        onClick={() => {
                          expandedRows.value = {
                            ...expandedRows.value,
                            [row[rowKey]]: !isExpanded,
                          };
                        }}
                      >
                        {isExpanded ? "[-]" : "[+]"}
                      </button>
                    </td>
                  )}
                  {selectedRows && (
                    <td
                      class="border border-base-300 align-center text-center p-0"
                      style={{ width: "50px" }}
                    >
                      <input
                        type="checkbox"
                        class="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const checked =
                            (e.target as HTMLInputElement).checked;
                          if (checked) {
                            selectedRows.value = [
                              ...selectedRows.value,
                              row[rowKey],
                            ];
                          } else {
                            selectedRows.value = selectedRows.value.filter((
                              id,
                            ) => id !== row[rowKey]);
                          }
                        }}
                      />
                    </td>
                  )}
                  {columns.map((col) => {
                    const sanitizedCol = col.replace(/[^a-zA-Z0-9]/g, "_");
                    return (
                      <td
                        key={col}
                        style={{
                          width: `var(--col-width-${sanitizedCol})`,
                          height: `${rowHeight}px`,
                        }}
                        class="border border-base-300"
                      >
                        <div class="truncate" title={row[col]}>
                          {typeof row[col] === "boolean"
                            ? row[col].toString()
                            : row[col]}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );

              if (isExpanded && renderExpandedRow) {
                return [
                  rowContent,
                  <tr key={`${rowIndex}-expanded`} class="transition-all">
                    <td
                      colSpan={columns.length + (selectedRows ? 1 : 0) +
                        (Boolean(renderExpandedRow) ? 1 : 0)}
                    >
                      {renderExpandedRow(row)}
                    </td>
                  </tr>,
                ];
              }
              return rowContent;
            })}
            <tr style={{ height: `${paddingBottom}px` }}>
              <td
                colSpan={columns.length + (selectedRows ? 1 : 0) +
                  (renderExpandedRow ? 1 : 0)}
                style={{ padding: 0, border: 0 }}
              >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {onLoadMore && (
        <div ref={loadMoreRef} class="h-20 flex justify-center items-center">
          <button
            type="button"
            class="btn btn-primary"
            onClick={onLoadMore}
            disabled={loading}
          >
            {loading ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
