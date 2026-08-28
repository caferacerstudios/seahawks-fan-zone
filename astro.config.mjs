// @ts-check
import { defineConfig } from "astro/config";
import { auditBuild } from "./scripts/performance-budget.mjs";

export default defineConfig({
  server: { port: 4322, host: true },
  integrations: [{
    name: "sfz-performance-budget",
    hooks: {
      "astro:build:done": async ({ dir }) => auditBuild(dir),
    },
  }],
});

