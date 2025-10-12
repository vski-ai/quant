import { useComputed, useSignal } from "@preact/signals";
import PlusIcon from "lucide-react/dist/esm/icons/plus.js";
import Trash2Icon from "lucide-react/dist/esm/icons/trash-2.js";
import AddApiKey from "./AddApiKey.tsx";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  status: "active" | "inactive" | string;
  created: string;
  usage: number;
}

interface ApiKeysTableProps {
  keys: ApiKey[];
}

// A simple similarity scoring function (0 to 1)
function similarity(s1: string, s2: string): number {
  let longer = s1;
  let shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  const longerLength = longer.length;
  if (longerLength === 0) {
    return 1.0;
  }
  return (longerLength - editDistance(longer, shorter)) / longerLength;
}

// Levenshtein distance implementation
function editDistance(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const matrix = Array.from(
    { length: b.length + 1 },
    () => Array(a.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // Deletion
        matrix[j - 1][i] + 1, // Insertion
        matrix[j - 1][i - 1] + cost, // Substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

export default function ApiKeysTable({ keys }: ApiKeysTableProps) {
  const searchQuery = useSignal("");
  const addApiKey = useSignal(false);

  const filteredKeys = useComputed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return keys;

    return keys
      .map((key) => ({
        ...key,
        score: similarity(key.name, query),
      }))
      .filter((key) => key.score > 0.2)
      .sort((a, b) => b.score - a.score);
  });

  return (
    <section class="relative card card-lg p-3 m-1 bg-base-100 min-h-[calc(100vh-400px)]">
      <div class="flex justify-between items-center mb-6">
        <input
          type="search"
          class="input border-0 shadow-none focus:input-accent"
          placeholder="Search by name..."
          value={searchQuery.value}
          onInput={(e) => searchQuery.value = e.currentTarget.value}
        />

        <div>
          <a
            class="btn"
            onClick={() => {
              addApiKey.value = true;
            }}
          >
            <PlusIcon style={{ width: "16px", height: "16px" }} />
            <span class="hidden md:inline">Add New Key</span>
          </a>
        </div>
      </div>
      {addApiKey.value
        ? <AddApiKey onClose={() => addApiKey.value = false} />
        : <></>}
      <div class="overflow-x-auto bg-base-100 rounded-box">
        <table class="table">
          {/* Table head remains the same */}
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Status</th>
              <th>Created</th>
              <th class="text-right">Usage (last 30d)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredKeys.value.map((apiKey) => (
              <tr key={apiKey.id} class="hover">
                <td class="font-medium">{apiKey.name}</td>
                <td>
                  <code class="font-mono">{apiKey.key}</code>
                </td>
                <td>
                  {apiKey.status === "active"
                    ? <span class="badge badge-success badge-sm">Active</span>
                    : (
                      <span class="badge badge-warning badge-sm">
                        Inactive
                      </span>
                    )}
                </td>
                <td>{new Date(apiKey.created).toLocaleDateString()}</td>
                <td class="text-right font-mono">
                  {apiKey.usage.toLocaleString()}
                </td>
                <td>
                  <div class="flex items-center justify-end gap-2">
                    <input
                      type="checkbox"
                      class="toggle toggle-sm toggle-success"
                      checked={apiKey.status === "active"}
                      aria-label={apiKey.status === "active"
                        ? "Deactivate key"
                        : "Activate key"}
                    />
                    <a
                      class="btn btn-ghost btn-xs btn-square"
                      aria-label="Delete key"
                    >
                      <Trash2Icon style={{ width: "16px", height: "16px" }} />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="text-sm text-base-content/60 mt-12 flex items-center justify-center">
        API keys provide access to your account. Keep them secure and do not
        share them publicly.
      </p>
    </section>
  );
}
