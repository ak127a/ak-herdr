import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, focused, theme, run, window, keys, nextCommand, notify } from "herdr";
import { NavigationHistory, AgentHistory } from "./history.js";
import { TabOrder } from "./tab-order.js";

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    // shortcut: history starts with this layout; persist it if restart continuity is needed.
    this.history = new NavigationHistory();
    this.history.observe(spaces());
    this.agentHistory = new AgentHistory();
    this.agentHistory.observe(agents(), focused());
    this.tabOrder = new TabOrder();
    this.tabOrder.observe(spaces());
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "start_pi") {
          run("tab.new", { name: "Pi", argv: ["pi"] });
          continue;
        }
        if (command === "needs_you") {
          this.jumpToNeedsYou();
          cx.notify();
          continue;
        }
        if (command === "last_agent") {
          const terminal = this.agentHistory.target(agents(), focused());
          if (terminal) run("agent.focus", { terminal });
          else notify({ title: "No previous agent yet", level: "info" });
          cx.notify();
          continue;
        }
        if (command !== "last_tab" && command !== "last_space") continue;
        const id = this.history.target(command, spaces());
        if (id) run(command === "last_space" ? "space.select" : "tab.select", { id });
        else notify({ title: command === "last_space" ? "No previous space yet" : "No previous tab in this space yet", level: "info" });
        cx.notify();
      }
    });
  }

  // The agents waiting on a person: blocked (needs typing) first, then the
  // ones that finished while away, most recent first inside each group.
  waitingOnMe() {
    return agents()
      .filter(a => a.status === "blocked" || a.status === "done")
      .sort((a, b) => (b.status === "blocked") - (a.status === "blocked") || b.seq - a.seq);
  }

  // Go to the agent that needs the person: the first press takes the most
  // urgent one, pressing again walks the rest of them and wraps around.
  jumpToNeedsYou() {
    const waiting = this.waitingOnMe();
    if (!waiting.length) {
      notify({ title: "No agent needs you", body: "Every agent is working or idle", level: "info" });
      return;
    }
    const at = waiting.findIndex(a => a.address === this.needsYouAt);
    const next = waiting[(at + 1) % waiting.length];
    this.needsYouAt = next.address;
    run("agent.focus", { terminal: next.address });
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  render() {
    // Append newly seen tabs from any creation path; leave existing tabs alone.
    for (const move of this.tabOrder.observe(spaces())) run("tab.move", move);
    this.history.observe(spaces());
    this.agentHistory.observe(agents(), focused());
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(10).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().id("needs-you").text_color(t.blocked).cursor_pointer()
          .tooltip("Jump to the agent that needs you")
          .hover(s => s.text_color(t.foreground))
          .on_click(() => this.jumpToNeedsYou())
          .child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
