import { useSignal } from "@preact/signals";
import { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";

interface ModalDialogProps {
  id?: string;
  title: string;
  trigger?: ComponentChildren;
  triggerClass?: string;
  children: ComponentChildren;
  actions?: ComponentChildren;
  onClose?: () => void;
}

export default function ModalDialog(
  {
    id,
    title,
    children,
    actions,
    onClose,
    trigger = "Open",
    triggerClass,
  }: ModalDialogProps,
) {
  const show = useSignal(false);

  useEffect(() => {
    if (!id) return;

    const onHashChange = () => {
      if (globalThis.location.hash === `#${id}`) {
        show.value = true;
      } else {
        show.value = false;
      }
    };

    globalThis.addEventListener("hashchange", onHashChange);
    onHashChange();

    return () => {
      globalThis.removeEventListener("hashchange", onHashChange);
    };
  }, [id]);

  if (!show.value) {
    return (
      <a
        class={triggerClass ?? "btn btn-sm"}
        onClick={() => {
          if (id) {
            globalThis.location.hash = id;
          } else {
            show.value = true;
          }
        }}
      >
        {trigger}
      </a>
    );
  }

  const handleClose = () => {
    if (id) {
      globalThis.location.hash = "";
    } else {
      show.value = false;
    }
    onClose?.();
  };

  return (
    <>
      <a
        class={triggerClass ?? "btn btn-sm"}
        onClick={() => {
          if (id) {
            globalThis.location.hash = id;
          } else {
            show.value = true;
          }
        }}
      >
        {trigger}
      </a>
      <div class="modal modal-open">
        <div class="modal-box aside-open:ml-64 dense:aside-open:ml-12">
          <button
            onClick={handleClose}
            type="button"
            class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          >
            ✕
          </button>
          <h3 class="font-bold text-lg">
            {title}
          </h3>
          <p class="py-4">{children}</p>
          {actions
            ? (
              <div class="modal-action">
                {actions}
              </div>
            )
            : null}
        </div>
      </div>
    </>
  );
}
