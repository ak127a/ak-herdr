/**
 * Pure helpers for nested sub-agent rows in sidebar-tree.
 */

/**
 * Resolve status for a nested terminal: kept sub-agents keep their AgentInfo
 * status (including "done"), while unkept sub-agents map error->blocked and
 * done->idle.
 */
export function kidStatus(k, listed) {
  if (listed.has(k.address)) return listed.get(k.address);
  const s = k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
}

/**
 * Collect live sub-agents of `addr` depth-first with tree-line prefixes,
 * guarding against parent cycles via `seen`.
 */
export function collectTree(all, addr, lead = [], seen = new Set([addr])) {
  const kids = all.filter((k) => k.parent === addr && k.state === "live" && !seen.has(k.address));
  return kids.flatMap((k, i) => {
    const last = i === kids.length - 1;
    const nextSeen = new Set(seen);
    nextSeen.add(k.address);
    return [
      { t: k, lines: [...lead, last ? "└" : "├"] },
      ...collectTree(all, k.address, [...lead, last ? "" : "│"], nextSeen),
    ];
  });
}

/**
 * Resolve the Herdr command and arguments to run when clicking a terminal row.
 * Kept terminals (which have a pane or AgentInfo) focus their pane; unkept
 * sub-agents open in peek.
 */
export function resolveClickAction(addr, { agent = null, pane = null } = {}) {
  const paneId = agent?.pane ?? pane?.pane ?? null;
  if (paneId) return { command: "pane.focus", args: { pane: paneId } };
  if (agent) return { command: "pane.focus", args: { terminal: addr } };
  return { command: "terminal.peek", args: { terminal: addr } };
}
