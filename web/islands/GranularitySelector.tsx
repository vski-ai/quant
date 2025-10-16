import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

const GRANULARITIES = [
  { value: "second", label: "By 1sec" },
  { value: "minute", label: "By 1min" },
  { value: "5minute", label: "By 5min" },
  { value: "10minute", label: "By 10min" },
  { value: "15minute", label: "By 15min" },
  { value: "30minute", label: "By 30min" },
  { value: "hour", label: "By 1h" },
  { value: "2hour", label: "By 2h" },
  { value: "4hour", label: "By 4h" },
  { value: "6hour", label: "By 6h" },
  { value: "12hour", label: "By 12h" },
  { value: "day", label: "By 1d" },
  { value: "3day", label: "By 3d" },
];

interface GranularitySelectorProps {
  granularity: string;
}

export default function GranularitySelector(
  { granularity }: GranularitySelectorProps,
) {
  const selectedGranularity = useSignal(granularity);

  useEffect(() => {
    const urlGranularity = new URL(globalThis.location.href).searchParams.get(
      "granularity",
    );

    const initialGranularity = granularity || urlGranularity || "hour";
    if (GRANULARITIES.some((p) => p.value === initialGranularity)) {
      selectedGranularity.value = initialGranularity;
    }
  }, [granularity]);

  const handleChange = (e: Event) => {
    const newGranularity = (e.target as HTMLSelectElement).value;
    selectedGranularity.value = newGranularity;
    const url = new URL(globalThis.location.href);
    url.searchParams.set("granularity", newGranularity);
    globalThis.location.href = url.toString();
  };

  return (
    <select
      class="select select-sm select-bordered w-24"
      value={granularity}
      onChange={handleChange}
    >
      {GRANULARITIES.sort((a, _b) => a.value === granularity ? -1 : 1).map((
        g,
      ) => <option key={g.value} value={g.value}>{g.label}</option>)}
    </select>
  );
}
