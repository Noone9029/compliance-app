import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const port = process.env.PORT ?? process.env.WEB_PORT ?? "3000";

function assertProductionWebEnv() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const required = ["APP_BASE_URL", "NEXT_PUBLIC_API_URL", "INTERNAL_API_URL"];
  const missing = required.filter((key) => {
    const value = process.env[key];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables for web startup: ${missing.join(", ")}.`,
    );
  }
}

assertProductionWebEnv();

const child = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", "0.0.0.0", "--port", String(port)],
  {
    cwd: appDir,
    env: {
      ...process.env,
      WEB_PORT: String(port)
    },
    stdio: "inherit"
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
