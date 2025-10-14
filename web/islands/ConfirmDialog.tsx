import { Signal } from "@preact/signals";

interface ConfirmDialogProps {
  show: Signal<boolean>;
  message: string;
  onConfirm: () => void;
}

export default function ConfirmDialog(
  { show, message, onConfirm }: ConfirmDialogProps,
) {
  if (!show.value) {
    return null;
  }

  const handleConfirm = () => {
    onConfirm();
    show.value = false;
  };

  const handleClose = () => {
    show.value = false;
  };

  return (
    <div class="modal modal-open">
      <div class="modal-box">
        <h3 class="font-bold text-lg">Confirmation</h3>
        <p class="py-4">{message}</p>
        <div class="modal-action">
          <a class="btn" onClick={handleClose}>Cancel</a>
          <a class="btn btn-error" onClick={handleConfirm}>Confirm</a>
        </div>
      </div>
    </div>
  );
}
