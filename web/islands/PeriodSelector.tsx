import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

const PERIODS = [
  { value: "1h", label: "Last hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "1d", label: "Last day" },
  { value: "3d", label: "Last 3 days" },
  { value: "7d", label: "Last 7 days" },
  { value: "15d", label: "Last 15 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const COOKIE_NAME = "q_period";

function getCookie(name: string): string | undefined {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift();
}

interface PeriodSelectorProps {
  period: string;
}

export default function PeriodSelector({ period }: PeriodSelectorProps) {
  const selectedPeriod = useSignal(period);

  // Set initial value from URL or cookie on mount
  useEffect(() => {
    const urlPeriod = new URL(globalThis.location.href).searchParams.get(
      "period",
    );
    const cookiePeriod = getCookie(COOKIE_NAME);
    const initialPeriod = urlPeriod || cookiePeriod || period;
    if (PERIODS.some((p) => p.value === initialPeriod)) {
      selectedPeriod.value = initialPeriod;
    }
  }, [period]);

  const handleChange = (e: Event) => {
    const newPeriod = (e.target as HTMLSelectElement).value;
    selectedPeriod.value = newPeriod;

    // Update URL and reload the page to fetch new data
    const url = new URL(globalThis.location.href);
    url.searchParams.set("period", newPeriod);
    globalThis.location.href = url.toString();
  };

  return (
    <select
      class="select select-sm select-bordered w-32"
      value={period}
      onChange={handleChange}
    >
      {PERIODS.sort((a, _b) => a.value === period ? -1 : 1).map((period) => (
        <option key={period.value} value={period.value}>{period.label}</option>
      ))}
    </select>
  );
}
