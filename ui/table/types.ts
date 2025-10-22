import { type JSX, type RefObject } from "preact";
import { type Signal } from "@preact/signals";

export interface VirtualTableViewProps {
  data: any[];
  columns: string[];
  initialWidth?: number;
  columnExtensions?: (col: string) => JSX.Element;
  columnAction?: (col: string) => JSX.Element;
  onLoadMore?: () => void;
  loading?: boolean;
  rowHeight?: number;
  buffer?: number;
  scrollContainerRef?: RefObject<HTMLElement>;
  selectedRows?: Signal<any[]>;
  groupStates?: Signal<Record<string, boolean>>;
  rowIdentifier?: string;
  renderExpandedRow?: (row: any) => JSX.Element;
  expandedRows?: Signal<Record<string, boolean>>;
  tableAddon?: JSX.Element;
  cellFormatting?: Signal<Record<string, CellFormatting>>;
  onColumnDrop?: (draggedColumn: string, targetColumn: string) => void;
  formatColumnName?: (a: string) => string 
}

export enum FormattingType {
  Style = "style",
  Date = "date",
}

export enum ConditionOperator {
  Equals = "==",
  NotEquals = "!=",
  LessThan = "<",
  GreaterThan = ">",
  LessThanOrEqual = "<=",
  GreaterThanOrEqual = ">=",
}

export interface CellStyle {
  color?: string;
  backgroundColor?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
}

export interface StyleCondition {
  operator: ConditionOperator;
  value: any;
  style: CellStyle;
}

export interface DateFormatting {
  granularity: string;
  showAsSpan: boolean;
  locale?: string;
}

export interface NumberFormatting {
  locale?: string;
  style?: "decimal" | "currency" | "percent" | "unit";
  currency?: string;
  currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name";
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  unit?: string;
  unitDisplay?: "short" | "long" | "narrow";
}

export interface CellFormatting {
  type?: FormattingType;
  style?: {
    default: CellStyle;
    conditions: StyleCondition[];
  };
  date?: DateFormatting;
  number?: NumberFormatting;
  prefix?: string;
  suffix?: string;
}
