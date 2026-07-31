import { defineConfig } from "vite";

export default defineConfig({
  // Relative assets work both locally and from a future GitHub Pages subpath.
  base: "./",
  build: { outDir: "dist" },
});
