// Spaces with their agents nested under them, in one list: the space and agent
// worked on most recently come first. A space row is its group's header; its
// agents hang under it with tree lines, sub-agents under their parent agent.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import {
  agents, terminals, focused, spaces, run, theme, shared, setShared,
  setAgentOrder, openOverlay, window, layout,
} from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it ("✦  Working", "⠋ - Thinking"), Codex's blinking "[ ! ] " / "[ . ] " mark, and
// OpenCode's "OC | " window-title prefix.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^OC\s*\|\s*/i, "").replace(/^\[ [!.] \] /, "").trim();

// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// What a stored color name looks like on an avatar.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

const RAIL_CELL = 32;

export default class SidebarTree extends View {
  init(_props, cx) {
    // Each agent's last state and when it changed (ms), kept across restarts.
    try { this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}"); } catch { this.changed = {}; }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
    try { this.folded = new Set(JSON.parse(localStorage.getItem("folded") ?? "[]")); } catch { this.folded = new Set(); }
    try { this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]"); } catch { this.pendingPins = []; }
    if (!Array.isArray(this.pendingPins)) this.pendingPins = [];
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    this.hovered = null;
    this.revealed = null;
    this.revealedAt = -1;
    this.activeAt = -1;
    this.scroll = ScrollHandle.new();
    cx.timer.every(30000, (cx) => cx.notify());
  }

  saveFolded() {
    localStorage.setItem("folded", JSON.stringify([...this.folded]));
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Pick a space. The list keeps its order: only the agents themselves move it.
  selectSpace(s) {
    run("space.select", { id: s.id });
  }

  // Pick an agent. Looking at one isn't the agent doing something, so no stamp.
  focusAgent(a) {
    run("pane.focus", { pane: a.pane });
  }

  spaceMenu(s) {
    openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } });
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, status, compact = false) {
    if (!status) return div().size(7).mx(3).flex_none();
    const color = t[status] ?? t.dim;
    if (status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    // Idle: a ring; done: a dot.
    if (status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(color);
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    const now = Date.now();
    const sp = spaces();
    const all = terminals();
    const list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    this.migratePins(all);
    this.track(list, now);

    const tabs = new Map(sp.flatMap((s) => s.tabs).map((tab) => [tab.id, tab]));
    const shown = focused()?.agent;

    // Which space you're looking at, for revealing its row; switching to or
    // clicking a space does not make it count as recently worked in.
    const activeId = sp.find((s) => s.active)?.id ?? null;

    // A kept sub-agent (one with a pane) is in agents() too: where a tree shows
    // it, it gets no row of its own, unless it's pinned.
    const nested = new Set(collapsed ? [] : list.flatMap((a) => this.tree(all, a.address).map((k) => k.t.address)));
    const pinned = list.filter((a) => a.pinned);
    const own = list.filter((a) => !a.pinned && !nested.has(a.address));

    const since = (a) => Math.max(this.changed[a.address]?.at ?? 0, tabs.get(a.tab)?.changed_at ?? 0);

    // A row reads as what the agent calls its work: a tab someone named, else a
    // telling terminal title, else the tab's name, else its program.
    const telling = (a) => {
      const tab = tabs.get(a.tab);
      const prog = a.program?.name ?? "";
      const live = clean(a.title);
      const path = /^[~/]|^[A-Za-z]:\\/.test((a.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
      return Boolean(live) && live !== (a.address ?? "") && live !== prog && !path && !live.includes("@")
        && live.toLowerCase() !== (a.program?.key ?? "") && !(tab?.named && tab.name === live) ? live : null;
    };
    const nameOf = (a) => {
      const tab = tabs.get(a.tab);
      const prog = a.program?.name ?? "";
      if (tab?.named && tab.name !== prog) return tab.name;
      const live = telling(a);
      if (live) return live;
      if (tab && !/^\d+$/.test(tab.name)) return tab.name;
      return prog || tab?.name || a.address;
    };
    const names = new Map([...pinned, ...own].map((a) => [a.address, nameOf(a)]));
    // Two rows reading the same in one space get their tab number to tell them apart.
    const counts = new Map();
    for (const a of own) {
      const k = `${a.space}\u0000${names.get(a.address)}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const a of own) if (counts.get(`${a.space}\u0000${names.get(a.address)}`) > 1) {
      names.set(a.address, `${names.get(a.address)} \u00b7 ${tabs.get(a.tab)?.index ?? ""}`);
    }

    // Agents of a space, newest first; pinned ones stay with their space too.
    const groups = new Map();
    for (const a of own) {
      const g = groups.get(a.space) ?? [];
      g.push(a);
      groups.set(a.space, g);
    }
    for (const g of groups.values()) g.sort((x, y) => since(y) - since(x) || y.seq - x.seq);

    // Spaces by their latest agent activity, then by their own order. Nothing else
    // moves them: switching spaces, picking an agent, browsing tabs doesn't.
    const ordered = sp.map((s) => {
      const mine = groups.get(s.id) ?? [];
      let at = 0;
      for (const a of list) if (a.space === s.id) at = Math.max(at, since(a));
      return { s, mine, at };
    }).sort((x, y) => y.at - x.at || x.s.index - y.s.index);

    setAgentOrder([...pinned.map((a) => a.address), ...ordered.flatMap((g) => g.mine.map((a) => a.address))]);

    // Stable colors for the space avatars, shared with the other mods.
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const ids = new Set(sp.map((p) => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = (c) => Object.values(kept).filter((v) => v === c).length;
      kept[p.id] = palette.reduce((best, c) => (uses(c) < uses(best) ? c : best));
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    const fillOf = (s) => {
      const color = kept[s.id] ?? "ansi6";
      return color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    };

    const avatar = (s) => div().size(18).flex_none().rounded(5).bg(fillOf(s))
      .flex().items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff")
      .child((s.name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase());

    const chevron = (open) => svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none();

    const foldSpace = (s, open) => div()
      .id(`fold-sp-${s.id}`)
      .w(11).h(18).flex_none().flex().items_center().justify_center()
      .text_color(t.dim).cursor_pointer()
      .hover((el) => el.text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        open ? this.folded.add(s.id) : this.folded.delete(s.id);
        this.saveFolded();
        cx.notify();
      })
      .child(chevron(open));

    const foldAgent = (a, open) => div()
      .id(`fold-ag-${a.address}`)
      .flex_none().flex().items_center().justify_center().rounded(4).p(1)
      .text_color(t.dim).cursor_pointer()
      .hover((el) => el.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        const key = `a:${a.address}`;
        open ? this.folded.add(key) : this.folded.delete(key);
        this.saveFolded();
        cx.notify();
      })
      .child(chevron(open));

    const pinButton = (a) => {
      const isPinned = a.pinned;
      return div()
        .id(`pin-${a.address}`)
        .flex_none().p(2).rounded(4).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
    };

    // The tree lines in front of a nested row: a bar for each open ancestor, a
    // corner at the row itself.
    const lineCell = (l) => div()
      .relative().w(11).h(26).flex_none()
      .when(l === "│" || l === "├", (el) => el.child(
        div().absolute().left(4).top(0).w(1).h(26).bg(t.input)))
      .when(l === "└", (el) => el.child(
        div().absolute().left(4).top(0).w(1).h(13).bg(t.input)))
      .when(l === "├" || l === "└", (el) => el.child(
        div().absolute().left(4).top(13).w(7).h(1).bg(t.input)));

    const spaceRow = ({ s, mine }) => {
      const status = s.status ?? null;
      const blocked = mine.some((a) => a.status === "blocked");
      const open = mine.length > 0 && (blocked || !this.folded.has(s.id));
      const branch = s.branch && !/^(main|master)$/i.test(s.branch) && s.branch.toLowerCase() !== s.name.toLowerCase() ? s.branch : null;
      return h_flex()
        .id(`sp-${s.id}`)
        .px(8).h(30).flex_none().rounded(8).gap(7).items_center().text_size(13.5)
        .when(s.active, (el) => el.bg(t.selected))
        .when(!s.active, (el) => el.hover((x) => x.bg(t.hover)))
        .on_click(() => this.selectSpace(s))
        .on_mouse_down("right", () => this.spaceMenu(s))
        .child(mine.length ? foldSpace(s, open) : div().w(11).flex_none())
        .child(avatar(s))
        .child(div().flex_1().min_w(0).truncate().text_color(s.active ? t.foreground : t.muted).child(s.name))
        .when(Boolean(s.machine), (el) => el.child(div().flex_none().text_size(10).text_color(t.dim).child(s.machine)))
        .when(Boolean(branch), (el) => el.child(div().flex_none().max_w(90).truncate().text_size(11).text_color(t.dim).child(branch)))
        .when(mine.length > 0, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(String(mine.length))))
        .when(Boolean(status) && status !== "idle", (el) => el.child(this.status(t, status, true)));
    };

    const railSpace = ({ s, mine }) => {
      const status = s.status ?? null;
      return h_flex()
        .id(`sp-${s.id}`)
        .relative().w(RAIL_CELL).h(26).flex_none().rounded(6).justify_center().items_center()
        .when(s.active, (el) => el.bg(t.selected))
        .when(!s.active, (el) => el.hover((x) => x.bg(t.hover)))
        .tooltip(s.name)
        .on_click(() => this.selectSpace(s))
        .on_mouse_down("right", () => this.spaceMenu(s))
        .child(div().text_size(13).text_color(s.active ? t.foreground : t.muted).child((s.name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase()))
        .when(Boolean(status) && status !== "idle", (el) => el.child(div().absolute().right(5).bottom(4).size(5).rounded(3).bg(t[status] ?? t.dim)));
    };

    // An agent under a space, or a sub-agent under its parent. `lines`: the tree
    // cells in front of it; `detail`: extra text (a pinned row names its space).
    const agentRow = (a, lines, detail = null) => {
      const pic = icon(a.program, 15, t.foreground);
      const on = a.address === shown;
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      const when = this.changed[a.address]?.at ?? tabs.get(a.tab)?.changed_at ?? 0;
      const idle = a.status === "idle" && !a.focused;
      const hasSubs = this.tree(all, a.address).length > 0;
      const subOpen = !this.folded.has(`a:${a.address}`);
      const indent = lines.length ? 30 + 11 * (lines.length - 1) : 12;
      return h_flex()
        .id(`ag-${a.address}`)
        .pl(indent).pr(8).h(26).flex_none().rounded(7).gap(0).items_center().text_size(12.5)
        .when(on, (el) => el.bg(t.raised))
        .hover((s) => s.bg(t.hover))
        .cursor_pointer()
        .on_hover((onHover, cx) => {
          if (onHover) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => (this.listed.has(a.address) ? this.focusAgent(a) : this.peek(a.address)))
        .children(lines.map(lineCell))
        .when(Boolean(pic), (el) => el.child(div().mr(8).child(pic)))
        .child(div().flex_1().min_w(0).truncate().text_color(idle ? t.muted : t.foreground)
          .child(names.get(a.address) ?? a.name ?? a.template ?? a.program?.name ?? a.address))
        .when(Boolean(detail), (el) => el.child(div().flex_none().pl(6).text_size(11).text_color(t.dim).child(detail)))
        .when(Boolean(machine), (el) => el.child(div().flex_none().pl(6).text_size(10).text_color(t.dim).child(machine)))
        .when(this.hovered === a.address, (el) => el.child(pinButton(a)))
        .when(this.hovered !== a.address && Boolean(when), (el) => el.child(div().flex_none().pl(6).text_size(11).text_color(t.dim).child(duration(now - when))))
        .when(hasSubs, (el) => el.child(foldAgent(a, subOpen)))
        .child(this.status(t, this.listed.has(a.address) ? a.status : kidStatus(a, this.listed), Boolean(lines.length > 1)));
    };

    const rows = [];
    let activeAt = -1;
    this.activeAt = -1;

    if (pinned.length) {
      if (collapsed) {
        // The rail has no room for names; a pinned block would only confuse it.
      } else {
        rows.push(div().id("pinned-head").h(22).px(12).flex_none().flex().items_center()
          .text_size(10.5).font_medium().text_color(t.dim).child("Pinned"));
        for (const a of pinned) rows.push(agentRow(a, [], a.space_name ?? null));
      }
    }

    for (const g of ordered) {
      if (g.s.active) activeAt = rows.length;
      if (collapsed) {
        rows.push(h_flex().flex_none().justify_center().child(railSpace(g)));
        continue;
      }
      rows.push(spaceRow(g));
      const blocked = g.mine.some((a) => a.status === "blocked");
      if (!g.mine.length || (this.folded.has(g.s.id) && !blocked)) continue;
      g.mine.forEach((a, i) => {
        const last = i === g.mine.length - 1;
        rows.push(agentRow(a, [last ? "└" : "├"]));
        if (this.folded.has(`a:${a.address}`)) return;
        for (const k of this.tree(all, a.address, [last ? "" : "│"])) rows.push(agentRow(k.t, k.lines));
      });
    }
    this.activeAt = activeAt;

    // Bring the active space into view when it, or its place in the list, changes;
    // a row already in view stays put.
    if (activeId !== this.revealed || this.activeAt !== this.revealedAt) {
      this.revealed = activeId;
      this.revealedAt = this.activeAt;
      if (this.activeAt >= 0) this.scroll.scroll_to_item(this.activeAt);
    }

    return v_flex()
      .size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex()
        .h(31).pl(16).pr(10).flex_none().items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(collapsed, (el) => el.pl(0).pr(0).justify_center())
        .when(!collapsed, (el) => el.child("Spaces"))
        .child(div()
          .id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6)
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new"))
          .child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .when(!collapsed && sp.length === 0, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No spaces yet. Use + to make one.")))
      .child(v_flex()
        .id("tree-list").flex_1().min_h(0).px(collapsed ? 0 : 6).pb(6)
        .overflow_y_scrollbar().mode("always").track_scroll(this.scroll)
        // A block above growing, or the window resizing, can push the active space out.
        .on_size_change((_size, cx) => {
          if (this.activeAt >= 0) this.scroll.scroll_to_item(this.activeAt);
          cx.notify();
        })
        .children(rows))
      .when(collapsed, (el) =>
        el.child(h_flex().h(28).items_center().justify_center()
          .child(div()
            .id("collapse").text_size(13).text_color(t.dim)
            .hover((s) => s.text_color(t.foreground))
            .on_click(toggleSidebar)
            .child("»"))));
  }
}
