import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const GITHUB_PAGES_BASE = "/CosmicBeatmaker/";

export default defineConfig(({ command, isPreview }) => ({
  // Development stays at `/`; every production build is ready for the
  // repository-scoped GitHub Pages URL without relying on a CI-only flag.
  base: command === "build" || isPreview ? GITHUB_PAGES_BASE : "/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
}));
