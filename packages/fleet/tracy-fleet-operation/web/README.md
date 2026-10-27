# web/ — the web container's image, now that it is the agent's whole shell

Since Plan 3 (`tasks/plan-fleet-mot-dsh.md`) each host has only **one** dsh, and the agent's bash runs
`docker exec -u www-data|nobody -w /site/<label> <label>-web-1`. That means a site's web container
no longer only serves the customer — it is where the agent stands. The three Dockerfiles here are the
upstream image plus exactly what the agent needs: `git`, `ripgrep`, `less`, `jq` (+ `wp` for WordPress), the two users that
`exec` names, and since 06/09 also `node` + `python3` — two enabled agent skills
(`web-clone`, `pptx-html-fidelity-audit`, both in `vendor/tracy/od-skill/skills/`) run scripts with those two
interpreters, not bare shell commands. `emdash.Dockerfile` does not need to add `node`: its base
image (`node:22-slim`) already has it, and (since fix round 1, see just below) already has the right version.

⚠ **`node` is NO LONGER Debian's `nodejs` apt package** (changed in fix round 1, 06/09). Debian
trixie packages `20.19.2`, and that Node version **has no global `WebSocket`** without
`--experimental-websocket` — while `vendor/tracy/od-skill/skills/web-clone/scripts/lib/
system-browser.mjs` calls `new WebSocket(url)` directly, no import, no flag, and that is the skill's
ONLY CDP path (it does not install `playwright`, per the skill's rule). That means three of the four images (only
`emdash` escapes, because `node:22-slim` has `WebSocket` built in) made every `web-clone` script die immediately with
`ReferenceError: WebSocket is not defined` on the first CDP open — an error that `curl` against the CDP port
(how two earlier review rounds "confirmed" it) never sees, because `curl` does not run the skill's code.
The three PHP Dockerfiles + `dev/web.Dockerfile` now download the official Node 22 LTS tarball straight from
nodejs.org, pinned by version + SHA256 (from that release's own `SHASUMS256.txt`), one hash for each
architecture that actually builds this image (`amd64` on fleet hosts, `arm64` on the dev cluster on a Mac) —
see the top of each Dockerfile for the version number and the two pinned hashes.

| File | Base image |
|---|---|
| `wordpress.Dockerfile` | `wordpress:php8.3-apache` (clone), `wordpress:apache` (sites generated on the fleet) |
| `joomla.Dockerfile` | `joomla:5-apache`, `joomla:6-apache`, and `joomla:php8.{0,2,3}-apache` for an upgrade step |
| `emdash.Dockerfile` | `tracy/emdash:<ver>` — the EmDash image `emdash/build-image.sh` built on that same host |

`IMAGE_TAGS` is **the source of `WEB_IMAGE`**: `scripts/lib/web-image.sh` reads it, `render-compose.sh`
writes the result into the site's compose, `set-php.sh` uses it when an upgrade step changes PHP.

Since 06/09 (Task 3c) all four Dockerfiles also add `chromium` + `fonts-liberation` +
`fonts-noto-color-emoji`: the `web-clone` skill (`vendor/tracy/od-skill/skills/web-clone`) drives a real
browser over CDP, and its loader (`scripts/lib/playwright-loader.mjs`) never installs a
browser itself — it only reuses a Chrome/Edge/Chromium already on `PATH`, and the name it looks for matches exactly the
name the Debian package installs (`chromium`), so no symlink is needed. In the old per-site dsh image, the agent had
Chromium bundled with Playwright; this change restores exactly that capability now that the agent's bash
runs in this container instead of a separate one.

## Build

```
bash /opt/tracy-fleet/web/build.sh          # every missing row
FORCE=1 bash /opt/tracy-fleet/web/build.sh  # rebuild
```

Build **on the host**, not on a personal machine: an image stays where it was built and goes nowhere (there is
no registry for them yet).

🔒 **Changing the content of a Dockerfile REQUIRES changing its tag in `IMAGE_TAGS`** — add a new date suffix
if it is a different day, or `-rN` if it is still the same day (`-20260906-r1`, then `-r2`, …). This rule exists because
it was measured: Task 3b and 3c changed the content of two Dockerfiles on the same day, ~12 minutes apart, and both
kept `-20260906` — safe purely because nobody built+shipped either version to a real host
between those two edits, not because the rule was checked. A day on which the first edit HAD reached a host before
the second edit landed would silently change the meaning of a tag that sites had used to provision — exactly what this tag
exists to prevent ("which image is this site running" must have a single, traceable answer).
`build.sh` does not care about the shape of the string after `tracy/web-<platform>:`, so `-rN` needs no change
there.

🔒 **Build BEFORE shipping the scripts.** A site whose compose names an image that has not been built **does not break** — the
resolver warns and keeps the upstream image — but that site's agent has no `rg`, and its grep tool
dies with ENOENT rather than "not found". In other words: skip this step and the site still serves
customers normally and only the agent is broken — exactly the kind of breakage nobody notices for a long time.

⚠ **`web/` must be in `ALLOWED` of `deploy/fleet-receive.sh`** (that script lives in `tracy-infra`,
not in this repo) — requested together with `provision/`. Without it `IMAGE_TAGS` does not reach the
host, and every new site comes up on the upstream image with a `!!` line in the provision log.

## Site mail: the `tracy-sendmail` shim (23/09)

The web image has no MTA, and must not have one: PHP's `mail()` (and the `sendmail` that Joomla/EmDash call) goes
through `web/tracy-sendmail` — an `sh` + `curl` file that holds no key — which POSTs the whole message to
`tracy-web` (`/_site-mail`) with the site's label and token; `tracy-web` decides whether to send it. Contract:
`tasks/todo-mail-site-khach.md`.

| Image | What it installs |
|---|---|
| `joomla`, `wordpress` | shim at `/usr/local/bin/tracy-sendmail` + `/usr/sbin/sendmail`, `conf.d/zz-tracy-sendmail.ini` (`sendmail_path = … -t -i`, checked with `php -r` at build time) |
| `emdash` | shim + `/usr/sbin/sendmail`. EmDash sends through it when the "PHP Mail / local sendmail" provider (`phpmail`) of `emdash-smtp` is selected. Since #803 provisioning selects it automatically: `platform_post_up` checks the shim and the three `TRACY_MAIL_*` variables in the running container and then runs `scripts/provision/emdash/configure-mail.mjs`; if either is missing, provisioning stops and does not report the site ready. Sites built before that do not change by themselves |

All three carry `LABEL tracy.site-mail="v1"`; `scripts/provision/enable-site-mail.sh` refuses to move a site
to an image without this label. The three variables `TRACY_MAIL_URL/LABEL/TOKEN` are written by `render-compose.sh` into every
web service variant; the token lives in the site's `.env` (provisioning writes it; old sites: `enable-site-mail.sh
--label <label>`).

🔒 **The two files enter the image through a build context named `tracy-web-files`** (`COPY --from=tracy-web-files`);
`build.sh` passes `--build-context tracy-web-files=<this folder>`. Typing `docker build` by hand, you must
pass exactly that flag (the top of each Dockerfile has a sample command). Requires BuildKit (default since Docker 23).

🔒 **`build.sh` stamps the inputs onto the image** (`tracy.web.inputs` = sha256 of the Dockerfile + the two files
above). An image for an existing `IMAGE_TAGS` row whose stamp differs → **refused** (input changed but the tag was not —
the 🔒 rule above, now held by a machine); no stamp → treated as already built (images before 23/09). A
`tracy/web-emdash` image with a missing/different stamp → **rebuilt** in place, because its tag is the EmDash version, there is
no `-rN` to change. Test: `test/web-image-mail.test.mjs`.

⚠ **Joomla builds from the repo root.** `joomla.Dockerfile` copies `vendor/joomla/joomlart-t4-skill`, so
`build.sh joomla` uses the repo root as context (from 13/09 to 23/09 it used `web/` and always died with
`"/vendor/joomla/joomlart-t4-skill": not found`). Consequence: the Joomla image can only be built from a repo
checkout, not from a bare `/opt/tracy-fleet/web` — `build.sh` says so plainly when it is missing.

## Image size, after adding `node` + `python3` (06/09)

Measured on `tracy/web-wordpress:test` (Apple Silicon, `aarch64`), built from
`wordpress:php8.3-apache` — `docker inspect --format '{{.Size}}'` (actual image size, not
compressed size):

| | Size |
|---|---|
| Before (only `git ripgrep less jq curl ca-certificates` + `wp`) | 806.4 MB |
| After (+ `nodejs python3 python3-pip` + `pip install python-pptx`) | 946.7 MB |
| Difference | **+140.3 MB** |

`python-pptx` (+ the `Pillow`, `lxml`, `XlsxWriter` it pulls in) is only ~41 MB of that difference — most
of the rest is `nodejs` + the shared library `libnode115` it needs. No other pip package
was added: `web-clone` needs nothing beyond `node` (the skill itself forbids `npm install` for it, its scripts
have no npm dependencies), so there is no extra size on the Node side.

Why Debian's `nodejs` package instead of `COPY --from=node:24-slim`: the base image these Dockerfiles
build on is already Debian trixie, and trixie packages `nodejs` version `20.19.2` — which satisfies "Node 20+" — so
`apt-get install nodejs` directly gives a version matching the glibc/ICU of the image being built. Hand-copying the
`node` binary from another base image (`node:24-slim`) means taking care yourself that the shared libraries it needs (glibc,
ICU, OpenSSL) match the target image — a breakage risk that `apt` handles for free, in exchange for no
significant savings here.

⚠ **The reasoning above is NO LONGER true — fix round 1 dropped this `nodejs` apt package.** The reason (measured, not
guessed): version `20.19.2` has no global `WebSocket`, and that is exactly what `web-clone` needs bare — see the
warning at the top of the file. The official tarball from nodejs.org replaces it; the size table just
below (from Task 3c) is kept as is because it was measured BEFORE the change, while the figures after switching nodejs → the Node 22
tarball are **1676.7 MB → 1810.3 MB, a difference of +133.6 MB** (the official Node tarball carries `npm`,
`corepack`, docs — heavier than apt's minimal `nodejs`).

## Image size, after adding `chromium` for web-clone (06/09, Task 3c)

Measured the same way on `tracy/web-wordpress:test`, built from `wordpress:php8.3-apache`:

| | Size |
|---|---|
| Before (Task 3b: `nodejs python3 python3-pip` + `python-pptx`) | 946.7 MB |
| After (+ `chromium fonts-liberation fonts-noto-color-emoji`) | 1676.7 MB |
| Difference | **+730.0 MB** |

`apt-get install chromium` does not pull just one package: the build log shows it drags in the whole GTK/X11 cluster
(`libgtk-3-0`, `x11-utils`, the Mesa libraries for `swiftshader`) that Debian's Chromium needs even when
running `--headless=new` — that is the main difference, not the Chromium binary itself (the
`chromium` package alone reports an `Installed-Size` of ~293 MB). The two font packages add about 15 MB
(`fonts-liberation` ~4 MB, `fonts-noto-color-emoji` ~11 MB) — without them scripts do not fail,
but `recon-site.mjs`/screenshots get wrong font widths or lose emoji glyphs, a silent
kind of breakage.

**The `playwright` npm package is not installed anywhere** — per the skill's own rule
(`vendor/tracy/od-skill/skills/web-clone/SKILL.md`: "禁止在用户项目里执行 `npm install playwright`"). What is
installed is only the system browser itself, which the skill's loader already knows how to find and reuse.

### Chromium's sandbox cannot run here — and why that is not a configuration error

`docker exec -u www-data` is not root, and this container is granted no extra privileges. Chromium's default
sandbox (unprivileged user namespace) dies immediately with `No usable sandbox!`; installing
the `chromium-sandbox` package (the setuid-root `chrome-sandbox` binary) does not save it either — it still needs to
call `clone()`/`unshare()`, which Docker's default seccomp blocks for a process without extra
capabilities, so the error becomes `Failed to move to new namespace: … Operation not permitted`. Both
were measured directly while doing this work.

The web-clone browser loader (`scripts/lib/system-browser.mjs`) calls `chromium <flags>` directly
and has no `--no-sandbox` flag, nor any way for an environment variable to inject extra flags into that
call. The place where flags can be injected is Debian's own `/usr/bin/chromium` wrapper: it loads every file in
`/etc/chromium.d/` into `$CHROMIUM_FLAGS` before `exec`-ing the real binary — exactly the mechanism Debian built
for this. All four Dockerfiles write a file `/etc/chromium.d/no-sandbox` that adds `--no-sandbox` there,
so the `chromium` command the skill calls **does not change by a single character** and still runs. `chromium-sandbox`
is not installed — it would only cost ~400 KB more for a setuid-root binary that does nothing once
`--no-sandbox` is present.

Confirmed with exactly the flag string `system-browser.mjs` emits (`--headless=new --remote-debugging-port=0
--remote-allow-origins=* --user-data-dir=<tmp> --no-first-run --no-default-browser-check
--disable-background-networking --disable-component-update --disable-default-apps --disable-sync
--metrics-recording-only about:blank`), run as `www-data` in `tracy/web-wordpress:test`:
`curl` against the real CDP port it prints returns `webSocketDebuggerUrl` — exactly what web-clone connects to.

⚠ **`curl` against the CDP port only proves Chromium starts and answers — it does not run the
skill's code.** This is exactly the gap fix round 1 closed: the old notes here (and in `dev/README.md`) called
`web-clone` "done" based on exactly this measurement, while the skill's real code
(`system-browser.mjs`'s `new WebSocket(url)`) had never run on three of the four images (see the
`WebSocket` warning above). Sufficient evidence is running the skill's own `.mjs` code — opening a real
`CdpConnection`, not `curl` against `/json/version`.

### Real evidence, after fix round 1: running the skill's actual `.mjs` code, not `curl`

Copied the `vendor/tracy/od-skill/skills/web-clone/scripts` folder into the running `wpdemo2-web-1`, then ran,
as `www-data`, exactly the skill's code path — `loadPlaywright()` → `launchChromium()` →
`browser.newPage()` (this is the `new WebSocket(...)` call that used to die) → `page.goto('http://127.0.0.1/
wp-login.php')` → `page.evaluate(() => document.title)` → `Target.getTargets`:

```
document.title via Runtime.evaluate: "Log In ‹ wpdemo2 — WordPress"
Target.getTargets -> {"targetInfos":[...,{"type":"page","title":"Log In ‹ wpdemo2 — WordPress",
  "url":"http://127.0.0.1/wp-login.php","attached":true,...}]}
E2E-OK
```

The real page title came back through exactly the `WebSocket` → `CdpConnection` → `Page.navigate` →
`Runtime.evaluate` chain — not simulated, not `curl`. In the same run: `python3 -c 'import pptx;
print(pptx.__version__)'` in `wpdemo2-web-1` returned `1.0.2`, matching the pinned version exactly
(`python-pptx==1.0.2`, see the `pip install` section of each Dockerfile).

### `/dev/shm` must be 512 MB — and sites NOT YET migrated do not get it by themselves

web-clone's Chromium runs **without** `--disable-dev-shm-usage` (`system-browser.mjs` pins its
flag list, and that flag is not in it), while Docker's default `/dev/shm` is **64 MB** — measured live:
`df -h /dev/shm` in a rendered web container returned `64M`. With a real page (not the
`about:blank` the two earlier tasks smoke-tested), a few tabs use it up, the renderer dies with **SIGBUS** and reports
it as *"Renderer process crashed"* — not *"out of shared memory"*. So it takes a round of digging
to find.

`render-compose.sh` writes `shm_size: 512m` for every web service it builds (`tracy_web_confinement`),
so **sites provisioned from now on already have it**. Two places do **not**, and must be fixed by hand:

| Where | How |
|---|---|
| A running site built BEFORE 06/09 | add `shm_size: 512m` to the `web` service in the site's `compose.yml`, then `docker compose up -d web` — **the container is RECREATED**, not restarted: `/dev/shm` is a creation-time parameter, and `docker compose restart` keeps 64 MB while the config file already says 512 MB (exactly the "read the file and it looks fixed, measure and it isn't" shape). |
| The dev cluster in this repo | `packages/tools/tracy-subprocess-docker/dev/compose.yml` and `dev/site.yml` have carried `shm_size: 512m` since 06/09. |

Check by measuring, don't read the file: `docker exec <label>-web-1 df -h /dev/shm` must return `512M`.
