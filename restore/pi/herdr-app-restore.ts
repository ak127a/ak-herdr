// Resume the pi conversation when herdr-core replaces a lost terminal with a
// fresh shell (reboot, core crash, or `hc server stop`).
//
// herdr-core keeps terminals across restarts but only re-runs their shell, never
// their original program. This extension writes a small marker per herdr
// terminal while a pi session is running there. A clean pi exit removes the
// marker; a host shutdown, core crash, or `hc server stop` keeps it. The shell
// hook in ~/.bashrc (sourced from ~/.config/herdr-app/restore/shell-hook.sh)
// reads the marker and reopens the session with `pi --session <file>`.
//
// Marker: <XDG_STATE_HOME>/herdr-app/agent-restore/<session>/<terminal-id>
// Line 1: pi:<session-file-path>, line 2: written-at ISO time, line 3: cwd.

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const STALE_MS = 30 * 24 * 60 * 60 * 1000;

const stateHome =
  process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
// HC_SESSION separates named herdr-core sessions (and test sessions) so their
// terminal addresses (t1, t2, ...) cannot collide.
const sessionName = (process.env.HC_SESSION || "default").replace(
  /[^A-Za-z0-9_.-]/g,
  "_",
);
const markerDir = path.join(stateHome, "herdr-app", "agent-restore", sessionName);
const terminalId = process.env.HC_TERMINAL_ID;

// A hangup or termination means the terminal is going away (host shutdown,
// core stop, closed pane). Keep the marker even if the host-shutdown flag is
// not visible yet. Ctrl+C (a normal pi quit) does not set this.
// prependListener matters: pi installs its own SIGHUP/SIGTERM handlers for a
// graceful shutdown before extensions load, so a plain process.on() would run
// only after the session has already started shutting down.
let receivedShutdownSignal = false;
for (const signal of ["SIGHUP", "SIGTERM"] as const) {
  process.prependListener(signal, () => {
    receivedShutdownSignal = true;
  });
}

function markerFile(): string | undefined {
  // Only inside a herdr-core terminal; keep the name filesystem-safe.
  if (!terminalId || !/^[A-Za-z0-9_-]+$/.test(terminalId)) return undefined;
  return path.join(markerDir, terminalId);
}

function pruneOldMarkers(): void {
  let names: string[];
  try {
    names = fs.readdirSync(markerDir);
  } catch {
    return;
  }
  const cutoff = Date.now() - STALE_MS;
  for (const name of names) {
    try {
      const file = path.join(markerDir, name);
      if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
    } catch {
      // ignore
    }
  }
}

// systemd-user-sessions.service creates /run/nologin before shutdown, and the
// next boot removes it. That is the reliable "host is going down" signal.
// (/run/systemd/shutdown is a directory, so only the file inside it counts.)
function hostIsShuttingDown(): boolean {
  return fs.existsSync("/run/nologin");
}

// `hc server stop` (and a core crash) kills holders before/while the terminal
// dies, so the core socket cannot answer. A normal pi quit can.
function coreIsReachable(timeoutMs = 300): Promise<boolean> {
  const socketPath = process.env.HC_TERMINAL_SOCKET;
  if (!socketPath || process.platform === "win32") return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(reachable);
    };
    const socket = net.createConnection(socketPath);
    socket.on("connect", () => finish(true));
    socket.on("error", () => finish(false));
    const timer = setTimeout(() => finish(true), timeoutMs);
    timer.unref?.();
  });
}

function writeMarker(ctx: ExtensionContext): void {
  const file = markerFile();
  if (!file) return;
  const sessionPath = ctx.sessionManager?.getSessionFile?.();
  if (typeof sessionPath !== "string" || sessionPath.length === 0) return;
  // pi creates the session file lazily, on the first message. A marker for a
  // file that does not exist yet cannot be resumed, so wait for the first turn.
  try {
    if (!fs.statSync(sessionPath).isFile()) return;
  } catch {
    return;
  }
  pruneOldMarkers();
  const tmp = path.join(markerDir, `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    fs.mkdirSync(markerDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      tmp,
      `pi:${sessionPath}\n${new Date().toISOString()}\n${ctx.cwd}\n`,
      { mode: 0o600 },
    );
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, file);
  } catch {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
  }
}

function removeMarker(): void {
  const file = markerFile();
  if (!file) return;
  try {
    const content = fs.readFileSync(file, "utf8");
    const line1 = content.split(/\r?\n/, 1)[0];
    if (line1.startsWith("pi:") || line1.startsWith("/")) {
      fs.unlinkSync(file);
    }
  } catch {
    // already gone
  }
}

export default function (pi: ExtensionAPI) {
  // Not inside herdr-core: nothing to do.
  if (!markerFile()) return;

  pi.on("session_start", async (_event, ctx) => {
    writeMarker(ctx);
  });

  // The session file is created with the first message; record on activity so
  // the marker appears as soon as there is a conversation to resume.
  pi.on("agent_start", async (_event, ctx) => {
    writeMarker(ctx);
  });
  pi.on("turn_end", async (_event, ctx) => {
    writeMarker(ctx);
  });

  pi.on("session_shutdown", async (event) => {
    // /reload keeps the same session: leave the marker in place.
    if (event.reason === "reload") return;
    // Host going down: the terminal will be recovered on next boot.
    if (receivedShutdownSignal || hostIsShuttingDown()) return;
    // Core gone (crash or `hc server stop`): the terminal will be recovered.
    if (!(await coreIsReachable())) return;
    // Ordinary quit/new/fork: the shell that follows must stay a shell.
    removeMarker();
  });
}
