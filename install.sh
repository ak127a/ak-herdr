#!/bin/sh
# Install this Herdr setup: the "tmux" layout, its mods and the shortcuts.
# Existing files are kept under $app/backups/<date>/.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
app=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
agy_home=${AGY_HOME:-$HOME/.gemini/antigravity-cli}
os=${HERDR_SETUP_OS:-$(uname -s)}
mac_mod=${MAC_MOD:-cmd}
stamp=$(date +%Y%m%d-%H%M%S)
backup_root="$app/backups/$stamp"

say() { printf '%s\n' "$*"; }

MODS="sidebar-tree tabs-clean space-picker picker-clean toast-clean nvim-popup"

# Back up a path relative to $app outside mods/ and layouts/ so Herdr never
# treats backup directories as mods or layouts.
backup_rel() {
  rel=$1
  [ -e "$app/$rel" ] || return 0
  mkdir -p "$backup_root/$(dirname -- "$rel")"
  cp -R "$app/$rel" "$backup_root/$rel"
  say "  kept $backup_root/$rel"
}

# Herdr generates IDE/diagnostic files inside mod directories; preserve them.
is_generated() {
  case "$1" in
    *.d.ts | jsconfig.json | *.error) return 0 ;;
    *) return 1 ;;
  esac
}

mod_unchanged() {
  src=$1
  dst=$2
  [ -d "$dst" ] || return 1
  if ! (cd "$src" && find . ! -name . -print) | while IFS= read -r rel; do
    rel=${rel#./}
    if [ -d "$src/$rel" ]; then
      [ -d "$dst/$rel" ] || exit 1
    else
      [ -f "$dst/$rel" ] && cmp -s "$src/$rel" "$dst/$rel" || exit 1
    fi
  done; then
    return 1
  fi
  if ! (cd "$dst" && find . ! -name . -print) | while IFS= read -r rel; do
    rel=${rel#./}
    is_generated "$rel" && continue
    if [ -d "$dst/$rel" ]; then
      [ -d "$src/$rel" ] || exit 1
    else
      [ -e "$src/$rel" ] || exit 1
    fi
  done; then
    return 1
  fi
  return 0
}

# Update a mod in place without rm -rf so keys.json never observes a missing
# mod directory and unchanged mods do not get needlessly reloaded.
sync_mod() {
  m=$1
  src="$here/mods/$m"
  dst="$app/mods/$m"
  if mod_unchanged "$src" "$dst"; then
    say "mod     mods/$m (unchanged)"
    return 0
  fi
  [ -e "$dst" ] && backup_rel "mods/$m"
  mkdir -p "$dst"
  (cd "$dst" && find . -depth ! -name . -print) | while IFS= read -r rel; do
    rel=${rel#./}
    is_generated "$rel" && continue
    if [ ! -e "$src/$rel" ]; then
      rm -rf "$dst/$rel"
    elif [ -d "$dst/$rel" ] && [ ! -d "$src/$rel" ]; then
      rm -rf "$dst/$rel"
    elif [ ! -d "$dst/$rel" ] && [ -d "$src/$rel" ]; then
      rm -f "$dst/$rel"
    fi
  done
  (cd "$src" && find . ! -name . -print) | while IFS= read -r rel; do
    rel=${rel#./}
    if [ -d "$src/$rel" ]; then
      mkdir -p "$dst/$rel"
    elif [ ! -f "$dst/$rel" ] || ! cmp -s "$src/$rel" "$dst/$rel"; then
      cp "$src/$rel" "$dst/$rel"
    fi
  done
  say "mod     mods/$m"
}

command -v herdr-app >/dev/null 2>&1 || say "note: herdr-app is not on PATH; copying files anyway"

mkdir -p "$app/layouts" "$app/mods"

# Install mods first so keys.json and layouts/tmux.json never see a missing mod.
for m in $MODS; do
  sync_mod "$m"
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

# Antigravity (agy) window title script + settings.json "title" block so live
# conversation names (including auto-generated titles and /rename) show in Herdr.
mkdir -p "$agy_home"
if [ -f "$agy_home/title.sh" ] && cmp -s "$here/bin/agy-title" "$agy_home/title.sh"; then
  chmod +x "$agy_home/title.sh"
  say "agy     $agy_home/title.sh (unchanged)"
else
  if [ -e "$agy_home/title.sh" ]; then
    mkdir -p "$backup_root/antigravity-cli"
    cp "$agy_home/title.sh" "$backup_root/antigravity-cli/title.sh"
    say "  kept $backup_root/antigravity-cli/title.sh"
  fi
  cp "$here/bin/agy-title" "$agy_home/title.sh"
  chmod +x "$agy_home/title.sh"
  say "agy     $agy_home/title.sh"
fi

if [ "$agy_home" = "$HOME/.gemini/antigravity-cli" ]; then
  agy_title_cmd="~/.gemini/antigravity-cli/title.sh"
else
  agy_title_cmd="$agy_home/title.sh"
fi

if command -v python3 >/dev/null 2>&1; then
  agy_settings_status=$(python3 - "$agy_home/settings.json" "$agy_title_cmd" <<'PY'
import json
import os
import sys

path, cmd = sys.argv[1], sys.argv[2]
target = {"type": "command", "command": cmd, "enabled": True}

if os.path.exists(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        print("invalid")
        sys.exit(0)
    if not isinstance(data, dict):
        print("invalid")
        sys.exit(0)
    mode = os.stat(path).st_mode & 0o777
else:
    data = {}
    mode = 0o600

if data.get("title") == target:
    print("unchanged")
    sys.exit(0)

data["title"] = target
tmp = path + ".new"
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
with os.fdopen(fd, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
os.chmod(tmp, mode)
print("changed")
PY
)
  case "$agy_settings_status" in
    unchanged)
      say "agy     $agy_home/settings.json (unchanged)"
      ;;
    changed)
      if [ -e "$agy_home/settings.json" ]; then
        mkdir -p "$backup_root/antigravity-cli"
        cp "$agy_home/settings.json" "$backup_root/antigravity-cli/settings.json"
        say "  kept $backup_root/antigravity-cli/settings.json"
      fi
      mv "$agy_home/settings.json.new" "$agy_home/settings.json"
      say "agy     $agy_home/settings.json"
      ;;
    *)
      say "note: $agy_home/settings.json is not valid JSON; skipping title config"
      ;;
  esac
else
  say "note: python3 is not on PATH; skipping $agy_home/settings.json title config"
fi
command -v agy >/dev/null 2>&1 || say "note: agy is not on PATH; the Antigravity tab needs it"

if [ -f "$app/layouts/tmux.json" ] && cmp -s "$here/layouts/tmux.json" "$app/layouts/tmux.json"; then
  say "layout  layouts/tmux.json (unchanged)"
else
  backup_rel "layouts/tmux.json"
  cp "$here/layouts/tmux.json" "$app/layouts/tmux.json"
  say "layout  layouts/tmux.json"
fi

# keys.json is written last (with a fresh mtime) so Herdr reloads all bindings
# after every mod folder exists on disk.
#
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
if [ -f "$app/keys.json" ] && ! cmp -s "$app/keys.json.new" "$app/keys.json"; then
  backup_rel "keys.json"
fi
mv "$app/keys.json.new" "$app/keys.json"

# Herdr reads these files live, so a running window follows along.
if command -v herdr-app >/dev/null 2>&1; then
  if herdr-app do layout.switch --name tmux >/dev/null 2>&1; then
    say "showed the tmux layout"
  else
    say "Herdr is not running: open it and pick the tmux layout (ctrl-shift-l)"
  fi
fi

say "done"
