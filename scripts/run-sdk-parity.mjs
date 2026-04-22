import { spawn } from "node:child_process";

const child = spawn(
  "pnpm",
  [
    "--filter",
    "@daftar/api",
    "run",
    "test:sdk-parity",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUN_SDK_PARITY: "true",
    },
    stdio: "inherit",
    shell: true,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
