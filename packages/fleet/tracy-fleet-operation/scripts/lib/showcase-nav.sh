#!/usr/bin/env bash
# The receipt of the showcase-navigation phase: which provision run laid a quickstart site down, and
# so which site may have its template showcase taken out of its menus (the pages stay published,
# their URLs keep working; only navigation moves, as the contract's reviewed `showcase-nav-map.json`
# says).
#
# 🔒 ONLY THE SITE A PROVISION CREATES. `provision.sh` writes the receipt the moment it extracts a
# quickstart webroot into a site that has none — the one point where "this run lays the site down" is
# known; an installer-shaped Joomla quickstart, which extracts none, writes it as Joomla's CLI
# installer is about to build the site (`joomla_installer_install`) — and it holds the request id the Claude Cowork plugin keys the phase by. It sits in the
# site's private folder, beside its token, outside every webroot. The platform removes it once the
# phase has reached a final state: applied, or a coverage state that says why it was skipped. So:
#   - a provision that stops before the phase finished leaves it, and the next pass takes back what
#     that phase applied with the SAME request id (below), so its revert is keyed to that very job;
#   - a re-run on a site already handed over, a site laid down before this receipt existed, an import
#     and a fresh install find none, and nothing is applied to them.
#
# 🔒 A STARTED PHASE IS NEVER SETTLED AS SKIPPED. The phase marks the site (`showcase-nav.started`,
# beside the receipt) before its first call to the plugin. From then on the site may be half-edited,
# so the state it settles on says so: applied, or failed with its reason — never "skipped", which
# would read as "nothing was touched", on any road (no token, no bind, no component, no contract).
# The phase is cosmetic and never stops a site being created (product rule):
#   - a phase that fails takes back what it applied once (`showcaseNav.revert`), inspects the
#     contract again and settles as failed (`tracy_wp_showcase_nav`, and `tracy_showcase_phase` in
#     joomla-bootstrap.php); an apply refused on its first call committed no batch, so it settles as
#     failed with nothing to revert and says the menus are untouched;
#   - a later pass that finds the mark does NOT apply again: the earlier pass may have died anywhere
#     in it, so it runs that same recovery — one revert, then the inspect — and settles as failed;
#   - a road on which that recovery cannot run (no token, no bind, no component, no contract) settles
#     it as failed with one `!!` line saying the menus may be partly hidden and the revert could not
#     be attempted (`tracy_showcase_unfinished`), and goes on;
#   - the MARK decides, not the receipt: a mark beside a receipt that is missing or holds no request
#     id has no job to revert, and is settled the same way (`tracy_showcase_stranded`); a receipt
#     that holds no request id is still kept for a person.
# Each phase run says one failure in exactly ONE `!! showcase navigation:` line.

tracy_showcase_receipt() { printf '%s/showcase-nav.request\n' "$SITE_DIR"; }
tracy_showcase_started_mark() { printf '%s/showcase-nav.started\n' "$SITE_DIR"; }

# Called as a NEW quickstart site's webroot is laid down. A receipt already there (a pass that stopped
# mid-extract) is kept, so the request id of a site never changes.
tracy_showcase_begin() {
  local receipt label
  receipt="$(tracy_showcase_receipt)"
  [ -e "$receipt" ] || [ -L "$receipt" ] && return 0
  label="$(printf '%s' "$LABEL" | tr -c 'a-zA-Z0-9.-' '-' | cut -c1-60)"
  rm -f -- "$(tracy_showcase_started_mark)"
  printf 'provision-%s-%s\n' "$label" "$(date -u +%Y%m%d%H%M%S)" > "$receipt"
}

# Prints the request id of the phase this site still owes. Status 1: no receipt — not a site this
# provision laid down. Status 2: a receipt that is not a plain file holding a request id, said and
# kept for a person to look at; the phase never guesses an id, and every caller goes on without it
# (the phase is cosmetic and never stops a provision).
tracy_showcase_request() {
  local receipt value
  receipt="$(tracy_showcase_receipt)"
  [ -e "$receipt" ] || [ -L "$receipt" ] || return 1
  if [ -f "$receipt" ] && [ ! -L "$receipt" ]; then value="$(cat -- "$receipt")"; else value=''; fi
  [[ "$value" =~ ^[a-zA-Z0-9._:-]{1,95}$ ]] || {
    echo '!! showcase navigation: showcase-nav.request does not hold a request id — kept for a person to look at' >&2
    return 2
  }
  printf '%s\n' "$value"
}

# Called just before the phase first asks the plugin to change anything: from here the site may be
# half-edited until the phase itself answers (see the lock above).
tracy_showcase_start() {
  : > "$(tracy_showcase_started_mark)" || {
    echo '!! showcase navigation: could not mark the phase as started, so it does not start' >&2
    return 1
  }
}

# Usage: tracy_showcase_settle [STATE]. The phase reached a final state: STATE, when given, is said,
# and the receipt goes, so no later provision of this site applies it again.
tracy_showcase_settle() {
  [ -z "${1:-}" ] || echo "    showcase navigation: $1"
  rm -f -- "$(tracy_showcase_receipt)" && rm -f -- "$(tracy_showcase_started_mark)"
}

# Said where a site gets no phase because this run did not lay it down.
tracy_showcase_not_new() {
  echo '    showcase navigation: not applied — this provision did not lay this site down (a re-run on an existing site); only a new quickstart site gets it'
}

# Usage: tracy_showcase_started. Status 0 when an earlier pass started the phase and did not finish it.
tracy_showcase_started() {
  [ -e "$(tracy_showcase_started_mark)" ] || [ -L "$(tracy_showcase_started_mark)" ]
}

# Usage: tracy_showcase_unfinished WHY [keep]. A phase an earlier pass started and did not finish, on
# a road where its revert cannot be attempted (WHY): one `!!` line, settled as failed. `keep` leaves
# the receipt where it is (one that holds no request id, kept for a person); the mark goes either way.
# Always status 0.
tracy_showcase_unfinished() {
  local state="failed — started on an earlier pass and not finished, the menus may be partly hidden; the revert could not be attempted ($1)"
  echo "!! showcase navigation: the phase started on an earlier pass and did not finish — the menus may be partly hidden; the revert could not be attempted ($1)" >&2
  if [ "${2:-}" = keep ]; then
    echo "    showcase navigation: $state"
    rm -f -- "$(tracy_showcase_started_mark)"
  else
    tracy_showcase_settle "$state"
  fi
}

# Usage: tracy_showcase_stranded. Status 0 when an earlier pass's mark is there but there is no
# request id to revert its job with — no receipt, or one that holds no request id — and it has just
# been settled as failed by `tracy_showcase_unfinished` (one `!!` line; such a receipt is kept, and
# its own line is folded into that one). Status 1 otherwise: no mark, or a request id to recover with.
# Every road calls it before it reads the receipt.
tracy_showcase_stranded() {
  local owed=0
  tracy_showcase_started || return 1
  tracy_showcase_request >/dev/null 2>&1 || owed=$?
  case "$owed" in
    0) return 1 ;;
    1) tracy_showcase_unfinished 'there is no showcase-nav.request to revert it with' ;;
    *) tracy_showcase_unfinished 'showcase-nav.request does not hold a request id to revert it with; the file is kept for a person to look at' keep ;;
  esac
}

# Usage: tracy_showcase_skip REASON. Said on a road that binds no content contract, so there is no
# showcase map to apply: skipped for a site this run laid down (its receipt goes), "not applied" for
# any other. A receipt that holds no request id is said and kept for a person, and the road goes on.
# A phase that already started is never skipped, whatever its receipt holds: this road has no
# contract to revert it through, so it is settled by `tracy_showcase_stranded` or
# `tracy_showcase_unfinished` and the site is handed over (the phase is cosmetic).
# Always status 0.
tracy_showcase_skip() {
  local owed=0
  ! tracy_showcase_stranded || return 0
  tracy_showcase_request >/dev/null || owed=$?
  if [ "$owed" = 0 ] && tracy_showcase_started; then
    tracy_showcase_unfinished "$1"
    return 0
  fi
  case "$owed" in
    0) tracy_showcase_settle "skipped — $1" ;;
    1) tracy_showcase_not_new ;;
    *) return 0 ;;
  esac
}
