import ShieldIcon from "lucide-react/dist/esm/icons/shield.js";

export default (
  { isAdmin, adminOn }: { isAdmin: boolean; adminOn: boolean },
) => (
  isAdmin
    ? (
      <a
        class={["btn", adminOn && "btn-error"].filter(Boolean).join(
          " ",
        )}
        href={adminOn ? "?admin=0" : "?admin=1"}
      >
        <ShieldIcon />
      </a>
    )
    : null
);
