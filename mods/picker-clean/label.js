// Tab/session label helpers for picker-clean: match tabs-clean and sidebar-tree
// so OpenCode (and other agent) session names show up instead of raw tab numbers.

// Drops a leading status glyph/spinner, Codex's "[ ! ] " / "[ . ] " mark, and
// OpenCode's "OC | " prefix while keeping brackets, quotes and non-status emoji.
export function cleanTitle(s) {
  return (s ?? "")
    .replace(/^(?:\[ [!.] \] |[✋⏳]\uFE0F?(?=\s)|(?!(?:\p{Emoji}\uFE0F|[#*]\u20E3))[^\p{L}\p{N}\p{Ps}\p{Pi}\p{Emoji_Presentation}])+/u, "")
    .replace(/^OC\s*\|\s*/i, "")
    .trim();
}

// First agent pane in the tab, else first focused pane, else first pane.
export function leadPane(tabPanes) {
  let lead = null;
  for (const p of tabPanes ?? []) {
    if (!p.terminal && !p.mod) continue;
    if (!lead || (!lead.program?.agent && (p.program?.agent || (!lead.focused && p.focused)))) {
      lead = p;
    }
  }
  return lead;
}

// Returns the live session title when it carries real meaning (not empty, not a
// path, not user@host, not the terminal address or program name itself).
export function tellingTitle(lead) {
  if (!lead?.program?.agent) return null;
  const prog = lead.program?.name ?? "";
  const live = cleanTitle(lead.title);
  // cleanTitle() would strip a path's leading ~ or /: test with only status glyphs gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((lead.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = Boolean(live)
    && live !== (lead.terminal ?? lead.address ?? "")
    && live !== prog
    && !path
    && !live.includes("@")
    && live.toLowerCase() !== (lead.program?.key ?? "");
  return telling ? live : null;
}

// A tab Herdr named (unnamed, or after its program) follows its agent's live
// session title; a name the person gave stays. Non-agent unnamed tabs show
// their pane name or running program instead of their tab number.
export function tabLabel(tab, lead) {
  const prog = lead?.program?.name ?? lead?.mod ?? null;
  const base = tab.named ? tab.name : (lead?.name || prog || tab.name || "Terminal");
  const live = tellingTitle(lead);
  return (tab.name === prog || !tab.named) && live ? live : base;
}

export function buildPickerRows({
  spaces = [],
  agents = [],
  panes = [],
  terminals = [],
  filter = "",
  showEarlier = false,
  machines = [],
}) {
  const f = (filter ?? "").toLowerCase();

  const panesByTab = new Map();
  for (const p of panes) {
    let list = panesByTab.get(p.tab);
    if (!list) {
      list = [];
      panesByTab.set(p.tab, list);
    }
    list.push(p);
  }

  const agentsByTab = new Map();
  for (const a of agents) {
    let list = agentsByTab.get(a.tab);
    if (!list) {
      list = [];
      agentsByTab.set(a.tab, list);
    }
    list.push(a);
  }

  const kidsByParent = new Map();
  for (const x of terminals) {
    if (x.state !== "live" || !x.parent) continue;
    let list = kidsByParent.get(x.parent);
    if (!list) {
      list = [];
      kidsByParent.set(x.parent, list);
    }
    list.push(x.address);
  }

  const teamOf = (addrs) => {
    let n = 0;
    const seen = new Set(addrs);
    const walk = (addr) => {
      for (const kid of kidsByParent.get(addr) ?? []) {
        if (seen.has(kid)) continue;
        seen.add(kid);
        n++;
        walk(kid);
      }
    };
    for (const addr of addrs) walk(addr);
    return n;
  };

  const groups = spaces.map((w) => {
    const items = (w.tabs ?? []).map((ctx) => {
      const mine = agentsByTab.get(ctx.id) ?? [];
      const tabPanes = panesByTab.get(ctx.id) ?? [];
      const lead = leadPane(tabPanes) ?? (mine[0] ? {
        terminal: mine[0].address,
        title: mine[0].title,
        name: mine[0].pane_name,
        program: mine[0].program,
      } : null);
      const baseName = tabLabel(ctx, lead);
      const titles = mine.map((a) => cleanTitle(a.title)).filter(Boolean);
      return { w, ctx, mine, baseName, titles, team: teamOf(mine.map((a) => a.address)) };
    });

    // Two tabs reading the same in one space (e.g. multiple bash or untitled
    // OpenCode tabs) get their tab number to tell them apart.
    const counts = new Map();
    for (const item of items) counts.set(item.baseName, (counts.get(item.baseName) ?? 0) + 1);
    for (const item of items) {
      item.name = counts.get(item.baseName) > 1 && item.ctx.index != null
        ? `${item.baseName} \u00b7 ${item.ctx.index}`
        : item.baseName;
    }

    const ctxs = items.filter((c) => !f || [
      w.name,
      c.name,
      c.ctx.name,
      ...c.mine.map((a) => a.program?.name ?? ""),
      ...c.titles,
    ].join(" ").toLowerCase().includes(f));
    return { w, ctxs };
  });

  const busy = groups.filter((p) => p.w.status && p.ctxs.length);
  const quiet = groups.filter((p) => !p.w.status && p.ctxs.length);
  busy.sort((a, b) => (b.w.status === "blocked") - (a.w.status === "blocked"));

  const out = [];
  const add = (p) => {
    out.push({ kind: "head", w: p.w });
    for (const c of p.ctxs) out.push({ kind: "ctx", ...c });
  };
  busy.forEach(add);
  if (quiet.length) {
    out.push({ kind: "earlier", count: quiet.length });
    if (showEarlier || f) quiet.forEach(add);
  }
  out.push({ kind: "new" });
  out.push({ kind: "space", machine: null });
  for (const m of machines) out.push({ kind: "space", machine: m });
  return out;
}
