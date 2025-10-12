import { useEffect, useRef } from "preact/hooks";
import * as Plot from "@observablehq/plot";

interface DataPoint {
  date: Date;
  value: number;
}

interface ChartProps {
  data: DataPoint[];
  color?: string;
  width?: number;
  height?: number;
}

export default function ErrorsChart(
  { data, color, width = 1000, height = 120 }: ChartProps,
) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // Clear the placeholder before rendering the chart
      containerRef.current.innerHTML = "";
      const plot = Plot.plot({
        height: height,
        width: width,
        y: { grid: true, label: "Errors" },
        marks: [
          Plot.ruleY([0]),
          Plot.rectY(data, {
            x: "date",
            y: "value",
            fill: color ?? "var(--color-error)",
            interval: "day",
          }),
        ],
      });
      containerRef.current.append(plot);
      return () => plot.remove();
    }
  }, [data]);

  // Render a skeleton placeholder on the server and before the island hydrates
  return (
    <div class="chart w-full h-full p-3" ref={containerRef}>
      <div class="skeleton w-full h-full"></div>
    </div>
  );
}
