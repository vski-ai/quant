import { useState } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { GetApiEventSourcesIdResponse } from "@/quant/http/client.ts";
import ConfirmDialog from "@/islands/ConfirmDialog.tsx";

type EventSource = GetApiEventSourcesIdResponse;

interface SourceSettingsProps {
  source: EventSource;
}

export default function SourceSettings({ source }: SourceSettingsProps) {
  const [name, setName] = useState(source.name);
  const [description, setDescription] = useState(source.description);
  const showConfirm = useSignal(false);

  const handleSave = async () => {
    const res = await fetch(`/app/api/sources/${source.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      alert(error);
    } else {
      globalThis.location.hash = "";
      globalThis.location.reload();
    }
  };

  const handleDelete = async () => {
    const res = await fetch(`/app/api/sources/${source.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const { error } = await res.json();
      alert(error);
    } else {
      globalThis.location.href = "/app/sources";
    }
  };

  return (
    <div class="space-y-4 max-w-lg">
      <div class="form-control flex flex-col">
        <label class="label">
          <span class="label-text">Source Name</span>
        </label>
        <input
          type="text"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
          class="input input-bordered w-full"
        />
      </div>
      <div class="form-control flex flex-col w-full">
        <label class="label">
          <span class="label-text">Description</span>
        </label>
        <textarea
          value={description}
          onInput={(e) => setDescription(e.currentTarget.value)}
          class="textarea textarea-bordered min-w-full"
        />
      </div>

      <div class="divider"></div>

      <div class="form-control flex justify-between">
        <a onClick={handleSave} class="btn btn-primary w-64">
          Save
        </a>
        <a onClick={() => showConfirm.value = true} class="btn btn-error w-32">
          Delete Source
        </a>
      </div>

      <ConfirmDialog
        show={showConfirm}
        onConfirm={handleDelete}
        message="Are you sure you want to delete this event source? All associated data will be permanently deleted. This action cannot be undone."
      />
    </div>
  );
}
