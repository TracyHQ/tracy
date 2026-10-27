# tracy-webroot-read — the agent's tool for READING a CMS site

A **host-side** dsh plugin. It gives the agent two read-only tools on the site's webroot:

| Tool | Returns |
|---|---|
| `tracy_site_profile` | platform, version, table prefix, themes, plugins, mu-plugins |
| `tracy_find_definition` | file + line declaring a post type / taxonomy / shortcode / block / option / hook |

## Why it exists

The agent already has `bash` and `glob`, so in theory it can find things itself. In practice, measured
in a real session (30/08): to answer *"how much content does this site have and which files define
it"*, the agent ran a long chain of `glob`/`bash`, **one `glob` exceeded the subprocess seam's 20 MB
ceiling and failed**, and the customer saw nothing but raw JSON. This tool turns that chain into
**one ~2-second call**.

## 🔒 Scope: READ ONLY

This plugin writes nothing. The agent writes to a site through four other branches, each with its own
fence ([`SYSTEM.md`](../../../SYSTEM.md) §4; the Worker and `seats.tracy.ai/.../reskin` were retired on
16/09/2026, and no agent path calls `webroot-edit.sh` any more):

| Branch | Goes through | Fenced by |
|---|---|---|
| Shell commands (`bash`) | `docker exec` into the site's own web container | the `tools/pre-execute` guard of `tracy-subprocess-docker` |
| dsh file tools (`write`, `edit`, …) | the `/site/<label>` mount in the `tracy-dsh` process | the `FS_TOOL_ARGS` path fence in `tracy-subprocess-docker/src/route.mjs` |
| CMS content (`tracy_site`) | `POST /api/sites/:key/apply` on `tracy-web` → the Claude Cowork plugin in the CMS | seat, toolset, write lease; undone with `apply.revert` |
| EmDash MCP, look changes through file tools, `look.revert` | write, then report `POST /api/sites/:key/changed` | each branch's own door |

Every chat turn becomes a commit in the webroot's git repo, and the Site changes tab reads it back from
there ([`SYSTEM.md`](../../../SYSTEM.md) §5) — no separate write door is needed.

Two rules that must not be broken:

1. **Do not add a write tool to this plugin.** A fifth write path goes through none of the fences above,
   and its writes would not appear in Site changes.
2. **Never return a secret.** `wp-config.php` and `configuration.php` hold the database password and
   keys; the tool reads out only the exact field it needs (section below).

## Three wrong assumptions, found by running it for real

All three made the tool answer **wrong with confidence** — worse than no tool. They are kept here so
nobody "cleans them up":

1. **Constants, not literals.** Well-written WordPress code almost always does
   `define('TRACY_CPT','catalog_item')` and then `register_post_type( TRACY_CPT, … )`. The first version
   matched only quoted strings, so it missed exactly the most careful codebases. It now searches in two
   phases: constants first, then the calls.
2. **Scan order is correctness.** `wp-content/plugins` alone has **4651 .php files**, while
   `mu-plugins` has only **12** — and mu-plugins is where Tracy declares post types. A breadth-first
   walk in directory order hits the ceiling before getting there. `wp-admin`/`wp-includes` are skipped
   entirely: WordPress core declares no customer post types.
3. **`$table_prefix` is often not a literal.** The official Docker image writes
   `getenv_docker('WORDPRESS_TABLE_PREFIX','wp_')` — the shape of every site built from that image, the
   fleet included.

And one safety rule: `wp-config.php` holds `DB_PASSWORD`, `AUTH_KEY` and seven other secrets.
**Read out only the table prefix.** A tool that returns wp-config's contents is a tool that leaks
credentials into the model's transcript.

## Install

```
dsh plugin --profile web add @tracy/dsh-webroot-read
```

By default the tool reads the session's `cwd`. Point it elsewhere with config:

```yaml
- id: tracy-webroot-read
  name: tracy-webroot-read
  config:
    webroot: /var/www/html
```

It depends on `@deepseek-ai/dsh-tools`, which only resolves from dsh's own `node_modules` at run time —
so `node index.js` on its own reports `Cannot find package`. That is normal, not a bug.

## Not done yet

- **Joomla is at detection level only.** `tracy_site_profile` reads the version, components and
  templates; `tracy_find_definition`'s patterns are still WordPress's, so this tool is hidden from the
  agent on Joomla sites (`PLATFORM_ONLY_TOOLS` in `tracy-site-tools/src/host/surface.mjs`, 09/10/2026)
  — before that it answered "not found" with confidence. Joomla declares extensions in XML manifests,
  which need a pattern set of their own.
- **No database access.** Content counts and post lists live in the DB. `wp-cli` is in the fleet image
  but not on the dev machine, so this first slice deliberately does not depend on it.
- **No write tool, and none needed:** the four write branches above are enough.
