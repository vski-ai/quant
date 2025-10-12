import { ComponentChildren } from "preact";

interface Counters {
  value: string | number;
  label: string;
  class?: string;
}

interface StatsCardProps {
  title?: string;
  periodLabel?: string;
  periodCount?: number;
  children: ComponentChildren;
  counters?: Counters[];
}

export function StatsCard(
  { title, counters, periodLabel, children }: StatsCardProps,
) {
  return (
    <div class="card bg-base-100 shadow">
      <div class="card-body">
        <div class="flex justify-between items-center">
          <h2 class="card-title text-base font-medium">
            {counters?.map((c) => (
              <>
                <span class={["badge badge-md", c.class].join(" ")}>
                  {c.value} <small>{c.label}</small>
                </span>
              </>
            ))}
          </h2>
          {periodLabel &&
            <span class="text-sm text-base-content/60">{periodLabel}</span>}
        </div>
        <div class="h-32 -ml-4 -mr-2 -mb-4">{children}</div>
      </div>
    </div>
  );
}
