import { useSignal } from "@preact/signals";
import XIcon from "lucide-react/dist/esm/icons/x.js";
import CopyIcon from "lucide-react/dist/esm/icons/copy.js";

interface AddApiKeyProps {
  onClose: () => void;
}

export default function AddApiKey({ onClose }: AddApiKeyProps) {
  const addKeyState = useSignal<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const newKey = useSignal<string | null>(null);

  const handleCreateKey = async () => {
    addKeyState.value = "loading";
    await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate network delay

    if (Math.random() > 0.3) { // Simulate success
      const randomPart = crypto.randomUUID().replaceAll("-", "");
      newKey.value = `sk_live_${randomPart}`;
      addKeyState.value = "success";
    } else { // Simulate error
      addKeyState.value = "error";
    }
  };

  const copyKey = () => {
    if (newKey.value) {
      navigator.clipboard.writeText(newKey.value);
      // Optional: show a "copied" message
    }
  };

  return (
    <div class="relative bg-base-200/50 rounded-box p-6 mb-6 border border-dashed border-base-content/20">
      <a
        class="btn btn-ghost btn-sm btn-square absolute top-2 right-2"
        onClick={onClose}
      >
        <XIcon />
      </a>

      {addKeyState.value === "idle" && (
        <div class="h-32 flex gap-2 flex-col items-center justify-center">
          <input class="input input-md w-64" placeholder="Key Name" required />
          <a class="btn btn-md btn-primary w-64" onClick={handleCreateKey}>
            Create New Key
          </a>
        </div>
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
            <button class="btn btn-primary" onClick={handleCreateKey}>
              Try Again
            </button>
          </div>
        </div>
      )}

      {addKeyState.value === "success" && newKey.value && (
        <div class="h-32 flex flex-col items-center justify-center gap-4">
          <div class="join">
            <input
              type="text"
              readOnly
              class="input input-bordered join-item font-mono w-96"
              value={newKey.value}
            />
            <button class="btn join-item" onClick={copyKey}>
              <CopyIcon style={{ width: "16px", height: "16px" }} />
              Copy
            </button>
          </div>
          <p class="text-sm text-warning">
            Make sure to copy this key. You won't be able to see it again!
          </p>
        </div>
      )}
    </div>
  );
}
