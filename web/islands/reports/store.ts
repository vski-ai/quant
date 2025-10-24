import { createSharedSignal } from "@/shared/createSharedSignal.ts";
import { GetApiReportsResponse } from "@/root/http/client.ts";

export type Reports = GetApiReportsResponse;

export const reports = createSharedSignal<Reports>();
export const isRealtime = createSharedSignal<boolean>();
