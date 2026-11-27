#!/bin/sh
# Install this Herdr setup: the "tmux" layout, its mods, shortcuts, and
# session restore for installed agents (agy, opencode, pi).
# Existing files are kept under $app/backups/<date>/.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
app=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
agy_home=${AGY_HOME:-$HOME/.gemini/antigravity-cli}
opencode_home=${OPENCODE_CONFIG_HOME:-$HOME/.config/opencode}
gemini_config=${GEMINI_CONFIG_HOME:-$HOME/.gemini/config}
pi_home=${PI_HOME:-$HOME/.pi/agent}
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

# Install a single managed file outside/inside $app with backup and idempotency.
install_managed_file() {
  src=$1
  dst=$2
  backup_subrel=$3
  mode=$4
  label=$5
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then
    chmod "$mode" "$dst" 2>/dev/null || true
    say "$label (unchanged)"
    return 0
  fi
  if [ -e "$dst" ]; then
    mkdir -p "$backup_root/$(dirname -- "$backup_subrel")"
    cp "$dst" "$backup_root/$backup_subrel"
    say "  kept $backup_root/$backup_subrel"
  fi
  mkdir -p "$(dirname -- "$dst")"
  cp "$src" "$dst"
  chmod "$mode" "$dst"
  say "$label"
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

merge_json_key() {
  json_path=$1
  key_name=$2
  target_json=$3
  backup_subrel=$4
  label=$5
  invalid_note=$6

  if ! command -v python3 >/dev/null 2>&1; then
    say "note: python3 is not on PATH; skipping $label"
    return 0
  fi

  status=$(python3 - "$json_path" "$key_name" "$target_json" <<'PY'
import json
import os
import sys

path, key, target_raw = sys.argv[1], sys.argv[2], sys.argv[3]
target = json.loads(target_raw)

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

if data.get(key) == target:
    print("unchanged")
    sys.exit(0)

data[key] = target
os.makedirs(os.path.dirname(path), exist_ok=True)
tmp = path + ".new"
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
with os.fdopen(fd, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
os.chmod(tmp, mode)
print("changed")
PY
)
  case "$status" in
    unchanged)
      say "$label (unchanged)"
      ;;
    changed)
      if [ -e "$json_path" ]; then
        mkdir -p "$backup_root/$(dirname -- "$backup_subrel")"
        cp "$json_path" "$backup_root/$backup_subrel"
        say "  kept $backup_root/$backup_subrel"
      fi
      mv "$json_path.new" "$json_path"
      say "$label"
      ;;
    *)
      say "note: $invalid_note"
      ;;
  esac
}

wire_shell_rc() {
  rc_file=$1
  rc_name=$(basename -- "$rc_file")
  if ! command -v python3 >/dev/null 2>&1; then
    say "note: python3 is not on PATH; skipping $rc_file restore wiring"
    return 0
  fi

  status=$(python3 - "$rc_file" <<'PY'
import os
import re
import sys

path = sys.argv[1]
begin = "# >>> ak-herdr restore >>>"
end = "# <<< ak-herdr restore <<<"
block = (
    f"{begin}\n"
    '[ -r "${HERDR_APP_HOME:-$HOME/.config/herdr-app}/restore/shell-hook.sh" ] && '
    '. "${HERDR_APP_HOME:-$HOME/.config/herdr-app}/restore/shell-hook.sh"\n'
    f"{end}"
)

if os.path.exists(path):
    with open(path, "r", encoding="utf-8") as f:
        orig = f.read()
    mode = os.stat(path).st_mode & 0o777
else:
    orig = ""
    mode = 0o644

managed_re = re.compile(rf"(?ms)^{re.escape(begin)}\n.*?^{re.escape(end)}$")
legacy_re = re.compile(
    r"(?ms)^# Resume the pi conversation after herdr-core replaces a lost terminal.*?"
    r"unset _hc_ns _hc_marker _hc_parent _hc_sess\nfi"
)

if managed_re.search(orig):
    updated = managed_re.sub(lambda _m: block, orig, count=1)
elif legacy_re.search(orig):
    updated = legacy_re.sub(lambda _m: block, orig, count=1)
else:
    sep = "" if (not orig or orig.endswith("\n")) else "\n"
    if orig.strip():
        updated = f"{orig}{sep}\n{block}\n"
    else:
        updated = f"{block}\n"

if updated == orig:
    print("unchanged")
    sys.exit(0)

os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
tmp = path + ".ak-herdr.new"
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
with os.fdopen(fd, "w", encoding="utf-8") as f:
    f.write(updated)
os.chmod(tmp, mode)
print("changed")
PY
)
  case "$status" in
    unchanged)
      say "shell   $rc_file (unchanged)"
      ;;
    changed)
      if [ -e "$rc_file" ]; then
        mkdir -p "$backup_root/shell"
        cp "$rc_file" "$backup_root/shell/$rc_name"
        say "  kept $backup_root/shell/$rc_name"
      fi
      mv "$rc_file.ak-herdr.new" "$rc_file"
      say "shell   $rc_file"
      ;;
  esac
}

command -v herdr-app >/dev/null 2>&1 || say "note: herdr-app is not on PATH; copying files anyway"

mkdir -p "$app/layouts" "$app/mods"

# Install mods first so keys.json and layouts/tmux.json never see a missing mod.
for m in $MODS; do
  sync_mod "$m"
done

has_opencode=0; command -v opencode >/dev/null 2>&1 && has_opencode=1
has_agy=0; command -v agy >/dev/null 2>&1 && has_agy=1
has_pi=0; command -v pi >/dev/null 2>&1 && has_pi=1

# OpenCode: wrapper (HERDR_ENV=1) + V2 TUI restore plugin.
if [ "$has_opencode" -eq 1 ]; then
  install_managed_file \
    "$here/bin/opencode-herdr" \
    "$HOME/.local/bin/opencode-herdr" \
    "bin/opencode-herdr" \
    755 \
    "bin     ~/.local/bin/opencode-herdr"
  install_managed_file \
    "$here/restore/opencode/tui.js" \
    "$opencode_home/plugins/herdr-app-restore/tui.js" \
    "opencode/plugins/herdr-app-restore/tui.js" \
    644 \
    "opencode $opencode_home/plugins/herdr-app-restore/tui.js"
else
  say "opencode not found (skipped)"
fi

# Antigravity (agy): title.sh + settings.json "title" + restore-hook.py + hooks.json.
if [ "$has_agy" -eq 1 ]; then
  install_managed_file \
    "$here/bin/agy-title" \
    "$agy_home/title.sh" \
    "antigravity-cli/title.sh" \
    755 \
    "agy     $agy_home/title.sh"

  if [ "$agy_home" = "$HOME/.gemini/antigravity-cli" ]; then
    agy_title_cmd="~/.gemini/antigravity-cli/title.sh"
    agy_hook_cmd="~/.gemini/antigravity-cli/restore-hook.py"
  else
    agy_title_cmd="$agy_home/title.sh"
    agy_hook_cmd="$agy_home/restore-hook.py"
  fi

  merge_json_key \
    "$agy_home/settings.json" \
    "title" \
    "{\"type\":\"command\",\"command\":\"$agy_title_cmd\",\"enabled\":true}" \
    "antigravity-cli/settings.json" \
    "agy     $agy_home/settings.json" \
    "$agy_home/settings.json is not valid JSON; skipping title config"

  install_managed_file \
    "$here/restore/agy/restore-hook.py" \
    "$agy_home/restore-hook.py" \
    "antigravity-cli/restore-hook.py" \
    755 \
    "agy     $agy_home/restore-hook.py"

  hook_target="{\"SessionStart\":[{\"type\":\"command\",\"command\":\"$agy_hook_cmd\",\"timeout\":5}],\"Stop\":[{\"type\":\"command\",\"command\":\"$agy_hook_cmd\",\"timeout\":5}]}"
  merge_json_key \
    "$gemini_config/hooks.json" \
    "herdr-app-restore" \
    "$hook_target" \
    "gemini-config/hooks.json" \
    "agy     $gemini_config/hooks.json" \
    "$gemini_config/hooks.json is not valid JSON; skipping restore hook config"
else
  say "agy     not found (skipped)"
fi

# Pi: session-restore extension.
if [ "$has_pi" -eq 1 ]; then
  install_managed_file \
    "$here/restore/pi/herdr-app-restore.ts" \
    "$pi_home/extensions/herdr-app-restore.ts" \
    "pi/extensions/herdr-app-restore.ts" \
    644 \
    "pi      $pi_home/extensions/herdr-app-restore.ts"
else
  say "pi      not found (skipped)"
fi

# Shared restore wrappers, shell hook, and selftest: only installed when at least
# one supported agent is present on PATH.
if [ "$has_agy" -eq 1 ] || [ "$has_opencode" -eq 1 ]; then
  install_managed_file \
    "$here/bin/herdr-agent-wrap" \
    "$HOME/.local/bin/herdr-agent-wrap" \
    "bin/herdr-agent-wrap" \
    755 \
    "bin     ~/.local/bin/herdr-agent-wrap"
fi

if [ "$has_agy" -eq 1 ] || [ "$has_opencode" -eq 1 ] || [ "$has_pi" -eq 1 ]; then
  install_managed_file \
    "$here/bin/herdr-restore-selftest" \
    "$HOME/.local/bin/herdr-restore-selftest" \
    "bin/herdr-restore-selftest" \
    755 \
    "bin     ~/.local/bin/herdr-restore-selftest"

  install_managed_file \
    "$here/restore/shell-hook.sh" \
    "$app/restore/shell-hook.sh" \
    "restore/shell-hook.sh" \
    644 \
    "restore $app/restore/shell-hook.sh"

  wire_shell_rc "$HOME/.bashrc"
  need_zsh=0
  if [ -f "$HOME/.zshrc" ] || [ "$os" = "Darwin" ]; then
    need_zsh=1
  else
    case "${SHELL:-}" in
      */zsh) need_zsh=1 ;;
    esac
  fi
  if [ "$need_zsh" -eq 1 ]; then
    wire_shell_rc "$HOME/.zshrc"
  fi

  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) say "note: ~/.local/bin is not on this shell's PATH; add it so Herdr can run installed wrappers" ;;
  esac
else
  say "restore no supported agents found (skipped)"
fi

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
