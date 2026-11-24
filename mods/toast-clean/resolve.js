// Resolves agent toast notifications so unnamed tabs show their live session
// name (e.g. OpenCode's "OC | <session>" title) instead of raw tab numbers.

export function cleanTitle(s) {
  return (s ?? "")
    .replace(/^(?:\[ [!.] \] |[✋⏳]\uFE0F?(?=\s)|(?!(?:\p{Emoji}\uFE0F|[#*]\u20E3))[^\p{L}\p{N}\p{Ps}\p{Pi}\p{Emoji_Presentation}])+/u, "")
    .replace(/^OC\s*\|\s*/i, "")
    .trim();
}

export function tellingTitle(lead) {
  if (!lead?.program?.agent) return null;
  const prog = lead.program?.name ?? "";
  const live = cleanTitle(lead.title);
  const path = /^[~/]|^[A-Za-z]:\\/.test((lead.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = Boolean(live)
    && live !== (lead.terminal ?? lead.address ?? "")
    && live !== prog
    && !path
    && !live.includes("@")
    && live.toLowerCase() !== (lead.program?.key ?? "");
  return telling ? live : null;
}

export function rootAddress(addr, allTerminals) {
  let cur = addr;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const term = allTerminals.find((t) => t.address === cur);
    if (!term?.parent) break;
    cur = term.parent;
  }
  return cur;
}

export function sessionLabel(tab, lead) {
  const prog = lead?.program?.name ?? lead?.mod ?? null;
  const live = tellingTitle(lead);
  if ((tab.name === prog || !tab.named) && live) return live;
  if (tab.named) return tab.name;
  if (lead?.name) return lead.name;
  if (prog) return tab.index != null ? `${prog} \u00b7 ${tab.index}` : prog;
  return tab.name || "Terminal";
}

// For Herdr's agent alerts (`action: { name: "agent.focus", args: { terminal } }`),
// replaces "<space> / <tab number>" with "<space> / <session name>".
export function resolveToastBody(props, { spaces = [], agents = [], panes = [], terminals = [] }) {
  if (props?.action?.name !== "agent.focus") return null;
  const addr = props?.action?.args?.terminal;
  if (typeof addr !== "string" || !addr) return null;

  const rootAddr = rootAddress(addr, terminals);
  const pane = panes.find((pn) => pn.terminal === addr)
    ?? panes.find((pn) => pn.terminal === rootAddr)
    ?? null;
  const agent = agents.find((a) => a.address === addr)
    ?? agents.find((a) => a.address === rootAddr)
    ?? null;
  const tabId = pane?.tab ?? agent?.tab ?? null;
  if (!tabId) return null;

  let space = null;
  let tab = null;
  for (const s of spaces) {
    const found = (s.tabs ?? []).find((tb) => tb.id === tabId);
    if (found) {
      space = s;
      tab = found;
      break;
    }
  }
  if (!space || !tab) return null;

  const lead = pane
    ?? (agent ? { terminal: agent.address, title: agent.title, name: agent.pane_name, program: agent.program } : null)
    ?? panes.find((pn) => pn.tab === tab.id && pn.program?.agent)
    ?? panes.find((pn) => pn.tab === tab.id)
    ?? null;

  const label = sessionLabel(tab, lead);
  const rawPlace = `${space.name} / ${tab.name}`;
  const body = props.body;

  if (!body || body === rawPlace) {
    return { kind: "place", space: space.name, tab: label };
  }
  if (typeof body === "string" && body.includes(rawPlace)) {
    return { kind: "text", text: body.replace(rawPlace, `${space.name} / ${label}`) };
  }
  return null;
}
