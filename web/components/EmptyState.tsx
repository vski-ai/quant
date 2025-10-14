import { FunctionComponent } from "preact";

interface EmptyStateProps {
  title: string;
  message: string;
  action?: {
    text: string;
    href: string;
  };
  docs?: {
    text: string;
    href: string;
  };
}

const EmptyState: FunctionComponent<EmptyStateProps> = (
  { title, message, action, docs },
) => {
  return (
    <div class="flex flex-col gap-3 justify-center items-center min-h-[calc(100vh/1.5)]">
      <svg
        class="mx-auto h-24 w-24 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          vector-effect="non-scaling-stroke"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
        />
      </svg>
      <h3 class="mt-2 text-sm font-semibold text-gray-900">{title}</h3>
      <p class="mt-1 text-sm text-gray-500">{message}</p>
      <div class="mt-6 flex justify-center gap-4">
        {action && (
          <a
            href={action.href}
            class="btn btn-dash"
          >
            {action.text}
          </a>
        )}
        {docs && (
          <a
            href={docs.href}
            class="btn btn-ghost"
          >
            {docs.text}
          </a>
        )}
      </div>
    </div>
  );
};

export default EmptyState;
