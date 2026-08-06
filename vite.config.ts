import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // Development server uses root path; production build uses GitHub Pages subpath.
  base: mode === "production" ? "/mls-trade-value/" : "/",
  build: { outDir: "dist" },
}));
