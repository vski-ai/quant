import MenuIcon from "lucide-react/dist/esm/icons/menu.js";
import LogsIcon from "lucide-react/dist/esm/icons/logs.js";
import { updateSettings } from "./updateSettings.ts";

export function AsideSwitch() {
  return (
    <a
      role="button"
      className="btn btn-ghost"
      onClick={() => {
        document.body.dataset.aside = document.body.dataset.aside === "1"
          ? "0"
          : "1";
        updateSettings();
      }}
    >
      <LogsIcon
        className="hidden aside-open:block"
        style={{ width: "24px", height: "24px" }}
      />
      <MenuIcon
        className="block aside-open:hidden"
        style={{ width: "24px", height: "24px" }}
      />
    </a>
  );
}

export default AsideSwitch;
