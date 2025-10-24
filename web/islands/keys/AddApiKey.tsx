import { useSignal } from "@preact/signals";
import XIcon from "lucide-react/dist/esm/icons/x.js";
import CheckCheckIcon from "lucide-react/dist/esm/icons/check-check.js";
import CopyIcon from "lucide-react/dist/esm/icons/copy.js";
import { ApiKey } from "@/root/http/auth/types.ts";

interface AddApiKeyProps {
  onClose: (key: ApiKey | null) => void;
}

export default function AddApiKey({ onClose }: AddApiKeyProps) {
  const addKeyState = useSignal<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const newKey = useSignal<string | null>(null);
  const name = useSignal("");
  const keyData = useSignal<ApiKey | null>(null);
  const copiedKey = useSignal(false);

  const handleCreateKey = async () => {
    if (!name.value) return;
    addKeyState.value = "loading";
    try {
      const response = await fetch("/app/api/keys", {
        method: "POST",
        body: JSON.stringify({ name: name.value }),
      });
      if (response.ok) {
        const data = await response.json();
        newKey.value = data.key;
        keyData.value = data;
        addKeyState.value = "success";
      } else {
        addKeyState.value = "error";
      }
    } catch (_error) {
      addKeyState.value = "error";
    }
  };

  const copyKey = () => {
    if (newKey.value) {
      navigator.clipboard.writeText(newKey.value);
      copiedKey.value = true;
    }
  };

  return (
    <div class="relative bg-base-200/50 rounded-box p-6 mb-6 border border-dashed border-base-content/20">
      <a
        class="btn btn-ghost btn-sm btn-square absolute top-2 right-2"
        onClick={() => onClose?.(keyData.value)}
      >
        <XIcon />
      </a>

      {addKeyState.value === "idle" && (
        <form class="h-32 flex gap-2 flex-col items-center justify-center">
          <input
            class="input input-md w-64"
            placeholder="New Key Name"
            required
            value={name.value}
            onInput={(e) => name.value = e.currentTarget.value}
          />
          <button
            type="submit"
            class="btn btn-md btn-primary w-64"
            onClick={handleCreateKey}
          >
            Create New Key
          </button>
        </form>
      )}

      {addKeyState.value === "loading" && (
        <div class="h-32 flex items-center justify-center">
          <div class="flex flex-col items-center gap-4">
            <span class="loading loading-spinner loading-lg"></span>
            <span>Creating key...</span>
          </div>
        </div>
      )}

      {addKeyState.value === "error" && (
        <div class="h-32 flex items-center justify-center">
          <div class="text-center">
            <p class="text-error mb-4">
              Could not create key. Please try again.
            </p>
            <a class="btn btn-primary" onClick={handleCreateKey}>
              Try Again
            </a>
          </div>
        </div>
      )}

      {addKeyState.value === "success" && newKey.value && (
        <div class="h-32 flex flex-col items-center justify-center gap-4">
          <div
            class="join"
            style={{
              color: copiedKey.value ? "var(--color-success)" : undefined,
            }}
          >
            <input
              type="text"
              readOnly
              class="input input-bordered join-item font-mono w-96"
              value={newKey.value}
            />
            <a
              class="btn join-item"
              onClick={copyKey}
              style={{
                color: copiedKey.value ? "var(--color-success)" : undefined,
              }}
            >
              {copiedKey.value
                ? (
                  <CheckCheckIcon
                    style={{ width: "16px", height: "16px" }}
                  />
                )
                : <CopyIcon style={{ width: "16px", height: "16px" }} />}
              Copy
            </a>
          </div>
          {copiedKey.value
            ? (
              <p class="text-sm text-success -ml-20">
                <b class="capitalize">{name.value}</b>{" "}
                api key is copied to the clipboard!
              </p>
            )
            : (
              <p class="text-sm text-warning">
                Make sure to copy this key. You won't be able to see it again!
              </p>
            )}
        </div>
      )}
    </div>
  );
}
