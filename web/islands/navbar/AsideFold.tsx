import FoldHorizontal from "lucide-react/dist/esm/icons/fold-horizontal.js";
import UnfoldHorizontal from "lucide-react/dist/esm/icons/unfold-horizontal.js";
import { updateSettings } from "./updateSettings.ts";

export function AsideFold() {
  return (
    <a
      role="button"
      className="btn btn-ghost"
      onClick={() => {
        document.body.dataset.dense = document.body.dataset.dense === "1"
          ? "0"
          : "1";
        updateSettings();
      }}
    >
      <UnfoldHorizontal
        className="hidden dense:block"
        style={{ width: "24px", height: "24px" }}
      />
      <FoldHorizontal
        className="block dense:hidden"
        style={{ width: "24px", height: "24px" }}
      />
    </a>
  );
}

export default AsideFold;
