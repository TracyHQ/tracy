# webroot-sensitive.sh — the configuration files whose BYTES no webroot reader hands out
# (plan tasks/todo-site-changes.md Q1, invariant 10). Sourced by webroot-git.sh: `file-diff` and
# `file-show` refuse these paths, so a caller that reaches the host job without tracy-web's diff
# door is refused too.
#
# 🔒 THE SAME LIST LIVES IN apps/tracy-web/src/sites/file-visibility.js (`isSensitivePath`) and in
# apps/tracy-host/src/webroot.js (`isSensitiveWebrootPath`). Bash cannot import either;
# apps/tracy-web/test/file-visibility.test.mjs runs all three over the same paths and fails when any
# two disagree. Change all three in one commit.
#
# Matched on the last segment, case-insensitively. A denylist of files known to carry secrets, not
# a promise that no other file holds one.

# 0 when the webroot-relative path "$1" names a configuration file.
tracy_webroot_path_sensitive() {
  local name bare
  name="${1##*/}"
  name="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')"
  bare="$name"
  while [[ "$bare" == .* ]]; do bare="${bare#.}"; done
  # WordPress: the config and every copy of it; the sample carries placeholders only.
  if [[ "$bare" == wp-config* && "$bare" != "wp-config-sample.php" ]]; then return 0; fi
  # Joomla: configuration.php and its copies (.bak, .orig, -dist).
  if [[ "$bare" == configuration.* && "$bare" == *php* ]]; then return 0; fi
  # Dotenv files, any flavour.
  if [[ "$name" == ".env" || "$name" == .env.* || "$name" == *.env ]]; then return 0; fi
  # EmDash: the SQLite database and its journals, and the agent token file under data/.
  if [[ "$name" =~ \.(db|sqlite3?)(-wal|-shm|-journal)?$ ]]; then return 0; fi
  if [[ "$name" == "tracy-agent.token" ]]; then return 0; fi
  return 1
}
