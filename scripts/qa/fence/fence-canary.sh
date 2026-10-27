#!/bin/bash
# Group 1 (files, network, processes) and group 3 (proxy) of fence-check, run INSIDE one lane's fence.
# Each row runs with its own time limit and writes one TSV line: group, name, expectation, exit code.
# Expectations: deny = any non-zero · eperm = exactly 3 from fence-net.mjs (a sandbox denial, not a dead
# port) · allow = 0 · refused = exactly 5 (the proxy answered, and not 200).
# Never prints what a probe read: every probe's output goes to /dev/null.
#
# Environment (set by fence-check.mjs): OUT KIND PROBE NODE HOME_REAL REAL_TMP BAIT SRC WRITE_OK TMP_OK
#   LANE_KEY RESOLVE GATE DECOY OTHER_CDP CDP PROXY UPSTREAM OTHER_PID OUTER_PID MARK DOCKER_SOCK
#   PROXY_HOST SECRETS (newline-separated paths that must not be readable) OTHER_LANE
set -u
: > "$OUT"

row() { # row <group> <name> <expect> <command...>
  local group="$1" name="$2" expect="$3"
  shift 3
  /usr/bin/perl -e 'alarm 8; exec @ARGV' "$@" > /dev/null 2>&1 < /dev/null
  printf '%s\t%s\t%s\t%s\n' "$group" "$name" "$expect" "$?" >> "$OUT"
}
G=files-network-processes

# ---- must fail: files
row $G 'read ~/.ssh' deny /bin/ls "$HOME_REAL/.ssh"
row $G 'read ~/.claude/settings.json' deny /bin/cat "$HOME_REAL/.claude/settings.json"
row $G 'read ~/.zshenv' deny /bin/cat "$HOME_REAL/.zshenv"
row $G 'read login keychain file' deny /bin/cat "$HOME_REAL/Library/Keychains/login.keychain-db"
row $G 'read bait outside the fence' deny /bin/cat "$BAIT"
row $G 'list /private/tmp/claude-501' deny /bin/ls /private/tmp/claude-501
row $G 'list the real user temp dir' deny /bin/ls "$REAL_TMP"
row $G 'list /Volumes' deny /bin/ls /Volumes
row $G 'list /Applications' deny /bin/ls /Applications
row $G 'read test/ inside the product tree' deny /bin/cat "$SRC/sub/test/t.txt"
row $G 'read root test/ of the product tree' deny /bin/cat "$SRC/test/root.txt"
row $G 'write into the product tree' deny /usr/bin/touch "$SRC/sub/src/new"
row $G 'write /private/tmp' deny /usr/bin/touch "/private/tmp/qaf-escape-$MARK"
row $G 'write the real user temp dir' deny /usr/bin/touch "$REAL_TMP/qaf-escape-$MARK"
row $G 'write /Users/Shared' deny /usr/bin/touch "/Users/Shared/qaf-escape-$MARK"
i=0
while IFS= read -r p; do
  [ -n "$p" ] || continue
  i=$((i + 1))
  row $G "read secret #$i ($(basename "$p"))" deny /bin/cat "$p"
done <<< "$SECRETS"
row $G 'list the other lane folder' deny /bin/ls "$OTHER_LANE"

# ---- must fail: network
row $G 'connect another stand on loopback' eperm "$NODE" "$PROBE/fence-net.mjs" connect 127.0.0.1 "$DECOY"
row $G 'connect CDP 9222 (shared Chrome)' eperm "$NODE" "$PROBE/fence-net.mjs" connect 127.0.0.1 9222
row $G 'connect the other lane CDP' eperm "$NODE" "$PROBE/fence-net.mjs" connect 127.0.0.1 "$OTHER_CDP"
row $G 'connect loopback ssh 22' eperm "$NODE" "$PROBE/fence-net.mjs" connect 127.0.0.1 22
row $G 'connect internet by IP' eperm "$NODE" "$PROBE/fence-net.mjs" connect 1.1.1.1 443
row $G 'connect proxy upstream directly' eperm "$NODE" "$PROBE/fence-net.mjs" connect 127.0.0.1 "$UPSTREAM"
row $G 'resolve an internet name' deny "$NODE" "$PROBE/fence-net.mjs" lookup example.com
row $G 'dscacheutil answers a name' deny /bin/sh -c '[ -n "$(/usr/bin/dscacheutil -q host -a name example.com)" ]'
row $G 'curl internet by name' deny /usr/bin/curl -s -m 4 -o /dev/null https://example.com
row $G 'docker socket' eperm "$NODE" "$PROBE/fence-net.mjs" unix "$DOCKER_SOCK"
row $G 'listen on a port' eperm "$NODE" "$PROBE/fence-net.mjs" listen 47999
if [ "$KIND" = test ]; then
  row $G 'connect the model proxy (test kind)' eperm "$NODE" "$PROBE/fence-net.mjs" connect 127.0.0.1 "$PROXY"
fi

# ---- must fail: processes, GUI, clipboard, scheduling
row $G 'signal another process' deny /bin/kill -0 "$OTHER_PID"
row $G "read another process's env" deny /bin/sh -c "/bin/ps eww -p $OTHER_PID | /usr/bin/grep -q QA_FENCE_MARK"
row $G "read the parent's env" deny /bin/sh -c "/bin/ps eww -p $OUTER_PID | /usr/bin/grep -q HOME="
row $G 'osascript to Finder' deny /usr/bin/osascript -e 'tell application "Finder" to get name of startup disk'
row $G 'open an app' deny /usr/bin/open -g -a TextEdit
row $G 'read the clipboard' deny /bin/sh -c '/usr/bin/pbpaste; exit $?'
row $G 'launchctl submit' deny /bin/launchctl submit -l "qa.fence.probe.$MARK" -- /usr/bin/true
row $G 'crontab -l' deny /bin/sh -c '/usr/bin/crontab -l'

# ---- must succeed
row $G 'reach the QA gate' allow "$NODE" "$PROBE/fence-net.mjs" connect 127.0.0.1 "$GATE"
row $G 'reach the stand by name (resolve preload)' allow "$NODE" --import "$RESOLVE" -e \
  "fetch('http://shop.qa.tracy.test:$GATE/').then(r=>r.text()).then(t=>{if(!t.includes('shop.qa.tracy.test:$GATE'))process.exit(3)})"
row $G 'read the product source' allow /bin/cat "$SRC/sub/src/a.txt"
row $G 'read the lane key' allow /bin/cat "$LANE_KEY"
row $G 'write own folder' allow /usr/bin/touch "$WRITE_OK/fence-ok"
row $G 'write own tmp' allow /usr/bin/touch "$TMP_OK/fence-ok"
row $G 'run node' allow "$NODE" --version
row $G 'connect own lane CDP' allow "$NODE" "$PROBE/fence-net.mjs" connect 127.0.0.1 "$CDP"

# ---- group 3: the model proxy, reachable from the CLI kind only
if [ "$KIND" = cli ]; then
  P=proxy
  row $P 'CONNECT allowed host:443 (control)' allow "$NODE" "$PROBE/fence-net.mjs" proxy "$PROXY" "$PROXY_HOST:443"
  row $P 'CONNECT host not on the list' refused "$NODE" "$PROBE/fence-net.mjs" proxy "$PROXY" evil.example.com:443
  row $P 'CONNECT bare IP' refused "$NODE" "$PROBE/fence-net.mjs" proxy "$PROXY" 1.1.1.1:443
  row $P 'CONNECT allowed host on port 80' refused "$NODE" "$PROBE/fence-net.mjs" proxy "$PROXY" "$PROXY_HOST:80"
  row $P 'CONNECT odd characters' refused "$NODE" "$PROBE/fence-net.mjs" proxy "$PROXY" "$PROXY_HOST%00:443"
  row $P 'plain HTTP through the proxy' refused "$NODE" "$PROBE/fence-net.mjs" proxy "$PROXY" GET
fi
echo done >> "$OUT.done"
