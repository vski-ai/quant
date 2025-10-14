// deno-lint-ignore-file
import { IS_BROWSER } from "fresh/runtime";
import { Signal, useSignal } from "@preact/signals";

export function createSharedSignal<T>() {
  let shared: Signal<T> | null = null;
  return {
    use(data: T): Signal<T> {
      if (!IS_BROWSER) {
        return useSignal<T>(data);
      }
      if (shared) {
        return shared;
      }
      shared = useSignal<T>(data);
      return shared;
    },
  };
}
