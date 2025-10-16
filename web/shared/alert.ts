import { createSharedSignal } from "./createSharedSignal.ts";

export const alertActiveState = createSharedSignal<boolean>();
export const alertMessage = createSharedSignal<string>();

export const showAlert = (message: string) => {
  const msg = alertMessage.use(message);
  const isActive = alertActiveState.use(false);
  msg.value = message;
  isActive.value = true;
};
