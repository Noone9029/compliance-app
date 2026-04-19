import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/dist/cli.mjs");
const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");

const child = spawn(process.execPath, [tsxCli, "src/main.ts"], {
  cwd: appDir,
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
