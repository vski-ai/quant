export function updateSettings() {
  fetch("/app/api/settings", {
    method: "GET",
    headers: {
      "ui-theme": document.body.dataset.theme || "dark",
      "ui-dense": document.body.dataset.dense || "1",
      "ui-aside": document.body.dataset.aside || "1",
    },
  });
}
