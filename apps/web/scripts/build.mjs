import { rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const nextOutputDir = resolve(appDir, ".next");

rmSync(nextOutputDir, { recursive: true, force: true });

const child = spawn(process.execPath, [nextBin, "build"], {
  cwd: appDir,
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
