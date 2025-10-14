import { createSharedSignal } from "@/shared/createSharedSignal.ts";
import { GetApiEventSourcesResponse } from "@/quant/http/client.ts";

export type EventSources = GetApiEventSourcesResponse;

export const sources = createSharedSignal<EventSources>();
