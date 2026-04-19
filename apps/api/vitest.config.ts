import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.spec.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1
  }
});
