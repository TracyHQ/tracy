# Docker/node/curl/sleep/chown/stat stubs for emdash-post-up.test.mjs — shell functions that shadow the
# real commands platform_post_up (and the token-custody helpers) call. Behaviour is read from STUB_*
# in the environment, one shape per scenario. `docker exec` is routed by the command word in its
# argv, so the same stub serves the mint, bootstrap, legacy-read, rm and absence-check calls of both
# branches. `node` is shadowed only for the host-side mail helper (configure-mail.mjs): its argv and
# whether the token file already held bytes are logged, and its exit code is STUB_MAIL_RC.
docker() {
  local sub="$1"; shift
  # Every docker call is appended to STUB_DOCKER_LOG (when set), so a scenario can assert which
  # in-container steps ran — e.g. that the Content API relay registration happened, or did not.
  [ -n "${STUB_DOCKER_LOG:-}" ] && printf '%s %s\n' "$sub" "$*" >> "$STUB_DOCKER_LOG"
  case "$sub" in
    image)   # `docker image inspect --format …`: answer per label the format string names
      case "$*" in
        *io.tracy.content-api.scalars*) printf '%s\n' "${STUB_CONTENT_API:-}"; return 0 ;;
      esac
      printf '%s\n' "${STUB_TEMPLATE_ID:-}"; return "${STUB_IMAGE_RC:-0}" ;;
    cp)    return "${STUB_CP_RC:-0}" ;;
    inspect)   # `docker inspect --format …` of the web container: its address on the fleet network
      printf '%s\n' "${STUB_SITE_IP-172.30.0.7}"; return "${STUB_INSPECT_RC:-0}" ;;
    exec)
      local all="$*"
      case "$all" in
        *bootstrap-site.sh*)
          # bootstrap-site.sh's own line 51 echoes raw mint output; emit configurable stdout/stderr
          # so the wrapper's `>/dev/null 2>&1` suppression can be asserted (a fake PAT must not leak).
          [ -n "${STUB_BOOTSTRAP_STDOUT:-}" ] && printf '%s\n' "$STUB_BOOTSTRAP_STDOUT"
          [ -n "${STUB_BOOTSTRAP_STDERR:-}" ] && printf '%s\n' "$STUB_BOOTSTRAP_STDERR" >&2
          return "${STUB_BOOTSTRAP_RC:-0}" ;;
        *tracy-sendmail*)   # the mail shim + relay variables probe: prints `ok <label>` when all are there
          [ "${STUB_MAIL_PROBE_RC:-0}" = 0 ] || return "${STUB_MAIL_PROBE_RC}"
          printf '%s\n' "${STUB_MAIL_PROBE-ok demo}"; return 0 ;;
        *"node tracy-content-token.cjs"*) return "${STUB_CONTENT_REGISTER_RC:-0}" ;;
        *" find /app "*)   # the owner guard: one line per file under /app not owned by www-data
          [ -n "${STUB_FOREIGN:-}" ] && printf '%s\n' ${STUB_FOREIGN}
          return 0 ;;
        *tracy-content-relay.sha256*) cat >/dev/null; return 0 ;;   # relay digest, read from stdin
        *"rm -f"*)        return "${STUB_RM_RC:-0}" ;;
        *tracy-mint.cjs*) printf '%s' "${STUB_MINT_STDOUT:-}"; return "${STUB_MINT_RC:-0}" ;;
        *node\ -e*)   # the O_NOFOLLOW legacy-token read (business branch)
          case "${STUB_LEGACY_MODE:-valid}" in
            valid)   printf '%s' "${STUB_LEGACY_TOKEN:-}"; return 0 ;;
            symlink) echo "legacy agent token missing or a symlink" >&2; return 3 ;;
            *)       echo "legacy agent token is not a regular file" >&2; return 4 ;;
          esac ;;
        *sh\ -c*)     # the post-cleanup absence check: exec error, or present/absent
          [ "${STUB_CLEANUP_EXEC_RC:-0}" = 0 ] || return "${STUB_CLEANUP_EXEC_RC}"
          if [ "${STUB_CLEANUP_PRESENT:-0}" = 1 ]; then echo present; else echo absent; fi
          return 0 ;;
        *) return 0 ;;
      esac ;;
    *) return 0 ;;
  esac
}
node() {
  case "$*" in
    *configure-mail.mjs*)
      local tf="" prev="" a state=empty
      for a in "$@"; do [ "$prev" = --token-file ] && tf="$a"; prev="$a"; done
      [ -n "$tf" ] && [ -s "$tf" ] && state=present
      [ -n "${STUB_DOCKER_LOG:-}" ] && printf 'node %s token=%s\n' "$*" "$state" >> "$STUB_DOCKER_LOG"
      [ -n "${STUB_MAIL_STDERR:-}" ] && printf '%s\n' "$STUB_MAIL_STDERR" >&2
      return "${STUB_MAIL_RC:-0}" ;;
    *quiet-forms.mjs*)
      [ -n "${STUB_DOCKER_LOG:-}" ] && printf 'node %s\n' "$*" >> "$STUB_DOCKER_LOG"
      [ -n "${STUB_FORMS_OUT:-}" ] && printf '%s\n' "$STUB_FORMS_OUT"
      return "${STUB_FORMS_RC:-0}" ;;
  esac
  command node "$@"
}
# STUB_LOOPBACK_DOWN=1 is the macOS stack: the caller's 127.0.0.1 is its own, so every loopback dial
# is refused (curl's exit 7) and prints nothing.
curl() {
  [ -n "${STUB_DOCKER_LOG:-}" ] && printf 'curl %s\n' "$*" >> "$STUB_DOCKER_LOG"
  case "$*" in
    *http://127.0.0.1:*) [ "${STUB_LOOPBACK_DOWN:-0}" = 1 ] && return 7 ;;
  esac
  printf '%s' '{"setupComplete":true}'
}
sleep() { :; }

# The token-custody helpers chown 0:0 and read the owner/mode back with stat. A non-root test cannot
# do either for real, so these shadow the commands: chown reports STUB_CHOWN_RC (default success) and
# stat reports STUB_STAT_UID (default root) for the owner query while the REAL mode is passed through
# (`command stat`), so a genuine chmod-600 failure is still observable. Real root:0600 custody is
# proven separately on Linux by the exec fixture.
chown() { return "${STUB_CHOWN_RC:-0}"; }
stat() {
  case "$*" in
    *'%u'*) echo "${STUB_STAT_UID:-0}"; return 0 ;;
  esac
  command stat "$@"
}
