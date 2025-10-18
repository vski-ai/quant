import { type JSX } from "preact";
import { useSignal } from "@preact/signals";
import { formatColumnName } from "../../shared/formatters.ts";

interface ResizableHeaderProps {
  column: string;
  width: number;
  extensions?: (col: string) => JSX.Element;
  onResize: (column: string, newWidth: number) => void;
}

export function ResizableHeader(
  { column, width, onResize, extensions }: ResizableHeaderProps,
) {
  const isResizing = useSignal(false);
  const startX = useSignal(0);
  const startWidth = useSignal(0);

  const formattedName = formatColumnName(column);

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    isResizing.value = true;
    startX.value = e.clientX;
    startWidth.value = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = startWidth.value + (moveEvent.clientX - startX.value);
      if (newWidth > 50) { // Minimum column width
        onResize(column, newWidth);
      }
    };

    const handleMouseUp = () => {
      isResizing.value = false;
      globalThis.removeEventListener("mousemove", handleMouseMove);
      globalThis.removeEventListener("mouseup", handleMouseUp);
    };

    globalThis.addEventListener("mousemove", handleMouseMove);
    globalThis.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <th
      style={{ width: `${width}px` }}
      class="sticky top-0 bg-base-200 z-10 shadow"
    >
      <div class="flex justify-between items-center">
        <div
          contentEditable
          class="truncate p-1 min-w-32"
          title={formattedName}
        >
          {formattedName}
        </div>
        <div>
          {extensions?.(column)}
        </div>
      </div>
      <div
        class="absolute -right-2 top-0 h-full w-4 cursor-col-resize select-none bg-transparent"
        onMouseDown={handleMouseDown}
      />
    </th>
  );
}
