/**
 * One-time project setup (no seeding):
 *   1. Create the backend virtualenv (services/api/.venv) if missing.
 *   2. Install backend Python dependencies.
 *   3. Copy .env example files into place if they don't exist yet.
 *   4. Install frontend/workspace dependencies with pnpm.
 *
 * Run with:  npm run setup   (from the repo root)
 *
 * After this, `npm run dev` starts the backend then the frontend.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const apiDir = path.join(root, "services", "api");

const c = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};
const tag = c.cyan("[setup]");

// Spawn a command and resolve on exit code 0, reject otherwise.
function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    console.log(c.dim(`$ ${command} ${args.join(" ")}`));
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: opts.shell ?? false,
      cwd: opts.cwd ?? root,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with code ${code}`))
    );
  });
}

const venvPython = isWin
  ? path.join(apiDir, ".venv", "Scripts", "python.exe")
  : path.join(apiDir, ".venv", "bin", "python");

function copyEnv(fromRel, toRel) {
  const from = path.join(root, fromRel);
  const to = path.join(root, toRel);
  if (!fs.existsSync(from)) return;
  if (fs.existsSync(to)) {
    console.log(c.dim(`  ${toRel} already exists - skipping`));
    return;
  }
  fs.copyFileSync(from, to);
  console.log(c.green(`  created ${toRel}`));
}

async function main() {
  // 1. Backend virtualenv.
  if (fs.existsSync(venvPython)) {
    console.log(`${tag} backend venv already present`);
  } else {
    console.log(`${tag} creating backend venv...`);
    const launcher = isWin ? "py" : "python3";
    await run(launcher, ["-m", "venv", ".venv"], { cwd: apiDir });
  }

  // 2. Backend dependencies.
  console.log(`${tag} installing backend dependencies...`);
  await run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"], {
    cwd: apiDir,
  });
  await run(venvPython, ["-m", "pip", "install", "-r", "requirements.txt"], {
    cwd: apiDir,
  });

  // 3. Env files (only if missing; never overwrite).
  console.log(`${tag} ensuring .env files exist...`);
  copyEnv("services/api/.env.example", "services/api/.env");
  copyEnv("apps/web/.env.example", "apps/web/.env.local");

  // 4. Frontend / workspace dependencies. On Windows `corepack` resolves to
  // corepack.cmd (needs a shell); pass one command string there to avoid the
  // args+shell deprecation warning.
  console.log(`${tag} installing frontend dependencies (pnpm)...`);
  if (isWin) {
    await run("corepack pnpm install", [], { shell: true });
  } else {
    await run("corepack", ["pnpm", "install"], { shell: false });
  }

  console.log(c.green(`\n${tag} done. Start everything with:  npm run dev`));
  console.log(
    c.dim(
      "  Note: AUTH_SECRET must match in services/api/.env and apps/web/.env.local."
    )
  );
}

main().catch((err) => {
  console.error(c.red(`${tag} ${err.message}`));
  process.exit(1);
});
