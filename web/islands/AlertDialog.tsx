import { alertActiveState, alertMessage } from "@/shared/alert.ts";
import AlertIcon from "lucide-react/dist/esm/icons/triangle-alert.js";

export function AlertDialog() {
  const show = alertActiveState.use(false);
  const message = alertMessage.use("");

  const handleClose = () => {
    show.value = false;
    message.value = "";
  };

  if (!show.value) {
    return null;
  }

  return (
    <div class="modal modal-open">
      <div class="modal-box">
        <div class="flex items-center gap-4 text-2xl">
          <AlertIcon
            style={{
              width: 42,
              height: 42,
              color: "var(--color-error)",
            }}
          />
          <p class="py-4">{message}</p>
        </div>
        <div class="modal-action">
          <a class="btn" onClick={handleClose}>Close</a>
        </div>
      </div>
    </div>
  );
}
