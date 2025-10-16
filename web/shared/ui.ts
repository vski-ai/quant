import { effect, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";

const theme = signal((IS_BROWSER && document.body.dataset.theme) || "dark");
const dense = signal((IS_BROWSER && document.body.dataset.dense) || "0");
const aside = signal((IS_BROWSER && document.body.dataset.aside) || "1");

const getWindowSize = () => ({
  width: globalThis.innerWidth,
  height: globalThis.innerHeight,
});

const windowSize = signal(getWindowSize());

const updateUISettings = () => {
  fetch("/settings", {
    method: "GET",
    headers: {
      "ui-theme": theme.value,
      "ui-dense": dense.value,
      "ui-aside": aside.value,
      "ui-width": windowSize.value.width.toString(),
      "ui-height": windowSize.value.height.toString(),
    },
  });
};

if (IS_BROWSER) {
  effect(() => {
    document.body.dataset.theme = theme.value;
    document.body.dataset.dense = dense.value;
    document.body.dataset.aside = aside.value;
    updateUISettings();
  });
}

globalThis.addEventListener("resize", () => {
  windowSize.value = getWindowSize();
});

export const ui = {
  theme,
  dense,
  aside,
  windowSize,
};
