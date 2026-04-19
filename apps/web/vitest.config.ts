import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["components/**/*.spec.tsx", "components/**/*.spec.ts"]
  }
});
