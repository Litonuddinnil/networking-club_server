/**
 * Frees the dev port before `npm run dev`, on any OS.
 *
 * Replaces the old `powershell -File ./free-port-5000.ps1` pre-hook, which had
 * three problems:
 *
 *   1. It ran on every `npm start` too, so the Render deploy died with
 *      `sh: 1: powershell: not found` and exit status 127 — npm aborts the
 *      whole script when a pre-hook fails.
 *   2. It killed EVERY `node` process on the machine, not just the one holding
 *      the port — including the client dev server, unrelated projects, and the
 *      wrapper invoking it.
 *   3. It ended by running `nodemon index.ts`, so the "free the port" step
 *      started a second server on the port it had just cleared.
 *
 * This version only kills the process actually listening on the port, never
 * touches itself or its parent, and never starts anything. It always exits 0:
 * failing to free a port is a warning, not a reason to block the server.
 */
import { execFileSync } from "node:child_process";

const PORT = Number(process.env.PORT) || 5000;
const isWindows = process.platform === "win32";

/** PIDs listening on `port`, or [] if none / the lookup tool is unavailable. */
function listenersOn(port) {
  try {
    if (isWindows) {
      const out = execFileSync("netstat", ["-ano", "-p", "TCP"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const rows = out
        .split(/\r?\n/)
        .filter((line) => /LISTENING/i.test(line))
        // Match the local-address column ending in :<port>, so :15000 and
        // a remote address that happens to contain the digits don't match.
        .filter((line) => new RegExp(`[:.]${port}\\b`).test(line.trim().split(/\s+/)[1] ?? ""));
      return [...new Set(rows.map((line) => line.trim().split(/\s+/).pop()))].filter(
        (pid) => pid && /^\d+$/.test(pid) && pid !== "0"
      );
    }

    const out = execFileSync("lsof", ["-t", `-i:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return [...new Set(out.split(/\s+/).filter(Boolean))];
  } catch {
    // Nothing bound, or netstat/lsof isn't installed (common in containers).
    return [];
  }
}

function kill(pid) {
  try {
    if (isWindows) {
      execFileSync("taskkill", ["/PID", pid, "/F", "/T"], { stdio: "ignore" });
    } else {
      process.kill(Number(pid), "SIGKILL");
    }
    return true;
  } catch {
    return false;
  }
}

const own = new Set([String(process.pid), String(process.ppid)]);
const pids = listenersOn(PORT).filter((pid) => !own.has(pid));

if (pids.length === 0) {
  console.log(`[free-port] :${PORT} is free.`);
} else {
  for (const pid of pids) {
    console.log(
      kill(pid)
        ? `[free-port] freed :${PORT} (killed PID ${pid}).`
        : `[free-port] could not kill PID ${pid} on :${PORT} — start may fail.`
    );
  }
}

process.exit(0);
