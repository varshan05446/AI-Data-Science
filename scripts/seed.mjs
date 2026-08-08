/**
 * Seed the database with a demo workspace, user, project and sample dataset.
 *
 * Run with:  npm run seed   (from the repo root)
 *
 * Uses the backend virtualenv Python when present (created by `npm run setup`),
 * falling back to the platform launcher.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const apiDir = path.join(root, "services", "api");

const venv = isWin
  ? path.join(apiDir, ".venv", "Scripts", "python.exe")
  : path.join(apiDir, ".venv", "bin", "python");
const python = fs.existsSync(venv) ? venv : isWin ? "py" : "python3";

const child = spawn(python, ["-m", "app.seed"], {
  cwd: apiDir,
  stdio: "inherit",
  shell: false,
});
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error(`\x1b[31m[seed]\x1b[0m ${err.message}`);
  process.exit(1);
});
