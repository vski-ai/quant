import { Reports, reports } from "./store.ts";
import { GetApiEventSourcesResponse } from "@/quant/http/client.ts";

export const AddReportForm = (
  { data }: { data: { reports: Reports; sources: GetApiEventSourcesResponse } },
) => {
  const store = reports.use(data.reports);
  return (
    <form
      method="POST"
      class="space-y-4 max-w-lg"
      onSubmit={async (ev) => {
        ev.preventDefault();
        const body = new FormData(ev.target as HTMLFormElement);
        const res = await fetch(globalThis.location.href, {
          method: "POST",
          body,
        });
        if (res.ok) {
          globalThis.location.hash = "";
          store.value = [...store.value, await res.json()];
        }
      }}
    >
      <div class="form-control">
        <input
          autoComplete="off"
          type="text"
          name="name"
          placeholder="Report name"
          class="input input-bordered w-full"
          required
        />
      </div>
      <div class="form-control">
        <textarea
          name="description"
          class="textarea textarea-bordered w-full"
          placeholder="An optional description for your report"
        >
        </textarea>
      </div>
      <div class="form-control">
        <label class="label mb-3">
          <span class="label-text text-bold">Event Sources</span>
        </label>
        <div class="flex flex-col gap-1">
          {data.sources.map((source) => (
            <label class="label border border-primary cursor-pointer flex justify-between bg-base-200 p-2 rounded-md">
              <span class="label-text">{source.name}</span>
              <input
                type="checkbox"
                name="sources"
                value={source.id}
                class="checkbox checkbox-primary"
              />
            </label>
          ))}
        </div>
      </div>
      <div class="form-control mt-6">
        <button type="submit" class="btn w-full">
          Create Report
        </button>
      </div>
    </form>
  );
};
