/**
 * Root dev launcher: starts the backend (FastAPI) first, waits until it is
 * healthy, then starts the frontend (Next.js). Ctrl+C stops both.
 *
 * Run with:  npm run dev   (from the repo root)
 *
 * Uses only Node built-ins so no extra dependencies are required. The backend
 * is launched with the project virtualenv Python when present, falling back to
 * the platform launcher (`py` on Windows, `python3` elsewhere).
 */
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const apiDir = path.join(root, "services", "api");

const API_PORT = process.env.API_PORT || "8000";
const HEALTH_URL = `http://127.0.0.1:${API_PORT}/health`;

const c = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};
const tag = c.cyan("[dev]");

function venvPython() {
  const p = isWin
    ? path.join(apiDir, ".venv", "Scripts", "python.exe")
    : path.join(apiDir, ".venv", "bin", "python");
  if (fs.existsSync(p)) return p;
  return isWin ? "py" : "python3";
}

const children = [];
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function waitForHealth(retries = 90) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const req = http.get(HEALTH_URL, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry(n);
      });
      req.on("error", () => retry(n));
      req.setTimeout(2000, () => {
        req.destroy();
        retry(n);
      });
    };
    const retry = (n) => {
      if (n <= 0) reject(new Error("backend did not become healthy in time"));
      else setTimeout(() => attempt(n - 1), 1000);
    };
    attempt(retries);
  });
}

// 1. Backend first.
const python = venvPython();
const venvDir = path.join(apiDir, ".venv");
console.log(`${tag} starting backend (FastAPI) on port ${API_PORT} using ${python}`);
const api = spawn(
  python,
  ["-m", "uvicorn", "app.main:app", "--reload", "--reload-dir", path.join(apiDir, "app"), "--reload-exclude", venvDir, "--port", API_PORT],
  { cwd: apiDir, stdio: "inherit", shell: false }
);
children.push(api);
api.on("exit", (code) => {
  // code 0 = clean shutdown (e.g. uvicorn reloader restarting) — ignore it.
  if (code !== 0 && code !== null) {
    console.error(c.red(`${tag} backend exited (${code}).`));
    shutdown(code);
  }
});

// 2. Frontend once the backend answers /health.
console.log(`${tag} waiting for ${HEALTH_URL} ...`);
waitForHealth()
  .then(() => {
    // Always wipe .next before starting — OneDrive corrupts symlinks inside it.
    const nextDir = path.join(root, "apps", "web", ".next");
    if (fs.existsSync(nextDir)) {
      fs.rmSync(nextDir, { recursive: true, force: true });
      console.log(c.dim(`${tag} cleared .next cache`));
    }
    console.log(c.green(`${tag} backend healthy - starting frontend (Next.js)`));
    // On Windows `corepack` resolves to corepack.cmd, which needs a shell. To
    // avoid the args+shell deprecation warning we pass a single command string
    // there; on POSIX we spawn argv directly without a shell.
    const web = isWin
      ? spawn("corepack pnpm --filter @datamind/web dev", {
          cwd: root,
          stdio: "inherit",
          shell: true,
        })
      : spawn("corepack", ["pnpm", "--filter", "@datamind/web", "dev"], {
          cwd: root,
          stdio: "inherit",
          shell: false,
        });
    children.push(web);
    web.on("exit", (code) => {
      console.error(c.red(`${tag} frontend exited (${code}).`));
      shutdown(code ?? 1);
    });
  })
  .catch((err) => {
    console.error(c.red(`${tag} ${err.message}`));
    shutdown(1);
  });
