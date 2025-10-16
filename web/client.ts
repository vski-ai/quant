import "./assets/styles.css";
import { ui as _ } from "./shared/ui.ts";

import { Calendar } from "vanilla-calendar-pro";
import "vanilla-calendar-pro/styles/index.css";

declare global {
  var Calendar: Calendar;
  interface globalThis {
    Calendar: Calendar;
  }
}

// @ts-expect-error
globalThis.Calendar = Calendar;
