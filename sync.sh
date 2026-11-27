#!/bin/sh
# Copy the live setup back into this folder, so it can be committed and pushed.
# Only tracked files move: generated jsconfig.json/gpui-kit.d.ts files stay out.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
app=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
agy_home=${AGY_HOME:-$HOME/.gemini/antigravity-cli}
opencode_home=${OPENCODE_CONFIG_HOME:-$HOME/.config/opencode}
pi_home=${PI_HOME:-$HOME/.pi/agent}
os=${HERDR_SETUP_OS:-$(uname -s)}
mac_mod=${MAC_MOD:-cmd}

MODS="sidebar-tree tabs-clean space-picker picker-clean toast-clean nvim-popup"

# install.sh rewrites alt-* to $MAC_MOD-* on macOS and adds the Mac terminal
# chords (Cmd+C/V/A, Option+arrow word jump, Cmd+arrow line start/end); undo
# all of it so the repo keeps one canonical file with Alt shortcuts.
if [ "$os" = "Darwin" ]; then
  sed -e '/^    "cmd-v": "terminal\.paste",$/d' \
      -e '/^    "cmd-c": "terminal\.copy",$/d' \
      -e '/^    "cmd-a": "terminal\.select_all",$/d' \
      -e '/^    "alt-left": "send:\\u001bb",$/d' \
      -e '/^    "alt-right": "send:\\u001bf",$/d' \
      -e '/^    "cmd-left": "send:\\u0001",$/d' \
      -e '/^    "cmd-right": "send:\\u0005",$/d' \
      -e "s/\"$mac_mod-/\"alt-/g" "$app/keys.json" > "$here/keys.json"
else
  cp "$app/keys.json" "$here/keys.json"
fi

cp "$app/layouts/tmux.json" "$here/layouts/tmux.json"

for m in $MODS; do
  rm -rf "$here/mods/$m"
  mkdir -p "$here/mods/$m"
  for f in "$app/mods/$m"/*; do
    case "$f" in
      *.d.ts | */jsconfig.json | *.error) continue ;;
    esac
    cp -R "$f" "$here/mods/$m/"
  done
done

sync_bin() {
  src=$1
  dst=$2
  [ -f "$src" ] || return 0
  mkdir -p "$(dirname -- "$dst")"
  cp "$src" "$dst"
  chmod +x "$dst"
}

sync_file() {
  src=$1
  dst=$2
  [ -f "$src" ] || return 0
  mkdir -p "$(dirname -- "$dst")"
  cp "$src" "$dst"
}

sync_bin "$HOME/.local/bin/opencode-herdr" "$here/bin/opencode-herdr"
sync_bin "$HOME/.local/bin/herdr-agent-wrap" "$here/bin/herdr-agent-wrap"
sync_bin "$HOME/.local/bin/herdr-restore-selftest" "$here/bin/herdr-restore-selftest"
sync_bin "$agy_home/title.sh" "$here/bin/agy-title"
sync_bin "$agy_home/restore-hook.py" "$here/restore/agy/restore-hook.py"
sync_file "$opencode_home/plugins/herdr-app-restore/tui.js" "$here/restore/opencode/tui.js"
sync_file "$pi_home/extensions/herdr-app-restore.ts" "$here/restore/pi/herdr-app-restore.ts"
sync_file "$app/restore/shell-hook.sh" "$here/restore/shell-hook.sh"

printf 'synced %s -> %s\n' "$app" "$here"
