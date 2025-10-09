export default ({
  input: [import.meta.dirname, "openapi.json"].join("/"),
  output: {
    path: [import.meta.dirname, "client"].join("/"),
    importFileExtension: ".ts",
  },
  plugins: [
    "@hey-api/client-fetch",
  ],
});
