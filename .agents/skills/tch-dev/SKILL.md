---
name: tch-dev
description: Develop, fix and debug TCH on a RUNNING surface — the dsh UI in a browser, the Electron window, or the password gate. Use for UI fixes, tracing runtime errors and every before/after measurement, so that each observation is tied to what produced it and other sessions' processes are borrowed, never killed.
---

# Working on a running TCH

This skill is **runtime discipline**, not start-up commands ([`run-dev`](../run-dev/SKILL.md) owns the ports and how to
start things), and not packaging rules.

## One rule, everything else serves it

**Don't trust an observation until you have verified what produced it.**

Four real incidents in one afternoon, not hypotheticals:

- The browser reported **503** for a plugin bundle; `curl` of the same URL returned **200**. Conclusion: "the gateway is
  broken somehow" — wrong. The page was holding a cached `index.html` and requesting a `rev` the server had dropped. It only
  showed once the page itself was asked which `rev` it held.
- After the fix, the Electron window was still red. Conclusion: "still a cache bug" — wrong a second time. Asking the window
  over CDP showed its `rev` **matched** the server exactly, and re-fetching that URL from inside the page returned 200 with
  every byte. It was a start-up timing race, not cache.
- Conclusion: "the materializer does not update itself, the fleet will break" — wrong a third time, and users were warned
  three times on that basis. Reading 20 lines of `profile.ts` in `vendor/tracy/deepseek-harness` showed it **does** compare
  symlink targets and heals itself on every boot. The original observation was only badly timed: measured right after
  `pnpm install`, before any profile had booted.
- A home-made gate reported green (`entries > 0`) while the UI was completely dead, because it counted the graph instead of
  test-loading the bundle.

The common pattern: **one observation → infer a mechanism → wrong.** The cure is not being more careful; it is asking the
running thing directly.

## Ask the running thing directly

For an ordinary browser, use browser tooling. **An Electron window has no address bar**, so open a CDP port:

```bash
cd packages/desktop/tracy-desktop && ./node_modules/.bin/electron . --remote-debugging-port=9333
curl -s http://127.0.0.1:9333/json           # list targets, take webSocketDebuggerUrl
```

Then connect the WebSocket and call `Runtime.evaluate`. Two questions answer nearly every "Failed to load plugins" case:

```js
window.__DSH_BOOT__.rev              // which graph the page holds
window.__DSH_BOOT__.entries.length   // how many client plugins
```

Compare that `rev` with the `rev` the server is serving (read `__DSH_BOOT__` in the HTML fetched from the bare dsh port).
**Equal** means it is not cache — look elsewhere. **Different** means a stale page — hard-reload.

`pnpm start` swallows the CDP flag because of pnpm's `--`; call `./node_modules/.bin/electron` directly.

## The development loop

1. State the desired behaviour and **which evidence will prove it**.
2. Read the relevant code before changing it. For a third-party plugin the source is in `vendor/<name>/` — change it there,
   not in `node_modules`.
3. Verify the surface you are about to observe (next section). Reuse what is running and healthy; start something only when
   nothing fits.
4. **Reproduce the bug before fixing it.** A patch for a bug never seen is a guess with a commit message.
5. Change exactly what was asked.
6. Repeat the **exact** same scenario and compare before/after evidence.
7. Run `node --import tsx scripts/check-boot-graph.ts`, then `pnpm build:check`.

## Verify the surface

```bash
lsof -nP -iTCP:51711 -sTCP:LISTEN          # who holds the port
ps -o pid,lstart,command -p <PID>          # cmdline carries --profile <name>
```

Read the COMMAND column; don't infer ownership from the fact that something listens on the port. Three questions:

- **Which profile?** The dsh cmdline carries `--profile web` or `--profile desktop`.
- **Whose session?** When the process started (`lstart`) compared with your own last start. Several agent sessions may run
  in parallel on the same repo on one machine.
- **Which code is running?** `node -p "require('./tch/profiles/web/node_modules/<package>/package.json').version"`.
  Reinstalling a package does **not** restart the running process: it still holds the old code in memory. This once made a
  patch "still work" after it had been deleted on disk.

**A headless Chrome started for measuring MUST carry `--disable-features=MacAppCodeSignClone`** (macOS). Chrome copies the
whole app bundle (1.4 GB) into `$TMPDIR/../X` on every start and deletes it only on a clean exit; a probe killed with
SIGKILL leaves the copy behind. A dev machine was once down to 846 MB free from 129 such copies piled up over three days.
The two probes in `scripts/` already carry the flag — copy them, don't write a new `spawn` call from memory.

## Borrowed processes

**Don't kill what you did not start.** Other agent sessions on the same machine run `run.sh` too, and killing them has
happened many times — each time someone lost the surface they were in the middle of measuring.

Before killing anything: identify the owner, and if it is not yours, **borrow** it — observe on that very process. Restart
only when new code truly has to be loaded into memory, and say that you did.

The Electron app follows the same rule: it kills only the dsh process it started itself, and leaves someone else's
`./run.sh desktop` session alone.

## Handover

Leave healthy processes running — yours and others'. Report what you observed, **on which port, served by which PID**, and
where the evidence is. "It works now" without the port and version you checked is not a verified claim.
