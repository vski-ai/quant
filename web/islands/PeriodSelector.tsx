import { useSignal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import CalendarIcon from "lucide-react/dist/esm/icons/calendar.js";

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

const CUSTOM_PERIOD_PREFIX = "custom:";

interface PeriodSelectorProps {
  period: string;
}

export default function PeriodSelector({ period }: PeriodSelectorProps) {
  const selectedPeriod = useSignal(period);
  const isDateRangeModalOpen = useSignal(false);
  const [customPeriods, setCustomPeriods] = useState<string[]>([]);
  const calendarRef = useRef(null);

  useEffect(() => {
    const storedPeriods = localStorage.getItem("customPeriods");
    if (storedPeriods) {
      setCustomPeriods(JSON.parse(storedPeriods));
    }

    const urlPeriod = new URL(globalThis.location.href).searchParams.get(
      "period",
    );
    const initialPeriod = urlPeriod || period;
    if (
      PERIODS.some((p) => p.value === initialPeriod) ||
      initialPeriod.startsWith(CUSTOM_PERIOD_PREFIX)
    ) {
      selectedPeriod.value = initialPeriod;
    }
  }, [period]);

  useEffect(() => {
    let start = new Date();
    let end = new Date();
    // @ts-ignore:
    const calendar = new Calendar(calendarRef.current!, {
      selectionDatesMode: "multiple-ranged",
      selectionTimeMode: 12,
      onClickDate(self: any) {
        const [a, b] = self.context.selectedDates;
        start = new Date(a);
        end = new Date(b ?? new Date());
      },
      onChangeTime(self: any) {
        const keeping = self.context.selectedKeeping;
        let hours = parseInt(self.context.selectedHours);
        hours = keeping === "AM" ? hours : 12 + hours;
        const minutes = parseInt(self.context.selectedMinutes);
        start?.setHours(hours);
        end?.setHours(hours);
        start?.setMinutes(minutes);
        end?.setMinutes(minutes);
      },
    });
    calendar.init();
    //return () => calendar.destroy()
  }, [calendarRef.current]);

  const handleApplyDateRange = (range: { start: Date; end: Date }) => {
    const newPeriod =
      `${CUSTOM_PERIOD_PREFIX}${range.start.toISOString()}_${range.end.toISOString()}`;
    selectedPeriod.value = newPeriod;

    const updatedCustomPeriods = [
      newPeriod,
      ...customPeriods.filter((p) => p !== newPeriod),
    ].slice(0, 3);
    setCustomPeriods(updatedCustomPeriods);
    localStorage.setItem("customPeriods", JSON.stringify(updatedCustomPeriods));

    updateUrl(newPeriod);
  };

  const updateUrl = (newPeriod: string) => {
    const url = new URL(globalThis.location.href);
    url.searchParams.set("period", newPeriod);
    globalThis.location.href = url.toString();
  };

  const handleChange = (e: Event) => {
    const newPeriod = (e.target as HTMLSelectElement).value;
    if (newPeriod === "custom") {
      isDateRangeModalOpen.value = true;
    } else {
      selectedPeriod.value = newPeriod;
      updateUrl(newPeriod);
    }
  };

  const formatCustomPeriod = (period: string) => {
    const [start, end] = period.replace(CUSTOM_PERIOD_PREFIX, "").split("_");
    const options = {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
    } as const;
    return `${new Date(start).toLocaleDateString(undefined, options)} - ${
      new Date(end).toLocaleDateString(undefined, options)
    }`;
  };

  const allPeriods = [...PERIODS];
  if (customPeriods.length > 0) {
    allPeriods.push(
      ...customPeriods.map((p) => ({ value: p, label: formatCustomPeriod(p) })),
    );
  }

  return (
    <>
      <div class="dropdown dropdown-start">
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          onClick={() => isDateRangeModalOpen.value = true}
        >
          <CalendarIcon size={16} />
        </button>
        <div class="dropdown-content menu">
          <div ref={calendarRef}></div>
          <div>
            <button
              type="button"
              class="btn btn-primary w-full -mt-3 z-100 relative"
            >
              apply
            </button>
          </div>
        </div>
      </div>
      <select
        class="select select-sm select-bordered w-48"
        value={selectedPeriod.value}
        onChange={handleChange}
      >
        {allPeriods.sort((a, _b) => a.value === period ? -1 : 1).map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
    </>
  );
}
