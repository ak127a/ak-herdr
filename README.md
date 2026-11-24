# ak-herdr

My [Herdr](https://herdr.dev) setup: a tmux-flavoured window, a
spaces-and-agents sidebar, and one key that takes you to whichever agent
needs you.

```
┌ sidebar ─────────────────┬ tabs  1 Pi  2  3  4  5 ! ─────┐
│ .config                  │                              │
│   ▾ agents               │                              │
│     opencode · working   │           panes              │
│     claude · Needs you   │                              │
│   anotherone             │                              │
└──────────────────────────┴──────────────────────────────┘
```

## What you get

- **`layouts/tmux.json`** — sidebar with spaces and their agents nested under
  them, clean tab pills, optional Files/Changes panel, no pane headers and no
  status bar: the terminals get the whole window.
- **`mods/sidebar-tree`** — the sidebar: spaces with agents under them, most
  recently used first, sub-agents under their parent, status dots and
  "Needs you" marks, click to go. It also owns the `Alt+J` agent jump and the
  `last_agent` / `last_tab` / `last_space` keys.
- **`mods/tabs-clean`** — tab pills with program icons, agent status,
  per-tab close buttons.
- **`mods/space-picker`** — fuzzy space picker (`prefix + q`).
- **`mods/picker-clean`** — fuzzy tab/space/agent picker (`prefix + w` / `prefix + s` / `Ctrl+Shift+K`) that shows live agent session names (e.g. OpenCode) and program names instead of raw tab numbers.
- **`mods/toast-clean`** — in-app notifications that show live agent session names instead of tab numbers.
- **`mods/nvim-popup`** — Neovim in a floating window over the tab, opened in
  the folder the focused terminal or agent is in, as `nvim .` so the folder
  itself opens (`Alt+E` or `prefix + e`), and put away with the same key
  without quitting: it is a terminal of its own, not a tab.
- **`keys.json`** — tmux-style `Ctrl+Space` prefix plus direct keys, and
  `Alt+J` to jump to the agent that needs you.
- **`bin/opencode-herdr`** — a two-line wrapper that starts `opencode` with
  `HERDR_ENV=1` (one OpenCode session per Herdr tab). `install.sh` puts it in
  `~/.local/bin` and `prefix + Shift+O` runs it — keep `~/.local/bin` on your
  PATH, or the tab says `opencode-herdr: not found`.

## Install

Requires the [Herdr desktop app](https://herdr.dev) (built against 0.1.16).

```sh
git clone https://github.com/ak127a/ak-herdr.git
cd ak-herdr
./install.sh
```

The script copies `keys.json`, `layouts/tmux.json` and the mods into
`~/.config/herdr-app` (or `$HERDR_APP_HOME`), and `opencode-herdr` into
`~/.local/bin`, keeping anything it replaces under `backups/<date>/`. Herdr
reads these files live, so a running window picks them up, and the script
switches it to the `tmux` layout. On a fresh machine you can also pick it
with `Ctrl+Shift+L` or the command palette.

## Jump to the agent that needs you

`Alt+J` (`Cmd+J` on macOS) goes to the agent that wants a person:

- **blocked** agents first (they're waiting for you to type something),
- then agents that **finished while you weren't looking** (`done`),
- most recent first inside each group.

Press it again to walk through the rest of them; it wraps around. When nothing
needs you it says so in a toast. The sidebar marks the same agents with a
"Needs you" badge.

## Floating Neovim

`Alt+E` (`Cmd+E` on macOS), or `prefix + e`, floats Neovim over the window,
opened in the folder the focused terminal is working in right now, the way
`nvim .` opens it: the folder comes up in the file tree, and it follows a shell
that `cd`ed.

- It is a dialog of nearly the whole window — 94% wide, 92% tall, the terminal
  from edge to edge, no header bar of its own.
- It is a terminal of its own, started by herdr-core with no space or tab
  labels, so it never shows up in the sidebar or the tab bar: nothing in the
  space changes while it is open.
- It has the keyboard as it opens, and Esc goes to Neovim, not to the dialog.
- **Each folder keeps its own session.** Come back to a folder and the same
  Neovim comes back, buffers and undo history with it; another folder gets its
  own. The key puts it away without quitting; `:q` ends it, and the next press
  in that folder starts a fresh one.
- The folder comes from the program running in the pane, not the folder the
  pane was opened in: Herdr's `cwd` stays put when a shell `cd`s, so the mod
  asks herdr-core for the one the program is in now.
- Neovim has to be on the machine's `PATH`; without it the key says so in a
  toast instead of doing nothing.
- The mod asks Herdr for the dialog only as far as that Herdr can do it: on an
  older build that cannot put a terminal in an overlay's layout, it falls back
  to Herdr's own peek, which is smaller. Same key, same sessions.

The mod keeps the block it takes the key from at zero height, so the window has
no extra furniture. Want a small `nvim` tab in the bottom-right corner that does
the same as the key? Give that block a height in `layouts/tmux.json` (it is the
`nvim` block, `"size": { "px": 0 }` by default):

```json
{ "id": "nvim", "type": "block", "size": { "px": 30 }, "content": { "mod": "nvim-popup" } }
```

## Shortcuts

`keys.json` is the source of truth; these are the ones worth knowing.

### Direct keys

| Key | Action |
| --- | --- |
| `Alt+J` | **jump to the agent that needs you** (this layout) |
| `Alt+E` | **floating Neovim** in the focused folder: show, then hide |
| `Alt+[` / `Alt+]` | previous / next agent |
| `Alt+Shift+[` / `Alt+Shift+]` | previous / next tab |
| `Alt+1…9` / `Ctrl+1…9` | select tab |
| `Alt+Shift+1…9` | select space |
| `Alt+Up` / `Alt+Down` | previous / next space |
| `Alt+H J K L` | focus pane left / down / up / right |
| `Alt+Shift+H J K L` | swap pane left / down / up / right |
| `Ctrl+Shift+N` / `Ctrl+Shift+T` | new space / new tab |
| `Ctrl+Shift+W` / `Ctrl+Shift+X` | close tab / close pane |
| `Ctrl+Shift+O` / `Ctrl+Shift+E` | split right / split down |
| `Ctrl+Shift+Z` | zoom pane |
| `Ctrl+Shift+B` | toggle sidebar |
| `Ctrl+Shift+P` | command palette |
| `Ctrl+Shift+K` | picker (spaces, tabs, agents) |
| `Ctrl+Shift+L` | switch layout |
| `Ctrl+Shift+/` | help |

### `Ctrl+Space` prefix (tmux habits)

| Key | Action |
| --- | --- |
| `c` | new tab |
| `n` / `p` | next / previous tab |
| `1…9` | select tab |
| `%` / `"` | split right / down |
| `↑ ↓ ← →` | focus pane |
| `z` / `x` | zoom / close pane |
| `&` | close tab |
| `,` / `$` | rename tab / space |
| `s` (or `w`) / `q` | picker / space picker |
| `(` / `)` | previous / next space |
| `:` / `?` | command palette / help |
| `d` | close window |
| `a` | last agent |
| `l` / `Shift+L` | last tab / last space |
| `Shift+A` | start Antigravity (`agy`) in a new tab |
| `Shift+P` | start `pi` in a new tab |
| `Shift+O` | new tab running `opencode-herdr` (needs `opencode` on PATH) |
| `e` | floating Neovim in the focused folder (same key hides it) |

### In a terminal

| Key | Action |
| --- | --- |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | copy / paste |
| `Ctrl+V` | paste an image |
| `Cmd+C` / `Cmd+V` / `Cmd+A` | copy / paste / select all (macOS only) |
| `Ctrl+Left` / `Ctrl+Right` | word left / right |
| `Option+←` / `Option+→` | word left / right (macOS; see below) |
| `Cmd+←` / `Cmd+→` | line start / end (macOS) |
| `Ctrl+Backspace` | delete word |

## macOS: Alt is Cmd

On macOS the Alt/Option key types characters, so the same shortcuts use
**Cmd** there. `install.sh` rewrites every `alt-…` key to `cmd-…` while
copying `keys.json`, so `Alt+J` becomes `Cmd+J`, `Alt+H J K L` become
`Cmd+H J K L`, and so on. It also adds the Mac terminal habits that a
custom `keys.json` would otherwise lose: `Cmd+V` paste, `Cmd+C` copy,
`Cmd+A` select all, `Option+←` / `Option+→` for word left / right, and
`Cmd+←` / `Cmd+→` for start / end of line, the same split the Mac text fields
use.

If you want another modifier instead, set it before installing:

```sh
MAC_MOD="ctrl-alt" ./install.sh   # Alt+J becomes Ctrl+Alt+J
```

Three macOS collisions to know about:

- **Word jump:** macOS keeps `Ctrl+←` / `Ctrl+→` for Mission Control
  ("Move left a space" / "Move right a space") and `Ctrl+1…9` for "Switch to
  Desktop", so those keys never reach Herdr (that is also why `Ctrl+1…9` tab
  select looks dead on a Mac). Turn them off in System Settings → Keyboard →
  Keyboard Shortcuts… → Mission Control. Until you do, use `Option+←` /
  `Option+→` for words and `Cmd+←` / `Cmd+→` for the start / end of the line,
  which work without changing anything in the OS (if they do nothing, turn
  Option-as-Alt on in Settings → Keyboard).
- `Cmd+H` is "Hide app" in every Mac app. If pane-left doesn't reach Herdr,
  rebind `alt-h` in `~/.config/herdr-app/keys.json` to something free
  (e.g. `"ctrl-alt-h": "pane.go:left"`).
- `Ctrl+Space` may switch input sources, and `Cmd+Space` is Spotlight. If the
  prefix eats keys, change the `ctrl-space …` bindings in `keys.json`.

`sync.sh` reverses both on macOS — it drops the added `Cmd+V` / `Cmd+C` /
`Cmd+A`, `Option+←` / `Option+→` and `Cmd+←` / `Cmd+→` terminal keys and turns
`cmd-…` back into `alt-…` — so the repo always stores the Linux/Windows
spelling.

## Layout and mods

```
keys.json                 shortcuts
layouts/tmux.json         the window (no pane headers, no status bar)
mods/sidebar-tree/        spaces + agents sidebar, Alt+J jump, last-* keys
mods/tabs-clean/          tab pills
mods/space-picker/        prefix + q
mods/picker-clean/        prefix + w / prefix + s / Ctrl+Shift+K picker
mods/toast-clean/         in-app notifications with live session names
mods/nvim-popup/          floating Neovim (Alt+E, prefix + e)
bin/opencode-herdr        one OpenCode session per tab (prefix + Shift+O)
```

Shipped Herdr mods (`workspace-chrome`, `pane`, `files`, `changes`)
are used as-is, so they stay up to date with the app. `tabs-clean`,
`space-picker`, `picker-clean` and `toast-clean` are frozen copies of the
shipped `tabs`, `picker` and `toast`
(v0.1.16) — if Herdr changes their API, update them with
`herdr-app do mod.clone '{"name":"tabs","as":"tabs-clean-2"}'` and point the
layout at the new name.

## Keeping the repo in sync

After changing the setup in Herdr:

```sh
./sync.sh
git commit -am "tweak the sidebar" && git push
```
