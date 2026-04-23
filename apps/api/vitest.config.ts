import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.spec.ts"],
    snapshotSerializers: ["./src/test/secret-redaction.snapshot-serializer.ts"],
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1
  }
});
