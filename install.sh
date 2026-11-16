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

MODS="sidebar-tree tabs-clean space-picker"

backup() {
  [ -e "$1" ] || return 0
  cp -R "$1" "$1.bak-$stamp"
  say "  kept $1.bak-$stamp"
}

command -v herdr-app >/dev/null 2>&1 || say "note: herdr-app is not on PATH; copying files anyway"

mkdir -p "$app/layouts" "$app/mods"

# keys.json is written for Linux and Windows, where the modifier is Alt.
# On macOS Alt types characters: the scripts use Cmd there instead (MAC_MOD=...).
if [ "$os" = "Darwin" ]; then
  sed "s/\"alt-/\"$mac_mod-/g" "$here/keys.json" > "$app/keys.json.new"
  say "keys    alt-* as $mac_mod-* (macOS)"
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

# Herdr reads these files live, so a running window follows along.
if command -v herdr-app >/dev/null 2>&1; then
  if herdr-app do layout.switch --name tmux >/dev/null 2>&1; then
    say "showed the tmux layout"
  else
    say "Herdr is not running: open it and pick the tmux layout (ctrl-shift-l)"
  fi
fi

say "done"
