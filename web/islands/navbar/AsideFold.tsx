import FoldHorizontal from "lucide-react/dist/esm/icons/fold-horizontal.js";
import UnfoldHorizontal from "lucide-react/dist/esm/icons/unfold-horizontal.js";
import { ui } from "@/shared/ui.ts";

export function AsideFold() {
  return (
    <a
      role="button"
      className="btn btn-ghost"
      onClick={() => {
        ui.dense.value = ui.dense.value === "1" ? "0" : "1";
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
