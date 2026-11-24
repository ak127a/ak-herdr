// In-app notifications ("toast" in layouts/tmux.json).
// Matches Herdr's shipped toast, except agent alerts resolve unnamed tab numbers
// (e.g. "repo / 13") to the agent's live session name (e.g. "repo / ssv2 oc51").

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, panes, spaces, terminals, props, closeOverlay, run, theme } from "herdr";
import { resolveToastBody } from "./resolve.js";

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

export default class ToastClean extends View {
  init() {
    this.copied = false;
    this.lastResolved = null;
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;

    const resolved = !login
      ? resolveToastBody(p, {
          spaces: spaces(),
          agents: agents(),
          panes: panes(),
          terminals: terminals(),
        })
      : null;
    if (resolved) this.lastResolved = resolved;
    const shown = resolved ?? this.lastResolved;

    const text = (value) => p.fitHeight
      ? div().child(value)
      : div().truncate().child(typeof value === "string" ? value.split("\n", 1)[0] : value);

    const bodyEl = () => {
      if (shown?.kind === "place") {
        return h_flex()
          .min_w(0)
          .gap(4)
          .items_center()
          .text_size(12)
          .child(div().max_w(110).truncate().text_color(t.dim).child(shown.space))
          .child(div().flex_none().text_color(t.dim).child("/"))
          .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(shown.tab));
      }
      const body = shown?.kind === "text" ? shown.text : p.body;
      return body ? text(body).text_size(12).text_color(t.muted) : null;
    };

    const renderedBody = !login ? bodyEl() : null;

    return h_flex()
      .id("toast")
      .when(p.fitHeight, (el) => el.w_full().min_h(70).flex_none().py(12))
      .when(!p.fitHeight, (el) => el.size_full())
      .px(18)
      .gap(12)
      .items_center()
      .bg(t.popover)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .child(p.icon ? image(p.icon).w(18).h(18).flex_none() : div().size(8).rounded(4).flex_none().bg(t[DOT[p.level] ?? "accent"]))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .overflow_hidden()
          .child(text(login ? `${login[1]} needs a login: run` : p.title ?? "").font_semibold().text_size(13).text_color(t.foreground))
          .when(Boolean(renderedBody), (el) => el.child(renderedBody))
          .when(Boolean(login), (el) => el.child(h_flex().gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().tooltip(command).text_size(12).text_color(t.muted).child(command))
            .child(div().id("toast-login-copy").flex_none().px(6).py(3).rounded(4).bg(t.raised)
              .text_size(12).text_color(t.foreground).cursor_pointer().hover((s) => s.bg(t.hover))
              .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
              .child(this.copied ? "Copied" : "Copy")))),
      );
  }
}
