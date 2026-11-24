#!/bin/sh
# Install this Herdr setup: the "tmux" layout, its mods and the shortcuts.
# Existing files are kept as <name>.bak-<date>.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
app=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
os=${HERDR_SETUP_OS:-$(uname -s)}
mac_mod=${MAC_MOD:-cmd}
stamp=$(date +%Y%m%d-%H%M%S)

say() { printf '%s\n' "$*"; }

MODS="sidebar-tree tabs-clean space-picker picker-clean toast-clean nvim-popup"

backup() {
  [ -e "$1" ] || return 0
  cp -R "$1" "$1.bak-$stamp"
  say "  kept $1.bak-$stamp"
}

command -v herdr-app >/dev/null 2>&1 || say "note: herdr-app is not on PATH; copying files anyway"

mkdir -p "$app/layouts" "$app/mods"

# keys.json is written for Linux and Windows, where the modifier is Alt.
# On macOS Alt types characters: the scripts use Cmd there instead (MAC_MOD=...),
# and the terminal gets the Cmd+V / Cmd+C / Cmd+A a Mac user expects.
if [ "$os" = "Darwin" ]; then
  # Option is the Mac word-jump key, and Option+arrow formats never compose a
  # character, so keep those two as alt-* (the sed below would make them cmd-*,
  # which Mac users expect to mean start/end of line). Mission Control owns
  # Ctrl+Left/Right, so Option+arrow is the gesture that always reaches Herdr.
  # Cmd+arrow gets the Mac text-field meaning: start/end of line.
  sed "s/\"alt-/\"$mac_mod-/g" "$here/keys.json" |
    awk '/^  "terminal": \{$/ {
           print
           print "    \"cmd-v\": \"terminal.paste\","
           print "    \"cmd-c\": \"terminal.copy\","
           print "    \"cmd-a\": \"terminal.select_all\","
           print "    \"alt-left\": \"send:\\u001bb\","
           print "    \"alt-right\": \"send:\\u001bf\","
           print "    \"cmd-left\": \"send:\\u0001\","
           print "    \"cmd-right\": \"send:\\u0005\","
           next
         }
         { print }' > "$app/keys.json.new"
  say "keys    alt-* as $mac_mod-*, terminal cmd-v/c/a and option/cmd-arrows (macOS)"
else
  cp "$here/keys.json" "$app/keys.json.new"
  say "keys    alt-* as alt-*"
fi
backup "$app/keys.json"
mv "$app/keys.json.new" "$app/keys.json"

backup "$app/layouts/tmux.json"
cp "$here/layouts/tmux.json" "$app/layouts/tmux.json"
say "layout  layouts/tmux.json"

for m in $MODS; do
  backup "$app/mods/$m"
  rm -rf "$app/mods/$m"
  cp -R "$here/mods/$m" "$app/mods/$m"
  say "mod     mods/$m"
done

# Ctrl+Space Shift+O runs this wrapper: one OpenCode session per Herdr tab.
mkdir -p "$HOME/.local/bin"
cp "$here/bin/opencode-herdr" "$HOME/.local/bin/opencode-herdr"
chmod +x "$HOME/.local/bin/opencode-herdr"
say "bin     ~/.local/bin/opencode-herdr"
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) say "note: ~/.local/bin is not on this shell's PATH; add it so Herdr can run opencode-herdr" ;;
esac
command -v opencode >/dev/null 2>&1 || say "note: opencode is not on PATH; the opencode-herdr tab needs it"

# Herdr reads these files live, so a running window follows along.
if command -v herdr-app >/dev/null 2>&1; then
  if herdr-app do layout.switch --name tmux >/dev/null 2>&1; then
    say "showed the tmux layout"
  else
    say "Herdr is not running: open it and pick the tmux layout (ctrl-shift-l)"
  fi
fi

say "done"
