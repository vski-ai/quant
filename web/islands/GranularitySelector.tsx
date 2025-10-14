import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

const GRANULARITIES = [
  { value: "second", label: "1sec. span" },
  { value: "minute", label: "1min. span" },
  { value: "5minute", label: "5min. span" },
  { value: "10minute", label: "10min. span" },
  { value: "15minute", label: "15min. span" },
  { value: "30minute", label: "30min. span" },
  { value: "hour", label: "1h span" },
  { value: "2hour", label: "2h span" },
  { value: "4hour", label: "4h span" },
  { value: "6hour", label: "6h span" },
  { value: "12hour", label: "12h span" },
  { value: "day", label: "1d span" },
  { value: "3day", label: "3d span" },
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

    const initialGranularity = urlGranularity || granularity;
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
      class="select select-sm select-bordered w-32"
      value={granularity}
      onChange={handleChange}
    >
      {GRANULARITIES.sort((a, _b) => a.value === granularity ? -1 : 1).map((
        g,
      ) => <option key={g.value} value={g.value}>{g.label}</option>)}
    </select>
  );
}
