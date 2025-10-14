import { useEffect, useState } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { GetApiEventSourcesIdEventsResponse } from "@/quant/http/client.ts";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.js";

type Event = GetApiEventSourcesIdEventsResponse[200];

interface LiveEventFeedProps {
  sourceId: string;
}

export default function LiveEventFeed({ sourceId }: LiveEventFeedProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLive = useSignal(false);

  const fetchEvents = async () => {
    setIsLoading(true);
    const res = await fetch(`/app/api/sources/${sourceId}/events`);
    if (res.ok) {
      const data = await res.json();
      setEvents(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (isLive.value) {
      const interval = setInterval(fetchEvents, 2000);
      return () => clearInterval(interval);
    }
  }, [sourceId, isLive.value]);

  useEffect(() => {
    fetchEvents();
  }, [sourceId]);

  return (
    <div class="space-y-4">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl">
          Event feed
        </h1>
        <div class="flex items-center gap-4">
          <button
            type="button"
            class={`btn btn-ghost ${isLoading ? "loading" : ""}`}
            onClick={fetchEvents}
            disabled={isLoading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <div class="form-control">
            <label class="label cursor-pointer gap-2">
              <span class="label-text">Live</span>
              <input
                type="checkbox"
                class="toggle toggle-primary"
                checked={isLive}
                onChange={() => isLive.value = !isLive.value}
              />
            </label>
          </div>
        </div>
      </div>
      {events.map((event: any) => (
        <div key={event.uuid} class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <p>
              <span class="font-bold">UUID:</span> {event.uuid}
            </p>
            <p>
              <span class="font-bold">Timestamp:</span>{" "}
              {new Date(event.timestamp).toLocaleString()}
            </p>
            <div class="collapse bg-base-200">
              <input type="checkbox" />
              <div class="collapse-title text-xl font-medium">
                Payload
              </div>
              <div class="collapse-content">
                <pre class="bg-gray-900 text-white p-4 rounded-md overflow-x-auto">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ))}
      {events.length === 0 && (
        <div class="text-center text-gray-500">
          No events received yet. Waiting for new events...
        </div>
      )}
    </div>
  );
}
