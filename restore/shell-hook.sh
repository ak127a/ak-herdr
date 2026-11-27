# Sourced by interactive shells (bash / zsh) to:
# 1. Wrap agy and opencode inside herdr-core terminals so normal exits clean up
#    restore markers while crashes/reboots/core-stops preserve them.
# 2. Resume the recorded pi, agy, or opencode session when herdr-core replaces
#    a lost terminal with a fresh shell.

[ -n "${HC_TERMINAL_ID:-}" ] || return 0
case "$-" in
  *i*) ;;
  *) return 0 ;;
esac

_hc_define_agent_wrappers() {
  if command -v herdr-agent-wrap >/dev/null 2>&1; then
    if command -v agy >/dev/null 2>&1; then
      agy() { herdr-agent-wrap agy "$@"; }
    fi
    if command -v opencode >/dev/null 2>&1; then
      opencode() { herdr-agent-wrap opencode "$@"; }
    fi
  fi
}

_hc_define_agent_wrappers

_hc_restore_run() {
  [ -n "${_hc_restore_ran:-}" ] && return 0
  _hc_restore_ran=1
  _hc_resumed=0

  _hc_define_agent_wrappers

  _hc_marker="${_hc_restore_marker:-}"
  unset _hc_restore_marker
  if [ -n "$_hc_marker" ] && [ -f "$_hc_marker" ]; then
    {
      IFS= read -r _hc_line1 || _hc_line1=""
      IFS= read -r _hc_ts || _hc_ts=""
      IFS= read -r _hc_cwd || _hc_cwd=""
    } < "$_hc_marker" 2>/dev/null

    _hc_agent=""
    _hc_ref=""
    case "$_hc_line1" in
      pi:*) _hc_agent="pi"; _hc_ref="${_hc_line1#pi:}" ;;
      agy:*) _hc_agent="agy"; _hc_ref="${_hc_line1#agy:}" ;;
      opencode:*) _hc_agent="opencode"; _hc_ref="${_hc_line1#opencode:}" ;;
      /*) _hc_agent="pi"; _hc_ref="$_hc_line1" ;;
    esac

    case "$_hc_agent" in
      pi)
        if [ -n "$_hc_ref" ] && [ -f "$_hc_ref" ]; then
          if command -v pi >/dev/null 2>&1; then
            [ -n "$_hc_cwd" ] && [ -d "$_hc_cwd" ] && cd -- "$_hc_cwd" 2>/dev/null || true
            export _HC_RESUME_ACTIVE=1
            rm -f -- "$_hc_marker"
            printf '\n\033[2mherdr: resuming pi session\033[0m\n'
            pi --session "$_hc_ref"
            unset _HC_RESUME_ACTIVE
            _hc_resumed=1
          fi
        else
          rm -f -- "$_hc_marker"
        fi
        ;;
      agy)
        case "$_hc_ref" in
          ""|*[!A-Za-z0-9_.-]*) _hc_ref="" ;;
        esac
        _hc_db="${AGY_HOME:-$HOME/.gemini/antigravity-cli}/conversations/${_hc_ref}.db"
        if [ -n "$_hc_ref" ] && [ -f "$_hc_db" ]; then
          if command -v agy >/dev/null 2>&1; then
            [ -n "$_hc_cwd" ] && [ -d "$_hc_cwd" ] && cd -- "$_hc_cwd" 2>/dev/null || true
            export _HC_RESUME_ACTIVE=1
            rm -f -- "$_hc_marker"
            printf '\n\033[2mherdr: resuming antigravity session\033[0m\n'
            if command -v herdr-agent-wrap >/dev/null 2>&1; then
              herdr-agent-wrap agy --resume "$_hc_ref"
            else
              command agy --resume "$_hc_ref"
            fi
            unset _HC_RESUME_ACTIVE
            _hc_resumed=1
          fi
        else
          rm -f -- "$_hc_marker"
        fi
        ;;
      opencode)
        case "$_hc_ref" in
          ""|*[!A-Za-z0-9_.-]*) _hc_ref="" ;;
        esac
        if [ -n "$_hc_ref" ]; then
          if command -v opencode >/dev/null 2>&1; then
            [ -n "$_hc_cwd" ] && [ -d "$_hc_cwd" ] && cd -- "$_hc_cwd" 2>/dev/null || true
            export _HC_RESUME_ACTIVE=1
            rm -f -- "$_hc_marker"
            printf '\n\033[2mherdr: resuming opencode session\033[0m\n'
            if command -v opencode-herdr >/dev/null 2>&1; then
              opencode-herdr --session "$_hc_ref"
            elif command -v herdr-agent-wrap >/dev/null 2>&1; then
              HERDR_ENV=1 herdr-agent-wrap opencode --session "$_hc_ref"
            else
              HERDR_ENV=1 command opencode --session "$_hc_ref"
            fi
            unset _HC_RESUME_ACTIVE
            _hc_resumed=1
          fi
        else
          rm -f -- "$_hc_marker"
        fi
        ;;
      *)
        rm -f -- "$_hc_marker"
        ;;
    esac
  fi

  unset _hc_marker _hc_line1 _hc_ts _hc_cwd _hc_agent _hc_ref _hc_db
}

if [ -z "${_HC_RESUME_ACTIVE:-}" ]; then
  _hc_parent=""
  if [ -r "/proc/$PPID/comm" ]; then
    IFS= read -r _hc_parent < "/proc/$PPID/comm" 2>/dev/null || _hc_parent=""
  else
    _hc_parent=$(ps -o comm= -p "$PPID" 2>/dev/null | tr -d '[:space:]') || _hc_parent=""
  fi
  _hc_parent=${_hc_parent##*/}
  _hc_parent=${_hc_parent#-}

  case "$_hc_parent" in
    ""|herdr-core*|hc*)
      _hc_ns=$(printf '%s' "${HC_SESSION:-default}" | tr -c 'A-Za-z0-9_.-' '_')
      _hc_marker="${XDG_STATE_HOME:-$HOME/.local/state}/herdr-app/agent-restore/${_hc_ns}/${HC_TERMINAL_ID}"
      if [ -f "$_hc_marker" ]; then
        _hc_restore_marker="$_hc_marker"
        if [ -n "${BASH_VERSION:-}" ]; then
          _hc_restore_remove_bash_hook() {
            eval '
              case "$(declare -p PROMPT_COMMAND 2>/dev/null)" in
                "declare -a"*)
                  _hc_new_pc=()
                  for _hc_pc_item in "${PROMPT_COMMAND[@]}"; do
                    [ "$_hc_pc_item" = "_hc_restore_once" ] && continue
                    _hc_new_pc+=("$_hc_pc_item")
                  done
                  PROMPT_COMMAND=("${_hc_new_pc[@]}")
                  unset _hc_new_pc _hc_pc_item
                  ;;
                *)
                  case "${PROMPT_COMMAND:-}" in
                    "_hc_restore_once") PROMPT_COMMAND="" ;;
                    "_hc_restore_once;"*) PROMPT_COMMAND="${PROMPT_COMMAND#_hc_restore_once;}" ;;
                    *";_hc_restore_once") PROMPT_COMMAND="${PROMPT_COMMAND%;_hc_restore_once}" ;;
                    *"; _hc_restore_once") PROMPT_COMMAND="${PROMPT_COMMAND%; _hc_restore_once}" ;;
                    *) PROMPT_COMMAND="${PROMPT_COMMAND//_hc_restore_once;/}" ;;
                  esac
                  ;;
              esac
            '
          }
          _hc_restore_once() {
            _hc_restore_remove_bash_hook
            _hc_restore_run
            unset _hc_resumed
          }
          eval '
            case "$(declare -p PROMPT_COMMAND 2>/dev/null)" in
              "declare -a"*)
                PROMPT_COMMAND=(_hc_restore_once "${PROMPT_COMMAND[@]}")
                ;;
              *)
                if [ -n "${PROMPT_COMMAND:-}" ]; then
                  PROMPT_COMMAND="_hc_restore_once;${PROMPT_COMMAND}"
                else
                  PROMPT_COMMAND="_hc_restore_once"
                fi
                ;;
            esac
          '
        elif [ -n "${ZSH_VERSION:-}" ]; then
          _hc_restore_once() {
            eval 'precmd_functions=(${precmd_functions:#_hc_restore_once})'
            _hc_restore_run
            unset _hc_resumed
          }
          eval 'precmd_functions=(_hc_restore_once ${precmd_functions[@]})'
        else
          set -m 2>/dev/null || true
          _hc_restore_run
          if [ "${_hc_resumed:-0}" = "1" ]; then
            unset _hc_resumed
            exec "${SHELL:-/bin/sh}" -i
          fi
          unset _hc_resumed
        fi
      fi
      unset _hc_ns _hc_marker
      ;;
  esac
  unset _hc_parent
fi
