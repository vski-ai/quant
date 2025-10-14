import { EventSources, sources } from "./store.ts";

export const AddSourceForm = ({ data }: { data: EventSources }) => {
  const store = sources.use(data);
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
          placeholder="Source name"
          class="input input-bordered w-full"
          required
        />
      </div>
      <div class="form-control">
        <textarea
          name="description"
          class="textarea textarea-bordered w-full"
          placeholder="An optional description for your source"
        >
        </textarea>
      </div>
      <div class="form-control mt-6">
        <button type="submit" class="btn btn-primary">
          Create Source
        </button>
      </div>
    </form>
  );
};
