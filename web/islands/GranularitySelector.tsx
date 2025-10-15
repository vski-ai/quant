import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

const GRANULARITIES = [
  { value: "second", label: "Each 1 sec" },
  { value: "minute", label: "Each 1 min" },
  { value: "5minute", label: "Each 5min" },
  { value: "10minute", label: "Each 10min" },
  { value: "15minute", label: "Each 15min" },
  { value: "30minute", label: "Each 30min" },
  { value: "hour", label: "Each 1h" },
  { value: "2hour", label: "Each 2h" },
  { value: "4hour", label: "Each 4h" },
  { value: "6hour", label: "Each 6h" },
  { value: "12hour", label: "Each 12h" },
  { value: "day", label: "Each 1d" },
  { value: "3day", label: "Each 3d" },
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
