---
name: run-dev
description: Run TCH locally — bootstrap dsh from source, the web profile, the desktop profile, the Electron app. Use when asked to start dev, preview a change, or open the UI in a browser, so you hit the right port and don't measure another session's process by mistake.
---

# Run TCH locally

This skill covers **starting up** — commands and ports. Once it is running and you are about to observe, debug or
measure, the discipline lives in [`tch-dev`](../tch-dev/SKILL.md): verify what produced an observation before
trusting it, and borrow another session's processes rather than killing them.

## Ports — read before starting anything

| Port | What | Notes |
|---|---|---|
| 51710 | dsh, `web` profile | going straight here **skips sign-in** |
| **51711** | password gate of `web` | **this is where users actually enter** |
| 51720 | dsh, `desktop` profile | |
| 51721 | password gate of `desktop` | |
| 51730 | dsh, `native` profile | the Electron app (no origin) proxies through here |
| **51731** | password gate of `native` | the Electron app window points here |

Ports are read from each profile's `cordis.patch.yml` and `MCP_GATEWAY_PORT` in `.env.<profile>` —
**don't retype the numbers anywhere else**; one mismatch and dsh listens on one port while `--trusted-host` declares
another, and every request is refused without a single log line saying why.

**The bare dsh port trap.** 51710 and 51720 answer like the real thing, the UI loads normally — only
nobody has to enter a password. A "local test passed" there does not prove the password gate
works. Measure through the port you mean to measure.

## Starting up

The first time on a clone — or after every change of the submodule pointer — you must **bootstrap** first.
There is no registry to download dsh from: `@deepseek-ai/*` are workspace members, built from source.

```bash
git submodule update --init          # vendor/tracy/deepseek-harness — everything after needs it
pnpm dsh:build                       # build lib/ of the 410 dsh packages + the SPA it serves itself (~90s)
pnpm install                         # npmjs, no token, no private registry
```

⚠ **ORDER, not preference: `dsh:build` BEFORE `install`.** That step runs pnpm inside the submodule,
and that install claims the 410 member packages too — it points each package's `node_modules` at the
SUBMODULE's store. Run it after `pnpm install` and it silently replaces the links the root install just built, most
visibly `fs-ext`: the compiled binding exists only in the root store, so dsh dies at boot with
`Cannot find module './build/Release/fs_ext.node'`. Neither `pnpm install` nor `pnpm install --force` at the root
undoes it (measured on a clean clone 06/09).

In the right order the root install handles the rest: relinking members, compiling `fs-ext`, creating
`node_modules/.bin/dsh` (only possible once `lib/bin.js` exists), and building `vendor/tracy/dsh-passwords` through
its `prepare`.

```bash
./run.sh web                                     # dsh 51710 + password gate 51711
./run.sh desktop                                 # dsh 51720 + password gate 51721
cd packages/desktop/tracy-desktop && pnpm dev    # Electron app — read the package README first
```

`run.sh` **refuses to start when a port is busy**, and that is deliberate: a leftover old dsh process still
answers HTTP like the real thing, so `curl` looks successful while the instance you just started has died with
`EADDRINUSE`. Find the port's owner first; don't kill blindly:

```bash
lsof -nP -iTCP:51710 -sTCP:LISTEN
```

**Electron app: read [`packages/desktop/tracy-desktop/README.md`](../../../packages/desktop/tracy-desktop/README.md)
before running it** — `pnpm dev` / `pnpm debug`, `TRACY_DESKTOP_ORIGIN` / `TRACY_DESKTOP_INSTANCE`, one profile per
worktree × origin × instance (no shared cookies), one process per profile,
`runtime.json` (pid, dynamic CDP port — never 9222), the Playwright helper `test/e2e/launch.mjs`.
Without an origin the app wraps the **`native`** profile and **borrows** a running `./run.sh native` (password
gate 51731) instead of spawning a second one; in that case **quitting the app does not stop dsh**, because the app only kills what it spawned itself.

## Signing in

`admin` / the password in SQLite (`data/platform.db`, table `users`, bcrypt). No password
lives in the repo.

dsh alpha.1 additionally requires a one-time **launch token** per browser: it only issues the cookie
`dsh-auth-<host:port>` when you open `/?token=<token>`. The token is random on every dsh run;
`run.sh` writes it to `tch/profiles/<profile>/.launch-token` (chmod 600).

```bash
open "http://127.0.0.1:51711/?token=$(cat tch/profiles/web/.launch-token)"
```

The cookie lives 30 days because the signing key is fixed, so you only do this once per browser — even
when dsh restarts and the token changes.

## HARD-RELOAD after changing the plugin tree

Installing a plugin, changing a version, enabling/disabling a row in `cordis.patch.yml` — all change the `rev`
of the plugin graph. `index.html` embeds that `rev`, but dsh serves it **without `cache-control`**,
so the browser caches it heuristically and then asks for a `rev` the server no longer serves.

The symptom is **"Failed to load plugins"** — it looks exactly like a real plugin load error, and it cost
a whole afternoon on 30/08 to recognise. `cmd+shift+r` fixes it. The Electron app already forces a fresh
main document, so it is not affected.

## Quick checks before trusting anything

```bash
pnpm build:check                    # every gate, including check-boot-graph (boots real dsh)
node --import tsx scripts/check-boot-graph.ts   # just the heaviest gate
```

`check-boot-graph` is the **only** gate that boots real dsh. It catches exactly the failure every other
source-reading gate misses: a plugin tree correct to the letter while the runtime delivers an empty graph.
