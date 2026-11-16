// Go to a space (prefix + q). Spaces only, no tabs: choosing one shows it and
// opens the tab that space was last on. Type to filter, ↑/↓ and Enter to go,
// Esc to leave. Last rows: a new space here or on each connected machine.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, spaces, run, hc, theme, settings, props, closeOverlay, shared, setShared } from "herdr";

const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// Space colors, kept by space id in shared "space.colors": a theme
// color name ("ansi6") or a picked #rrggbb. A space seen without one gets
// the theme color fewest spaces use, once; every mod does the same in the
// same order, so they agree, and adding or renaming spaces moves nothing.
const PROJECT_COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
function spaceColors() {
  const ids = new Set(spaces().map((p) => p.id));
  const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
  let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
  for (const p of spaces()) {
    if (kept[p.id] || p.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[p.id] = PROJECT_COLORS.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  return kept;
}
function spaceColor(t, p) {
  if (p.name === "~") return t.dim;
  const c = spaceColors()[p.id] ?? PROJECT_COLORS[0];
  return c.startsWith("#") ? c : (MARK[c] ?? t[c]);
}

const H = 32;

export default class SpacePicker extends View {
  init(_props, cx) {
    this.filter = "";
    this.at = null;
    this.scroll = 0;
    this.machines = [];
    this.input = InputState.new({ placeholder: "Go to a space…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = 0;
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.go(this.rows()[this.at], cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => m.state === "connected" && !m.temporary).map((m) => m.name);
      } catch {}
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  rows() {
    const f = this.filter.toLowerCase();
    const match = (s) =>
      !f || [s.name, s.machine ?? "", s.branch ?? "", s.folder ?? ""].join(" ").toLowerCase().includes(f);
    const out = spaces().filter(match).map((s) => ({ kind: "space", s }));
    out.push({ kind: "new", machine: null });
    for (const m of this.machines) out.push({ kind: "new", machine: m });
    return out;
  }

  go(r, cx) {
    if (!r) return;
    this.close();
    if (r.kind === "space") {
      // The tab that space was last on, shown again with it.
      const tab = r.s.tabs.find((t) => t.active) ?? r.s.tabs[0];
      run("space.select", { id: r.s.id });
      if (tab) run("tab.select", { id: tab.id });
    } else if (r.kind === "new") {
      run("space.new", { machine: r.machine ?? "" });
    }
  }

  glyph(t, st) {
    if (st === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
    if (!st) return div().w(12).flex_none().text_color(t.dim).child("·");
    return div().w(12).flex_none().text_color(t[st] ?? t.dim).child(st === "idle" ? "○" : "●");
  }

  render() {
    const t = theme();
    const rows = this.rows();
    if (this.at === null) {
      const here = rows.findIndex((r) => r.kind === "space" && r.s.active);
      this.at = Math.max(0, here);
    }
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const total = rows.length * H;
    const height = Math.min(320, this.listHeight ?? 320);
    const fixed = total > height;
    const maxScroll = Math.max(0, total - height);
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
    const tops = (i) => i * H;
    // Keep the selected row in view; the arrows can't run it off the list.
    if (tops(this.at) < this.scroll) this.scroll = tops(this.at);
    if (tops(this.at) + H > this.scroll + height) this.scroll = tops(this.at) + H - height;
    const place = (el, i) =>
      fixed ? el.absolute().left(0).right(0).top(tops(i) - this.scroll) : el;
    const visible = (i) => !fixed || (tops(i) + H > this.scroll && tops(i) < this.scroll + height);

    const row = (r, i) => {
      const on = i === this.at;
      if (r.kind === "new") {
        return h_flex()
          .id(r.machine ? `pk-space-${r.machine}` : "pk-space-here")
          .mx(4)
          .px(10)
          .h(H)
          .items_center()
          .rounded(7)
          .gap(8)
          .text_color(t.muted)
          .cursor_pointer()
          .when(on, (el) => el.bg(t.hover))
          .hover((s) => s.bg(t.hover))
          .on_click(() => this.go(r))
          .child(div().w(12).child("+"))
          .child(r.machine ? `new space on ${r.machine}` : "new space");
      }
      const s = r.s;
      const agentsHere = agents().filter((a) => a.space === s.id).length;
      const branch = s.branch && !/^(main|master)$/i.test(s.branch) && s.branch.toLowerCase() !== s.name.toLowerCase() ? s.branch : null;
      return h_flex()
        .id(`pk-${s.id}`)
        .mx(4)
        .px(10)
        .h(H)
        .rounded(7)
        .gap(10)
        .items_center()
        .cursor_pointer()
        .when(on, (el) => el.bg(t.hover))
        .hover((s2) => s2.bg(t.hover))
        .on_click(() => this.go(r))
        .child(this.glyph(t, s.status))
        .child(div().size(18).flex_none().rounded(5).bg(spaceColor(t, s)).flex().items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff")
          .child((s.name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase()))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).when(s.active, (d) => d.font_semibold()).child(s.name))
        .when(Boolean(s.machine), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(s.machine)))
        .when(Boolean(branch), (el) => el.child(div().flex_none().max_w(120).truncate().text_size(11).text_color(t.dim).child(branch)))
        .when(s.status === "blocked", (el) => el.child(div().flex_none().text_size(11).text_color(t.blocked).child("needs you")))
        .when(s.status === "done", (el) => el.child(div().flex_none().text_size(11).text_color(t.done).child("finished")))
        .when(agentsHere > 0, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(String(agentsHere))));
    };

    return v_flex()
      .id("space-picker")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(18)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (k === "down") this.at = (this.at + 1) % rows.length;
        else if (k === "up") this.at = (this.at + rows.length - 1) % rows.length;
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Go to a space")).child(div().id("space-picker-esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => this.close()).child("Esc")))
      .child(
        h_flex().h(36).flex_none().px(10).gap(8).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
          .child(svg("mods/workspace-chrome/search.svg").size(15).text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .child(
        v_flex()
          .id("pk-list")
          .on_size_change((size, cx) => {
            this.listHeight = size.height / settings().zoom;
            cx.notify();
          })
          .h(Math.min(320, total))
          .min_h(0)
          .mb(6)
          .when(fixed, (el) =>
            el.overflow_hidden().on_scroll_wheel((e, cx) => {
              this.scroll = Math.max(0, Math.min(this.scroll - e.delta.y, maxScroll));
              // The selection follows the wheel, so the next frame doesn't scroll back to it.
              while (this.at < rows.length - 1 && tops(this.at) < this.scroll) this.at++;
              while (this.at > 0 && tops(this.at) + H > this.scroll + height) this.at--;
              cx.notify();
            }))
          .children(rows.map((r, i) => (visible(i) ? place(row(r, i), i) : null)).filter(Boolean)),
      );
  }
}
