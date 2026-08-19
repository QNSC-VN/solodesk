import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
    env: {
      BACKEND_API_BASE_URL: process.env.BACKEND_API_BASE_URL ?? "http://localhost:3000/v1",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
