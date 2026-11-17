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

The script copies `keys.json`, `layouts/tmux.json` and the three mods into
`~/.config/herdr-app` (or `$HERDR_APP_HOME`), and `opencode-herdr` into
`~/.local/bin`, keeping anything it replaces as `<name>.bak-<date>`. Herdr
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

## Shortcuts

`keys.json` is the source of truth; these are the ones worth knowing.

### Direct keys

| Key | Action |
| --- | --- |
| `Alt+J` | **jump to the agent that needs you** (this layout) |
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
| `Shift+P` | start `pi` in a new tab |
| `Shift+O` | new tab running `opencode-herdr` (needs `opencode` on PATH) |

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
bin/opencode-herdr        one OpenCode session per tab (prefix + Shift+O)
```

Shipped Herdr mods (`workspace-chrome`, `pane`, `files`, `changes`, `picker`)
are used as-is, so they stay up to date with the app. `tabs-clean` and
`space-picker` are frozen copies of the shipped `tabs` and `picker`
(v0.1.16) — if Herdr changes their API, update them with
`herdr-app do mod.clone '{"name":"tabs","as":"tabs-clean-2"}'` and point the
layout at the new name.

## Keeping the repo in sync

After changing the setup in Herdr:

```sh
./sync.sh
git commit -am "tweak the sidebar" && git push
```
