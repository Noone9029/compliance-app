import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const workspaceRoot = resolve(import.meta.dirname, "..");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((accumulator, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return accumulator;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        return accumulator;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      accumulator[key] = value;
      return accumulator;
    }, {});
}

// Env loading order (later entries override earlier ones).
// process.env always wins — see spawn env below.
const envFromFiles = {
  ...parseEnvFile(resolve(workspaceRoot, ".env")),
  ...parseEnvFile(resolve(workspaceRoot, ".env.local")),
  ...parseEnvFile(resolve(workspaceRoot, "apps/api/.env")),
  ...parseEnvFile(resolve(workspaceRoot, "apps/api/.env.local")),
};

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Missing command.");
  process.exit(1);
}

const child = spawn(command, args, {
  cwd: workspaceRoot,
  env: {
    ...process.env,
    ...envFromFiles
  },
  stdio: "inherit",
  shell: true
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
