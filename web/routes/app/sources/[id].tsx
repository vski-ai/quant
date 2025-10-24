import { define } from "@/root.ts";
import quant from "@/db/quant.ts";
import { GetApiEventSourcesIdResponse } from "@/root/http/client.ts";
import LiveEventFeed from "@/islands/sources/LiveEventFeed.tsx";
import SourceSettings from "@/islands/sources/SourceSettings.tsx";

import Modal from "@/islands/Modal.tsx";

type EventSource = GetApiEventSourcesIdResponse;

export const handler = define.handlers({
  async GET({ params }) {
    const { data: source, error } = await quant.getApiEventSourcesId({
      path: {
        id: params.id,
      },
    });
    if (error) {
      // TODO: Render a proper not found page
      return new Response(error.error, { status: 404 });
    }
    return { data: { source } };
  },
});

export default define.page((props) => {
  const { source } = props.data as { source: EventSource };
  return (
    <div class="dashboard-page">
      <div class="flex justify-between items-center mb-4">
        <h1 class="text-2xl font-bold">{source.name}</h1>
        <Modal
          id="source-settings"
          title="Settings"
          trigger="Settings"
          triggerClass="btn"
        >
          <SourceSettings source={source} />
        </Modal>
      </div>
      <p class="mb-12">{source.description}</p>

      <div class="space-y-8">
        <div>
          <div class="space-y-2">
            <p>
              <span class="font-bold">Source ID:</span>
              <code class="border border-dashed p-1 ml-2 rounded">
                {source.id}
              </code>
            </p>
            {/* Code snippets will go here */}
          </div>
        </div>

        <div class="divider"></div>
        <LiveEventFeed sourceId={source.id} />
      </div>
    </div>
  );
});
