#!/bin/sh
# Copy the live setup back into this folder, so it can be committed and pushed.
# Only tracked files move: generated jsconfig.json/gpui-kit.d.ts files stay out.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
app=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
os=${HERDR_SETUP_OS:-$(uname -s)}
mac_mod=${MAC_MOD:-cmd}

MODS="sidebar-tree tabs-clean space-picker tmux-navigation"

# install.sh rewrites alt-* to $MAC_MOD-* on macOS; turn it back so the repo
# keeps one canonical file with Alt shortcuts.
if [ "$os" = "Darwin" ]; then
  sed "s/\"$mac_mod-/\"alt-/g" "$app/keys.json" > "$here/keys.json"
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

printf 'synced %s -> %s\n' "$app" "$here"
