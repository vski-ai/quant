import { define } from "@/root.ts";
import quant from "@/db/quant.ts";
import { isAdmin, isAdminOn } from "@/db/rbac.ts";
import { GetApiEventSourcesResponse } from "@/quant/http/client/types.gen.ts";

import AdminToggle from "@/components/AdminToggle.tsx";
import EmptyState from "@/components/EmptyState.tsx";
import Modal from "@/islands/Modal.tsx";

import BookTextIcon from "lucide-react/dist/esm/icons/book-text.js";

type EventSource = GetApiEventSourcesResponse[200];

export const handler = define.handlers({
  async GET(ctx) {
    const { state } = ctx;
    const adminOn = isAdminOn(ctx);

    const { data: sources, error } = await quant.getApiEventSources({
      query: {
        owners: adminOn ? undefined : state.user?._id.toString(),
      },
    });
    if (error) {
      return new Response(error.error, { status: 400 });
    }
    return { data: { sources, adminOn, isAdmin: isAdmin(ctx) } };
  },

  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = form.get("name") as string;
    const description = form.get("description") as string;

    const { data: source, error } = await quant.postApiEventSources({
      body: { name, description },
    });

    if (error) {
      return new Response((error as any).error, { status: 400 });
    }

    return Response.json(source);
  },
});

export default define.page((props) => {
  const { sources, adminOn, isAdmin } = props.data as {
    sources: EventSource[];
    isAdmin: boolean;
    adminOn: boolean;
  };

  return (
    <div class="dashboard-page">
      <div class="flex justify-between items-center mb-4">
        <h1 class="text-2xl font-bold">Event Sources</h1>
        <div class="flex gap-2">
          <AdminToggle {...{ isAdmin, adminOn }} />
          <a class="btn" href="/app/user-docs/sources.md">
            <BookTextIcon />
          </a>
          <Modal
            id="create-new-source"
            title="Create New Event Source"
            triggerClass="btn btn-primary"
            trigger="Create New Source"
          >
            <form method="POST" class="space-y-4 max-w-lg">
              <div class="form-control">
                <input
                  autoComplete="off"
                  type="text"
                  name="name"
                  placeholder="My Awesome Source"
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
          </Modal>
        </div>
      </div>
      {sources.length === 0
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
            {sources.map((source) => (
              <div key={source.id} class="card bg-base-100 shadow-xl">
                <div class="card-body">
                  <h2 class="card-title">{source.name}</h2>
                  <p>{source.description}</p>
                  <div class="card-actions justify-end">
                    <a
                      href={`/app/sources/${source.id}`}
                      class="btn btn-sm btn-primary"
                    >
                      View
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
});
