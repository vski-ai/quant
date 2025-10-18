import { type JSX } from "preact";
import { type Signal } from "@preact/signals";

export interface VirtualTableViewProps {
  data: any[];
  columns: string[];
  initialWidth?: number;
  columnExtensions?: (col: string) => JSX.Element;
  onLoadMore?: () => void;
  loading?: boolean;
  rowHeight?: number;
  buffer?: number;
  scrollContainerRef?: React.RefObject<HTMLElement>;
  selectedRows?: Signal<any[]>;
  rowIdentifier?: string;
  renderExpandedRow?: (row: any) => JSX.Element;
  expandedRows?: Signal<Record<string, boolean>>;
}
