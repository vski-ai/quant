import { define } from "@/root.ts";
import quant from "@/db/quant.ts";
import { isAdmin, isAdminOn } from "@/db/rbac.ts";
import { GetApiEventSourcesResponse } from "@/root/http/client.ts";

import AdminToggle from "@/components/AdminToggle.tsx";
import Modal from "@/islands/Modal.tsx";

import BookTextIcon from "lucide-react/dist/esm/icons/book-text.js";
import { AddSourceForm } from "@/islands/sources/AddSourceForm.tsx";
import { SourcesList } from "@/islands/sources/SourcesList.tsx";

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
    const { user } = ctx.state;
    if (!user) {
      return Response.json({ message: "Unauthorized" }, { status: 401 });
    }
    const { data: source, error } = await quant.postApiEventSources({
      body: {
        name,
        description,
        owners: [user._id.toString()],
      },
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
            <AddSourceForm data={sources} />
          </Modal>
        </div>
      </div>
      <SourcesList data={sources} />
    </div>
  );
});
