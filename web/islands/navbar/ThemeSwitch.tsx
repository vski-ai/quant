import SunIcon from "lucide-react/dist/esm/icons/sun.js";
import MoonIcon from "lucide-react/dist/esm/icons/moon.js";
import { ui } from "@/shared/ui.ts";

const LIGHT = "light";
const DARK = "dark";

export const ThemeSwitch = ({ theme }: { theme: string }) => {
  return (
    <label className="swap swap-rotate">
      <input
        onClick={() => {
          ui.theme.value = ui.theme.value !== DARK ? DARK : LIGHT;
        }}
        type="checkbox"
        defaultChecked={theme === LIGHT}
        className="theme-controller"
      />
      <SunIcon
        className="swap-off fill-current"
        style={{ width: "24px", height: "24px" }}
      />
      <MoonIcon
        className="swap-on fill-current"
        style={{ width: "24px", height: "24px" }}
      />
    </label>
  );
};

export default ThemeSwitch;
