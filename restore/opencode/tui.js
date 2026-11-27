// Resume the OpenCode session when herdr-core replaces a lost terminal with a
// fresh shell (reboot, core crash, or `hc server stop`).
//
// Supports both OpenCode V2 (`setup(api)` / `api.ui.router.current()`) and
// V1 (`tui(api)` / `api.route.current`) plugin APIs.
//
// Marker: <XDG_STATE_HOME>/herdr-app/agent-restore/<session>/<terminal-id>
// Line 1: opencode:<session-id>, line 2: ISO time, line 3: cwd.

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const STALE_MS = 30 * 24 * 60 * 60 * 1000;
const TERMINAL_ID_RE = /^[A-Za-z0-9_-]+$/;
const SESSION_ID_RE = /^[A-Za-z0-9_.-]+$/;

let activeCleanup = null;

function getMarkerPaths() {
  const terminalId = process.env.HC_TERMINAL_ID;
  if (!terminalId || !TERMINAL_ID_RE.test(terminalId)) return null;
  const stateHome =
    process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  const sessionName = (process.env.HC_SESSION || "default").replace(
    /[^A-Za-z0-9_.-]/g,
    "_",
  );
  const markerDir = path.join(stateHome, "herdr-app", "agent-restore", sessionName);
  return {
    markerDir,
    markerFile: path.join(markerDir, terminalId),
  };
}

function pruneOldMarkers(markerDir) {
  let names;
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

function hostIsShuttingDown() {
  return fs.existsSync("/run/nologin");
}

function coreIsReachable(timeoutMs = 300) {
  const socketPath = process.env.HC_TERMINAL_SOCKET;
  if (!socketPath || process.platform === "win32") return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (reachable) => {
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

function writeMarker(markerDir, markerFile, sessionId, cwd) {
  pruneOldMarkers(markerDir);
  const tmp = path.join(markerDir, `.${path.basename(markerFile)}.${process.pid}.tmp`);
  try {
    fs.mkdirSync(markerDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      tmp,
      `opencode:${sessionId}\n${new Date().toISOString()}\n${cwd}\n`,
      { mode: 0o600 },
    );
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, markerFile);
  } catch {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
  }
}

function removeMarker(markerFile) {
  try {
    const content = fs.readFileSync(markerFile, "utf8");
    const line1 = content.split(/\r?\n/, 1)[0];
    if (line1.startsWith("opencode:")) {
      fs.unlinkSync(markerFile);
    }
  } catch {
    // already gone or unreadable
  }
}

function readRoute(api) {
  try {
    const r2 = api?.ui?.router?.current?.();
    if (r2 && typeof r2.type === "string") {
      if (
        r2.type === "session" &&
        typeof r2.sessionID === "string" &&
        r2.sessionID.length > 0 &&
        r2.sessionID !== "dummy"
      ) {
        return { kind: "session", sessionID: r2.sessionID };
      }
      if (r2.type === "home") return { kind: "home" };
      return null;
    }
  } catch {
    // fall through to V1 route
  }

  try {
    const r1 =
      typeof api?.route?.current === "function"
        ? api.route.current()
        : api?.route?.current;
    if (r1 && typeof r1.name === "string") {
      const sid = r1.params?.sessionID;
      if (
        r1.name === "session" &&
        typeof sid === "string" &&
        sid.length > 0 &&
        sid !== "dummy"
      ) {
        return { kind: "session", sessionID: sid };
      }
      if (r1.name === "home") return { kind: "home" };
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveRootSessionId(api, sessionID) {
  try {
    const v2Root = api?.data?.session?.root?.(sessionID);
    if (typeof v2Root === "string" && v2Root.length > 0) return v2Root;
  } catch {
    // fall through to V1 parent lookup
  }

  try {
    const getSession = api?.state?.session?.get;
    if (typeof getSession === "function") {
      let cur = sessionID;
      const seen = new Set();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const sess = getSession(cur);
        const parent = sess?.parentID || sess?.parentId || sess?.parent_id;
        if (typeof parent === "string" && parent.length > 0) {
          cur = parent;
        } else {
          break;
        }
      }
      if (cur) return cur;
    }
  } catch {
    // ignore
  }

  return sessionID;
}

async function setup(api) {
  if (activeCleanup) return activeCleanup;

  const paths = getMarkerPaths();
  if (!paths) return;

  const { markerDir, markerFile } = paths;
  let receivedShutdownSignal = false;
  const onShutdown = () => {
    receivedShutdownSignal = true;
  };
  for (const signal of ["SIGHUP", "SIGTERM"]) {
    process.prependListener(signal, onShutdown);
  }

  let lastSessionId = null;
  let lastCwd = null;

  const syncMarker = () => {
    const route = readRoute(api);
    if (route?.kind === "session") {
      const sid = resolveRootSessionId(api, route.sessionID);
      if (!sid || !SESSION_ID_RE.test(sid)) return;
      const cwd =
        api?.location?.directory || api?.state?.path?.directory || process.cwd();
      if (sid !== lastSessionId || cwd !== lastCwd) {
        lastSessionId = sid;
        lastCwd = cwd;
        writeMarker(markerDir, markerFile, sid, cwd);
      }
      return;
    }
    if (route?.kind === "home" && lastSessionId !== null) {
      lastSessionId = null;
      lastCwd = null;
      removeMarker(markerFile);
    }
  };

  syncMarker();

  const unsubs = [];
  for (const evt of [
    "session.created",
    "session.updated",
    "session.execution.started",
    "session.execution.succeeded",
  ]) {
    try {
      const unsub = api?.data?.on?.(evt, () => syncMarker());
      if (typeof unsub === "function") unsubs.push(unsub);
    } catch {
      // ignore unsupported V2 events
    }
  }

  for (const evt of ["session.created", "session.updated", "session.status"]) {
    try {
      const unsub = api?.event?.on?.(evt, () => syncMarker());
      if (typeof unsub === "function") unsubs.push(unsub);
    } catch {
      // ignore unsupported V1 events
    }
  }

  const timer = setInterval(syncMarker, 1000);
  timer.unref?.();

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    if (activeCleanup === cleanup) activeCleanup = null;
    clearInterval(timer);
    for (const unsub of unsubs) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    for (const signal of ["SIGHUP", "SIGTERM"]) {
      process.off(signal, onShutdown);
    }
    if (receivedShutdownSignal || hostIsShuttingDown()) return;
    if (!(await coreIsReachable())) return;
    removeMarker(markerFile);
  };

  activeCleanup = cleanup;

  try {
    api?.renderer?.once?.("destroy", () => {
      void cleanup();
    });
  } catch {
    // ignore
  }

  try {
    const disposeUnsub = api?.lifecycle?.onDispose?.(() => cleanup());
    if (typeof disposeUnsub === "function") unsubs.push(disposeUnsub);
  } catch {
    // ignore
  }

  return cleanup;
}

export default {
  id: "herdr-app-restore",
  setup,
  tui: setup,
};
