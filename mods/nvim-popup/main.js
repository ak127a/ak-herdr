// A floating Neovim for the folder you are working in.
//
// One copy of this mod sits in the layout (layouts/tmux.json) to take the key:
// `ctrl-space e` or `alt-e` runs `nvim-popup.toggle`.
//
// Neovim starts as a herdr-core terminal with no space or tab labels, so it
// never shows up in the spaces sidebar or the tab bar. It is shown in a dialog
// of nearly the whole window, the terminal from edge to edge, nothing else.
//
// It opens in the folder the focused terminal (or agent) is working in, the way
// `nvim .` opens it, and each folder keeps its own session: come back to a
// folder and the same Neovim comes back, buffers and all. The key puts it away
// without quitting; `:q` ends it, and the next press in that folder starts a
// fresh one.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
// A namespace, not named imports: Herdr's module grows between releases, and a
// name this version lacks would fail the whole mod at load time (an older Herdr
// has no `checking`, for one). Everything is read off it when it is used.
import * as herdr from "herdr";

const {
  closeOverlay, exec, focused, home, nextCommand, notify, openOverlay, run,
  setShared, shared, terminals, theme,
} = herdr;

// herdr-core: the app's own bridge where it has one, else the same `hc` binary
// from PATH.
async function core(args) {
  return typeof herdr.hc === "function" ? herdr.hc(args) : exec("hc", args);
}

// Folder -> the core terminal running Neovim there.
const SESSIONS = "nvim.sessions";
// The id of the dialog on screen, to put it away.
const OVERLAY = "nvim.overlay";

// The sessions still running. A terminal quits with its program, so one that is
// gone is dropped.
function sessions() {
  const kept = shared(SESSIONS) ?? {};
  const live = {};

  for (const [folder, address] of Object.entries(kept)) {
    if (terminals().some((t) => t.address === address)) live[folder] = address;
  }

  return live;
}

// Where the focused pane is working now. A terminal's own `cwd` is the folder it
// was started in and stays that way when the shell moves; the folder its program
// is in now is `foreground.cwd`, which `hc get` reads from herdr-core.
async function folder() {
  const address = focused()?.terminal;

  if (address && !address.includes("/")) {
    const r = await core(["get", address]);
    const line = r.stdout.trim().split("\n").pop() ?? "";

    try {
      const info = JSON.parse(line);
      if (info?.foreground?.cwd) return info.foreground.cwd;
      if (info?.cwd) return info.cwd;
    } catch {
      // fall through to the app's own idea of the folder
    }
  }

  return focused()?.cwd || home();
}

// The app picks a new terminal up from herdr-core a moment after it is made,
// and showing one it has not picked up yet fails. Wait for the app's own list
// to have it, with its program running: `foreground` is that program.
async function known(address, cx) {
  for (let i = 0; i < 100; i += 1) {
    const t = terminals().find((k) => k.address === address);
    if (t?.foreground) return true;
    if (t && t.state && t.state !== "live") return false;
    await cx.sleep(25);
  }
  return false;
}

export default class NvimPopup extends View {
  init(_props, cx) {
    // Older Herdr releases have no `checking`; there, a check runs this for
    // real, which only starts the key loop.
    if (typeof herdr.checking === "function" && herdr.checking()) return;

    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "toggle") await this.toggle(cx);
      }
    });
  }

  async toggle(cx) {
    const all = sessions();

    // A terminal in a dialog has the keyboard while the dialog is up, and no
    // pane: this one is showing, so the key puts it away (Neovim keeps running).
    if (focused()?.pane === null && Object.values(all).includes(focused()?.terminal)) {
      const shown = shared(OVERLAY);
      if (shown) closeOverlay(shown);
      else run("overlay.close"); // a peek, on a Herdr too old for the dialog
      setShared(OVERLAY, null);
      cx.notify();
      return;
    }

    const where = await folder();
    let address = all[where];

    if (!address) {
      address = await this.start(where);
      if (!address) return;

      setShared(SESSIONS, { ...all, [where]: address });
      if (!(await known(address, cx))) return;
    }

    const dialog = openOverlay({
      kind: "dialog",
      width: 0.94,
      height: 0.92,
      layout: { type: "block", content: { terminal: address } },
    });

    // A Herdr without terminals in an overlay's layout draws an empty dialog
    // and gives the terminal no keyboard; the peek it does have puts the
    // terminal up, smaller, and takes the keyboard. Give the dialog a moment
    // first, so a slow focus is not mistaken for that.
    let focusedIt = false;
    for (let i = 0; i < 20 && !focusedIt; i += 1) {
      focusedIt = focused()?.terminal === address;
      if (!focusedIt) await cx.sleep(100);
    }

    if (focusedIt) {
      setShared(OVERLAY, dialog);
    } else {
      closeOverlay(dialog);
      setShared(OVERLAY, null);
      run("terminal.peek", { terminal: address });
    }

    cx.notify();
  }

  // Neovim in a core terminal of its own, in `where`, the way `nvim .` opens it.
  async start(where) {
    try {
      await exec("nvim", ["--version"], { cwd: where, timeout: 10000 });
    } catch {
      notify({
        title: "Neovim is not installed",
        body: "nvim is not on PATH on this computer.",
        level: "error",
      });
      return null;
    }

    const r = await core(["run", "--json", "--bg", "--rm", "--no-parent", "--cwd", where, "--", "nvim", "."]);
    const line = r.stdout.trim().split("\n").pop() ?? "";

    let address = null;
    try {
      address = JSON.parse(line).address ?? null;
    } catch {
      address = null;
    }

    if (r.code !== 0 || !address) {
      notify({
        title: "Neovim did not start",
        body: r.stderr.trim() || "hc run said nothing.",
        level: "error",
      });
      return null;
    }

    return address;
  }

  render() {
    return this.tab();
  }

  // A tab in the corner of the window that does what the key does, for the
  // pointer. The layout gives the block no height, so this stays out of sight;
  // give it a height in layouts/tmux.json to show it.
  tab() {
    const t = theme();
    const open = focused()?.pane === null && Object.values(sessions()).includes(focused()?.terminal);

    return h_flex()
      .id("nvim-tab")
      .px(8)
      .py(3)
      .gap(6)
      .rounded(6)
      .bg(t.surface)
      .border(1)
      .border_color(open ? t.accent : t.border)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.toggle(cx))
      .child(svg("icons/nvim.svg").size(13).flex_none().text_color(open ? t.accent : t.muted))
      .child(div().text_size(12).text_color(open ? t.foreground : t.muted).child("nvim"));
  }
}
