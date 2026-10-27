# Phase 0 — Provision a clean Joomla 6 + T4 to build on

This packet is for a standalone template built from the blank starter. For a customer website,
read `provision-quickstart.md` and install the selected product quickstart instead.

Stand up a **pristine, running Joomla 6 with T4 already installed**, then take a **git baseline**.
This is the starting point *before* any template work (Phase 1 scaffolds `ja_<name>` from
`t4_bs5_blank`).

**The bundled zip does the whole job.** `assets/t4/t4-framework-for-joomla-6.zip` is not a plugin
package — it is a **complete Joomla 6.1.1 root** that already contains:

- `plugins/system/t4/` — the T4 framework System plugin (v2.5.6)
- `templates/t4_bs5_blank/` — the blank T4 template you clone in Phase 1
- `installation/` — the Joomla web installer, whose `installation/sql/mysql/custom.sql`
  **registers `plg_system_t4` and `t4_bs5_blank` in the database automatically**

So there is **no member-area login, no separate T4 download, and no discover-install step**. Unzip,
run the installer once, and T4 is live.

## Conventions used in this document

| Placeholder | Meaning |
|---|---|
| `<WORKSPACE>` | Directory where you build sites. Defaults to `$JA_WORKSPACE`, else the current working directory. |
| `<SLUG>` | Short project name, e.g. `acme`. The site lives at `<WORKSPACE>/<SLUG>-j6`. |
| `<SITE>` | `<WORKSPACE>/<SLUG>-j6` — the Joomla root. |
| `<TPL>` | The template machine name, `ja_<name>`. |
| `<PLUGIN_ROOT>` | This plugin's root (the folder containing `assets/` and `skills/`). |

**Never** hardcode an absolute path from this document into a script or another reference. Resolve
`<WORKSPACE>` at run time.

## Inputs / defaults (override only if the user says otherwise)

| Thing | Default |
|---|---|
| Joomla version | **6.1.1** — whatever the bundled zip ships |
| Site dir | `<WORKSPACE>/<SLUG>-j6` |
| Local stack | **DDEV** (php 8.3, nginx-fpm, mariadb) |
| Joomla Super User | username `admin`, email `admin@example.com`, **password generated per run** (see below) |
| DDEV DB (host/user/pass/name) | `db` / `db` / `db` / `db` |
| Git | `git init` + one commit as a pristine baseline |

### The Super User password

Joomla 6 enforces **≥12 characters**. Generate one per run and keep it in the session (and in
`<SITE>/.build-credentials`, which the `.gitignore` written in Step 6 excludes):

```bash
JOOMLA_ADMIN_PASSWORD="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20)"
```

Never bake a password literal into this skill, a script, a commit message, or chat output. If the
user supplies their own, use theirs and still keep it out of tool output.

## Step 1 — Resolve the T4 zip

Resolve in this order and stop at the first hit:

1. `$JA_T4_ZIP` — an explicit path the user set.
2. `<PLUGIN_ROOT>/assets/t4/*.zip` — the bundled copy (the normal case).
3. `<PLUGIN_ROOT>/skills/joomlart-t4-template/assets/t4/*.zip` — if the skill was installed
   standalone with its own assets.
4. **Fallback only:** the JoomlArt member area
   (`https://www.joomlart.com/member/downloads/joomlart/t4/t4-framework-new`). Requires a member
   account; drive the web login with Playwright and read credentials from the caller's environment
   (`JA_MEMBER_USER` / `JA_MEMBER_PASSWORD`). **Never echo them.** Use this path only if steps 1–3
   all miss or the user explicitly wants a newer T4.

```bash
resolve_t4_zip() {
  [ -n "$JA_T4_ZIP" ] && [ -f "$JA_T4_ZIP" ] && { printf '%s\n' "$JA_T4_ZIP"; return 0; }
  for d in "$PLUGIN_ROOT/assets/t4" "$PLUGIN_ROOT/skills/joomlart-t4-template/assets/t4"; do
    z=$(ls "$d"/*.zip 2>/dev/null | head -1) && [ -n "$z" ] && { printf '%s\n' "$z"; return 0; }
  done
  return 1
}
```

Verify whatever you resolved before using it — a truncated download is a confusing failure later:

```bash
unzip -t "$T4_ZIP" >/dev/null && echo "zip OK"
unzip -l "$T4_ZIP" | grep -qE 'plugins/system/t4/t4\.php'                && echo "T4 plugin present"
unzip -l "$T4_ZIP" | grep -qE 'templates/t4_bs5_blank/templateDetails\.xml' && echo "blank template present"
unzip -l "$T4_ZIP" | grep -qE 'installation/sql/mysql/custom\.sql'       && echo "installer SQL present"
```

All four must print. If "installer SQL present" is missing you have a plain extension package, not
the full root — that package installs T4 through **System → Install → Upload Package File** instead,
and you must supply a clean Joomla 6 yourself.

## Step 2 — Extract + start DDEV

The zip extracts to a Joomla root **with no wrapper folder**, so extract straight into the dest.

```bash
SITE="$WORKSPACE/$SLUG-j6"
rm -rf "$SITE" && mkdir -p "$SITE"
unzip -q "$T4_ZIP" -d "$SITE"
cd "$SITE"
ddev config --project-type=php --docroot=. --php-version=8.3 --webserver-type=nginx-fpm
ddev start
```

`ddev config` names the project after the folder, so the site is at
`http://<folder>.ddev.site:33000`. `ddev describe` prints it. **Use the http `:33000` URL for
Playwright** — the https URL trips the mkcert untrusted-cert prompt.

## Step 3 — Run the Joomla web installer (Playwright MCP)

`browser_navigate` to the site root; it redirects to `/installation/index.php`. Three accordion
steps:

1. **Site Name** — type the site name (e.g. the template title) → **Setup Login Data**.
2. **Login Data** — real name `admin`, username `admin`, password `$JOOMLA_ADMIN_PASSWORD`,
   email `admin@example.com` → **Setup Database Connection**.
3. **Database** — type MySQLi, host **`db`**, username **`db`**, password **`db`**, database
   **`db`** (overwrite the `localhost`/`joomla_db` defaults; leave the random table prefix) →
   **Install Joomla**.

### Gotcha A — click the accordion buttons via JS, not `browser_click`

The installer is an animated accordion; the three "Next" buttons routinely fail `browser_click`'s
visible/enabled/**stable** wait because the panel is mid-transition. Click them with
`browser_evaluate` instead — reliable and instant:

```js
() => document.querySelector('#step1').click()       // → Setup Login Data
() => document.querySelector('#step2').click()       // → Setup Database Connection
() => document.querySelector('#setupButton').click() // → Install Joomla (also the re-click in Gotcha B)
```

Fill the text fields normally with `browser_type`.

### Gotcha B — the remote-DB verification token (ALWAYS fires under DDEV)

The DB host is `db`, not `localhost`, so Joomla's remote-database security check triggers: a warning
telling you to delete a randomly-named `_Joomla<random>.txt` from `installation/`, then Install
again. Delete it on **both** host and container (Mutagen sync lags), then re-click `#setupButton`:

```bash
rm -f installation/_Joomla*.txt && ddev exec 'rm -f installation/_Joomla*.txt'
```

The filename is random per attempt — glob it, never hardcode it.

### Gotcha C — remove `installation/` deterministically

After "Congratulations! Your Joomla site is ready", `configuration.php` has been written. The
Open Site / Open Administrator buttons remove `installation/` over AJAX, but that click often times
out through the MCP, and **Joomla refuses to run until the folder is gone**:

```bash
rm -rf installation && ddev exec 'rm -rf installation'
```

### Sample data

The installer offers sample data — choose **None / blank**. You author demo content yourself in
Phase 7.

## Step 4 — Confirm T4 came up, then make the blank the default style

`custom.sql` registers the extension rows, so T4 should already be enabled. **Verify rather than
assume:**

```bash
PREFIX=$(grep -oE "public \\\$dbprefix = '[^']+'" configuration.php | grep -oE "'[^']+'" | tr -d "'")
ddev mysql -e "SELECT element,enabled FROM ${PREFIX}extensions WHERE element='t4';"
ddev mysql -e "SELECT id,template,title FROM ${PREFIX}template_styles WHERE template='t4_bs5_blank';"
```

`enabled` must be `1` and the style row must exist.

Then in the admin: **System → Site Template Styles** → select the `t4_bs5_blank` style → **Default**
(the star), so the frontend renders through T4. Verify by navigating to `/` — you should get the
blank T4 shell: unstyled but functional. That shell is what Phase 1 clones into `<TPL>`.

If `enabled` is 0 or the style row is missing, the installer did not import `custom.sql`. Recover
with **System → Manage → Discover → Discover**, select *System - T4* and *t4_bs5_blank*, **Install**,
then enable the plugin under System → Plugins.

## Step 5 — Enable Development Mode (so edits show up)

T4 bundles CSS/JS into `media/t4/optimize/<hash>`; edits do not appear until that cache is cleared.
This is the single biggest time-waster in the whole build (structural fact #2 in `SKILL.md`).

- **Joomla Global Configuration → System → Development Mode = On**, and/or the template style's T4
  **Optimize/Compress** options Off. Source `css/`/`js/` edits then render directly.
- For anything still cached, run `scripts/clear-cache.sh --root <SITE>`. Prefer clearing **inside**
  the container (`ddev exec`) to avoid tripping DDEV's Mutagen sync. Clear before **every** verify
  render in Phase 8.

## Step 6 — Git baseline

Commit the provisioned site so every later phase diffs against pristine. Use the caller's own git
identity — do not set `user.name`/`user.email` on the command line.

```bash
cd "$SITE"
printf '%s\n' '.build-credentials' > .gitignore
git init -q
git add -A
git commit -q -m "Baseline: clean Joomla 6 + T4 (blank template) provisioned"
```

The commit intentionally includes `.ddev/` and `configuration.php` with the local `db/db/db`
values — those are local-only dev credentials, not secrets. The generated admin password lives in
`.build-credentials`, which is excluded.

## After Phase 0

You have a running, committed Joomla 6 + T4 site with the blank template as the default style.
Proceed to **Phase 2 — Ingest & Map** (`references/inputs/spec-pack.md`): turn whatever design input you
were given into a validated spec-pack. Phase 1 scaffolds `<TPL>` from `t4_bs5_blank` (it may run before or after Phase 2).

## Teardown (to redo a run cleanly)

```bash
cd "$SITE"
ddev delete -Oy        # drops the DB + project registration, keeps files
cd .. && rm -rf "$SITE"
```

## Cross-links

- `gotchas.md` — Phase 0 traps (optimize cache vs Development Mode, rename-before-install).
- `t4-anatomy.md` — what is inside `t4_bs5_blank`, i.e. what Phase 1 clones.
- `packaging-quickstart.md` — the same installer mechanism (`installation/sql/mysql/custom.sql`)
  seen from the packaging side.
