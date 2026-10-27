# @tracy/dsh-subprocess-docker

## Why it exists

`ctx.subprocess` for a dsh that serves many sites from one process.

`@deepseek-ai/dsh-subprocess-local` spawns on the harness host, so every shell the agent runs sees
the harness's own filesystem and every site it can reach. Tracy used to answer that with one dsh
container PER SITE (a "lane"): 270 MB and a plugin tree per site, seeded one by one. This provider
is what lets ONE dsh serve them all — the command runs inside the site's own web container, so the
kernel, not a JavaScript check, keeps one site's shell out of another's files.

## How a command finds its container

`src/route.mjs` reads the site label out of the spawn's `cwd`, and never out of argv or env. That
cwd, however, is not always the session's own: dsh's `tool-bash` passes a model-supplied `workdir`
verbatim as the spawn cwd, and `terminal_open` does the same with `cwd`. Inside `sitesRoot` such a
path names a real site folder, so two defenses — and only two — keep a seat inside the site it was
granted:

1. **The stamped root.** `@tracy/dsh-sandbox-docker`'s `confine()` stamps the policy's
   `workspaceRoot` — the seam's own resolution of the session cwd, not a model argument — next to
   the mode. `execArgv` refuses a cwd whose site label differs from that root, and refuses any
   `..` segment, which would keep the label while climbing into another site.
2. **The pre-execute guard.** The provider registers a `tools/pre-execute` listener that denies a
   `bash` or `terminal_open` call whose absolute working directory names another site, before the
   tool dispatches. The decision is `workdirDecision()` in `src/route.mjs`.

`danger-full-access` never reaches `confine()`, so it carries no stamp at all: **for that mode the
pre-execute guard is the only defense there is.** Conversely, defense 1 is the only one that covers
a tool the guard's table does not know about — a tool that takes a working directory under some
third argument name is covered by neither, so the table has to grow with dsh.

A cwd outside `sitesRoot` is refused by both, never run on the harness host.

## The path fence — the boundary that has nothing to do with subprocesses

The two defenses above fence the SHELL. **dsh's own filesystem tools never go near them.** `read`,
`write`, `edit`, `read_image` (`@deepseek-ai/dsh-tool-fs`), `glob`, `grep`
(`dsh-tool-fs-search`) and `str_replace_editor` run *in the dsh process*, and on a host dsh that
process has every site mounted at `/site` and its own `/desk-home`: the seat book,
`dsh-passwords.env` (`MCP_SEAT_SECRET`), `.credentials.yaml` (the model keys). Their backend,
`@deepseek-ai/dsh-fs-sandbox`, fences the two MUTATIONS by mode and says so in its own header —
*"reads pass through untouched: every mode permits reading"*. So before this fence, a `read-only`
guest on one site could read another customer's `wp-config.php`, and any seat could read the key
that mints sessions for every site on the host.

`registerPathFence()` closes that, **independently of sandbox mode**, for every tool call:

| Tool | Fenced arguments | Skipped as content |
|---|---|---|
| `read`, `read_image` | `file_path` | — |
| `write` | `file_path` | `content`, `sandbox_permissions`, `justification` |
| `edit` | `file_path` | `old_string`, `new_string`, `sandbox_permissions`, `justification` |
| `str_replace_editor` | `path` | `file_text`, `new_str`, `old_str`, `insert_line`, `view_range` |
| `glob` | `path`, `pattern` | — |
| `grep` | `path` | `pattern` (a REGEX — `/etc/` is an expression), `include` |
| `bash`, `pwsh` | `workdir` | `command`, `description` |
| `terminal_open` | `cwd` | — |
| anything else | any string argument containing `/` **that resolves to a path which exists** | — |

Each candidate is resolved (relative against the session's own cwd) and then `realpath`ed, because
a symlink *inside* one's own site can point at another — the label comparison in `workdirDecision`
cannot see that, and this one can. A declared path argument is fenced **even when it does not
exist**: resolution climbs to the nearest existing ancestor, which is what refuses
`write /desk-home/cordis.patch.yml` — a file the next boot of dsh would read as a plugin layer. An
undeclared argument is fenced only when it really names something, so a todo item with a slash in
it costs nothing.

`/desk-home`, `/opt/dsh` and `/site/<other-label>` are all refused by the same rule: anything that
is not inside `<sitesRoot>/<the session's label>`.

**The table is pinned to dsh, not copied from it once.** `test/fs-tool-schemas.test.mjs` reads the
tool definitions in `vendor/tracy/deepseek-harness/packages/{fs,shell,terminal}/…/src` and fails when a
tool they register with a path-shaped argument is missing from this table, or when an argument is in
neither list. That is how `pwsh` was found on 06/09: it takes the same model-chosen `workdir` as
`bash` and was in neither fence. An argument that only *reads* like a path (`view_range`,
`insert_line`, a `description` whose prose says "path") goes in the content column — either column
is a decision on record; absence from both is an oversight the test refuses.

**Why here and not in a plugin of its own.** It is not a subprocess concern. It is here because
this row already answers the question the fence needs — which site does this session belong to —
and is already loaded wherever the fs tools are: every profile that composes `tool-fs` composes
this provider. A sibling plugin would need a new row in `@tracy/dsh-native-bundle`, in the image
and in twelve presets before it fenced anything, and a fence that is not loaded is worse than no
fence, because the map claims it is there.

**Every denial is logged, once, as one line — on STDERR.** A refusal only the model can see is invisible to the
person running the host — the tester's round-2 pass read `docker logs tracy-dsh` after three refused
reads and found nothing at all, which makes "the fence denied it" and "the tool broke" look
identical from outside. Both guards now write:

```
subprocess-docker: DENY guard=path tool=grep arg=path site=wpdemo requested="/site/wpdemo2" resolved="/site/wpdemo2" reason="subprocess-docker: grep path …"
```

Paths, the tool, the argument and the session's site label — and nothing else. Not the file, not the
search pattern: a denial is an event to correlate, not a copy of what the model was reaching for.

The channel is `console.error`, deliberately: `docker logs tracy-dsh | grep 'DENY guard='` is the
check this README and `HOST-DSH.md` hand to an operator, and `docker logs` shows the container's own
stdout/stderr and nothing else. Routing the line through `ctx.logger` alone did NOT reach it —
measured 06/09, two confirmed denials and a twelve-line container log with neither in it, because
dsh's logger has its own level and its own destination. The logger is still called as a second sink
for deployments that collect that stream; it is never the only one.

**What it does not cover.** The gateway's own surfaces (`folderAllowed()` in `dsh-passwords`) are a
separate fence with a separate list, and the workspace picker browses the filesystem through it —
this one only sees tool calls. And it is a JavaScript check in the same process as the data, not a
kernel boundary: `/desk-home` remaining visible to that process at all is a residual the mount
layout, not this table, would have to fix.

## Pairing

This package and `@tracy/dsh-sandbox-docker` are one mechanism in two rows, and they are replaced
together. The provider asserts it at boot (`static inject = ['sandbox']`, then an
`instanceof DockerSandbox` check): paired with any other sandbox, dsh refuses to start with

```
subprocess-docker: ctx.sandbox must be @tracy/dsh-sandbox-docker (the mode stamp comes from it); found …
```

That is deliberate. Without the assertion the argv would simply arrive unstamped, every confined
command would run as `www-data`, and nothing would say so — a silent downgrade instead of a boot
error.

When this package enters a bundle, the bundle must NOT also insert the row that this package's own
`cordis.patch.yml` inserts. Two rows with the id `tracy-subprocess-docker` is a duplicate id, and
dsh refuses to boot on it.

## Configuration

| Key | Default | What it is |
|---|---|---|
| `sitesRoot` | `TRACY_SITES_ROOT`, else `/site` | Directory holding one folder per site label, on the harness side. Absent from the row, the provider reads `TRACY_SITES_ROOT` from the environment the harness was started in (how a dev machine points at its own tree), then falls back to the fleet's `/site`. |
| `containerRoot` | `/site` | The same directory as the web container sees it. |
| `containerName` | `{label}-web-1` | Container name template; `{label}` is the site label. |
| `docker` | `docker` | The docker CLI. |
| `dockerHost` | unset | `DOCKER_HOST` for the CLI, when the containers live on another host (`ssh://root@…`). |

A relative or empty `sitesRoot` throws at boot, not at the first command. No cordis file needs a
`!!js` expression for it: that tag makes a `cordis*.yml` unparseable to the plain js-yaml the
`check-self-contained` gate reads it with.

## What the web container must have

- The exec user `www-data` (for `workspace-write` and unconfined calls). `nobody` is still the
  user `execTarget` names for `read-only`, but since 09/10/2026 a `read-only` seat runs no command in
  the container (`READ_ONLY_SHELL_REFUSAL`): as `nobody` it could not write a file, yet PHP could read
  Joomla's `configuration.php` and write the database with it.
- The tools the agent expects on its PATH: `bash`, `git`, `ripgrep` (`rg`), `less`, `wp`, `php`.

## Known limits

- `inspectForeground()` on a terminal reports the docker CLI's process group, not the shell's
  inside the container. Ctrl-C still works: with `-t` the ^C byte travels the pty.
- The exec user is `www-data`, and nothing finer; the mode is not a per-path policy.
- A command sees the container's environment minus the secrets every exec blanks (`BLANKED_SECRET_ENV`
  in `src/route.mjs`). An editor's command keeps `WORDPRESS_DB_PASSWORD`, which wp-cli needs. That
  crosses no site: each site's MariaDB is its own server holding only its database. A database user of
  the agent's own was weighed and not built — it would still need read and write on every site table.
- Terminating the docker CLI (timeout, abort) does not terminate the process inside the container:
  `docker exec` forwards no signals. That is what the ORPHAN REAPER answers — see below. What is
  left after it: a process that re-execs with a scrubbed environment escapes the scan.
- Environment tombstones are dropped. The seam reads an `undefined` env value as "remove this
  ambient entry from the child", but `docker exec` can only add variables (`-e KEY=VALUE`) — it
  cannot unset one the image already defines, so the image's value survives.
- The `-e KEY=VALUE` flags are visible on the harness host, in `ps` and in `docker inspect`. That
  is acceptable only because the host is Tracy's own and no seat has a shell on it; real secrets
  belong in the image or a mount, not in a command's environment.
- A command the KERNEL kills in the container comes back as a bare exit 137. Since 28/09/2026 every
  site container has a memory cap (`provision/render-compose.sh` `tracy_site_limits`), and going over
  it is exactly that: the kernel SIGKILLs the biggest process, and dsh's bash tool would print only
  `[exit code: 137]`. `explainKill()` answers it (`src/kill-note.mjs`): after a 137 that no timeout or
  abort of ours caused, one more exec reads the container's `memory.max` and `memory.events`, and a
  line after the command's stderr tells the agent the cap and how many processes the kernel killed
  for memory — "most likely" this command, because the count is the container's since it started.
  A probe that fails adds nothing.

## The orphan reaper — how termination reaches inside the container

`docker exec` forwards no signals, and the harness has no pid inside the container to send one to.
So termination is done with a second exec instead:

1. Every spawn is tagged. `execArgv` appends `-e TRACY_EXEC_ID=<uuid>` as the LAST `-e` flag, so a
   command asking for a variable of that name cannot displace the marker.
2. On termination — `handle.terminate()` **and** the spec's abort signal, which is the path a tool
   TIMEOUT takes and never touches the handle — the provider runs
   `docker exec -u <same user> <same container> sh -c '<scan>'`. The script walks `/proc`, matches
   `/proc/<pid>/environ` against the marker, sends `TERM`, waits `REAPER_GRACE_SECONDS`, then
   `KILL`s the survivors. It exits `REAPER_NOTHING_FOUND` (9) when nothing carried the marker. The
   exec user owns its own processes, so no root is involved and `read-only` (`nobody`) reaps itself
   the same way.
3. A sweep that finds nothing **within `REAPER_RETRY_DELAY_MS` of the spawn** is asked once more
   after that delay: `docker exec` is a create-then-start round trip, so a command terminated in
   its first millisecond can be swept before its process exists in `/proc`. The retry never
   retries.
4. A command (`spawn`) is ALSO swept when it exits, cleanly or not (since 09/10/2026). Its own
   process is gone by then, but a child it backgrounded (`cmd &`) still carries the marker — and a
   loop such as `while :; do ln -sfn …; done &` could otherwise keep swapping a link between the
   path fence's check and dsh's own open long after the tool call returned. The cost is one small
   exec per command; the tool result never waits for it. Terminals are swept on `terminate()` and
   abort, as before — a tab's shell exiting reaches `terminate()` through the local runtime.
5. It runs at most once per spawn, never blocks the caller (`terminate()` returns nothing, the CLI
   is `detached`+`unref`ed, and every timer is ours and `unref`ed — `child_process`'s own `timeout`
   option keeps a REF'D timer and would hold a shutdown for the whole bound), and every failure is
   logged with the marker in it — never thrown.

What it does NOT catch, and each of these leaves a live process:

- a process that re-execs with a scrubbed environment (`env -i`, a daemon clearing its own) — the
  marker is gone and the scan cannot see it;
- anything the exec user may not read: a process that dropped privileges is non-dumpable, and its
  `/proc/<pid>/environ` is unreadable even to the same user (measured — apache's own workers);
- a process that appears after the SECOND sweep — the retry narrows the create-then-start race, it
  does not close it;
- a background child that scrubs its environment (`env -i sh -c '…' &`) or detaches into a
  process the exec user cannot read — the exit sweep above catches every other one, but only once,
  when the command ends;
- anything started after the sweep, and the synchronous host-exit path (`terminateForHostExit`),
  which cannot wait for a docker CLI at all;
- a harness that exits mid-sweep. Nothing about the reaper may delay a shutdown, so an unfinished
  sweep is the accepted trade.

**A closed Terminal tab is not an immediate reap, and the delay is not this package's.** The reaper
runs when someone calls `terminate()`, and for a sidebar terminal that is `PtyManager.close()` →
`SubprocessPty.kill()`. A tab whose socket merely DROPPED — a closed browser tab, a refresh, a
crash — does not reach `close()` right away: `dsh-better-sidebar` schedules it after
`reconnectGraceMs` (default **30 s**, `vendor/tracy/dsh-better-sidebar/src/config.ts`) so a quick
reconnect keeps the shell. So `/bin/bash -l` legitimately stays alive in the site container for up
to that grace, and only then is swept. A tab closed properly — the view sends a `{type:'close'}`
frame — schedules at 0 ms and the shell is gone within seconds (TERM + `REAPER_GRACE_SECONDS`).
Measured 06/09 through the gateway with a real WebSocket client: on a bare drop the shell was still
there at t+30 s and gone by t+35 s; with the close frame, gone by t+4 s. Watching the first case and
concluding "the reaper missed it" is the mistake this paragraph exists to prevent — nothing had
asked the reaper to run yet.

`TRACY_EXEC_ID` is **visible inside the container** — the agent's own `env` prints it, as does
`/proc/self/environ`. It is a random uuid that names one exec and grants nothing: knowing it lets a
command reap itself, which it could do anyway. It is also visible on the harness host, like every
other `-e` flag (see the limit above).

## Running it locally

See `dev/README.md` for the dev containers, `TRACY_SITES_ROOT`, and the profile patch that puts
this provider and `@tracy/dsh-sandbox-docker` in place of dsh-base's two rows.

## Quickstart sites: one refusal, the rest is recommendation

The provisioner creates `.content-contracts/<label>.json` under `sitesRoot`, outside all individual
site roots, for a site built from a quickstart that carries a content contract. Since 26/09/2026
(Lee) the marker locks nothing: shell, terminal and file tools work as on any other site, and the
contract's slots are guidance for keeping the quickstart's design. The one thing such a site refuses
is a shell command that writes its database directly — SQL through `mysql`/`mariadb`/`psql`/`sqlite3`,
`wp db query` with a write, `wp db import|reset|clean|drop|create`, or a raw query from `php -r` /
`wp eval` (`directDbWriteReason` in `src/content-contract.mjs`). It is a text match, so it is a rail
plus a reason, not a wall. Host migrations must still copy the marker: it names the site's contract.

## Approvals: answered on the host, never left waiting

dsh asks for a human decision in two cases: a `bash`/`pwsh` command or a file write retried with
`sandbox_permissions` (a wider sandbox mode for that one call), and a `tools/pre-execute` listener
answering "ask". The question travels the `approval/request` waterfall to the browsers on the host's
`$events` stream and waits there with no timeout. No seat's browser ever shows it:
`dsh-passwords` forwards no approval frame to a seat. Measured 29/09/2026 on the bench, one
escalation held a turn for 643 s.

Two things close it, and each covers what the other cannot:

1. **`@tracy/dsh-native-bundle` pins `approval: never`** on every new session (its `approval` and
   `permission` rows). dsh then decides before any answerer runs, and tells the model not to ask.
2. **`registerApprovalAnswer()` answers `rejected`**, prepended ahead of dsh's forwarder, for a
   session that still carries the `ask` it was pinned before those rows existed — a session's
   policy lives in its own log, and no configuration reaches it.

Rejecting costs nothing here: a wider mode grants nothing on this host (the command runs as
`www-data` in the site's container either way, `EXEC_USER`), and every Tracy guard refuses rather
than asks (`registerApprovalGuard`). `test/approval-answer.test.mjs` runs dsh's own approval service
against a forwarder that never answers, and shows both the wait and its end.

## Long `bash` output: bounded for the model, kept whole in the spill store

Every tool result is re-sent on every later step of a conversation. dsh gives `bash` no cap of its
own, and dsh-base's `spill-policy` (12,500 tokens, about 50,000 characters) is one cap for every tool
that Tracy's site answers are budgeted under, so it cannot come down for `bash` alone.
`registerOutputBound()` bounds the model's copy of a top-level `bash` result (`src/output-bound.mjs`):

- a line over 2,000 characters keeps its start and says how long it was;
- an output still over 12,000 characters keeps its head and tail by whole lines and counts the rest;
- the exit, signal, timeout and sandbox markers stay the last lines;
- one line names the whole output, saved through `ctx.spillStore` in the session's own spill folder
  (which the path fence lets that session's `read` and `grep` open, `readsOwnSpill`), and says how to
  print one part of a long line.

When the output cannot be saved, nothing is cut. Measured on 2,255 bench `bash` calls (24/09–05/10/2026):
55 change (2.4%) and lose 17% of all `bash` characters — minified CSS and HTML, one-line JSON blobs.
`test/output-bound.test.mjs` pins the rules.
