import EmptyState from "@/components/EmptyState.tsx";
import { EventSources, sources } from "./store.ts";
import { semiTransparentBg } from "@/shared/styles.ts";
import BugIcon from "lucide-react/dist/esm/icons/bug.js";

export const SourcesList = ({ data }: { data: EventSources }) => {
  const store = sources.use(data);

  return (
    store.value.length === 0
      ? (
        <EmptyState
          title="No event sources"
          message="Get started by creating a new event source."
          action={{ text: "Create New Source", href: "#create-new-source" }}
          docs={{ text: "View Docs", href: "/app/user-docs/sources.md" }}
        />
      )
      : (
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {store.value.map((source: any) => (
            <div
              key={source.id}
              class="card bg-base-100 shadow-xl"
              style={semiTransparentBg}
            >
              <div class="card-body">
                <h2 class="card-title">{source.name}</h2>
                <p>{source.description}</p>
                <div class="card-actions justify-end">
                  <a
                    href={`/app/sources/${source.id}`}
                    class="btn btn-sm btn-dash"
                  >
                    <BugIcon />
                    View Source & Data
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )
  );
};
