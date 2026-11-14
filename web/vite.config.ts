import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Relative base: the built `dist/` can sit in any static folder.
export default defineConfig({
  plugins: [preact()],
  base: "./",
});
