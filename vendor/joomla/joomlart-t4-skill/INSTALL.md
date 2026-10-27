# Install

Three ways to install, all pointing at the same files. Pick the one that matches your tool.

| Tool | Method | Gets agents? |
|---|---|---|
| **Claude Code** | plugin marketplace (§1) | ✅ all 10 auto-register |
| **Claude Code** (no plugin) | symlink the skill folder (§2) | ❌ use the copy-paste dispatch prompts |
| **Codex / Cursor / other CLI agents** | `AGENTS.md` (§3) | ❌ n/a |

Whichever you choose, do §4 (dependencies) — the scripts need them.

---

## 1. Claude Code — as a plugin (recommended)

This registers the skill **and** the ten subagents.

**The repository is private**, so every route below needs credentials: either an SSH key on the
`JoomlArt-Products` org, or `gh auth login`. Without one you get a "repository not found" that looks like a
typo but is an auth failure.

### From GitHub directly

```
/plugin marketplace add JoomlArt-Products/tracy-joomla-template
/plugin install joomlart-t4@joomlart-t4
```

### From a local clone

```bash
git clone git@github.com:JoomlArt-Products/tracy-joomla-template.git
cd tracy-joomla-template
```

```
/plugin marketplace add /absolute/path/to/tracy-joomla-template
/plugin install joomlart-t4@joomlart-t4
```

> The clone directory is `tracy-joomla-template` (the repo name); the plugin inside it is named
> `joomlart-t4`, which is why the install command reads `joomlart-t4@joomlart-t4` —
> `<plugin>@<marketplace>`, both declared in `.claude-plugin/`.

### If the clone fails

**`Permission denied (publickey)`** — your default `github.com` SSH key is not authorised on the
`JoomlArt-Products` org. Check which account it maps to:

```bash
ssh -T git@github.com          # → "Hi <username>!" or "Permission denied"
```

Three ways out:

1. **Use a per-account host alias.** If you keep several GitHub identities, `~/.ssh/config` will have
   something like:

   ```
   Host github.com-work
     HostName github.com
     User git
     IdentityFile ~/.ssh/id_work
     IdentitiesOnly yes
   ```

   Then clone with `git@github.com-work:JoomlArt-Products/tracy-joomla-template.git`. **The alias only
   exists on your machine** — never paste it into shared docs or CI config.

2. **Use HTTPS with `gh`:**

   ```bash
   gh auth login
   git clone https://github.com/JoomlArt-Products/tracy-joomla-template.git
   ```

3. **Add the key to the org** — the durable fix if you work on this repo regularly.

**`repository not found`** — the repo is private, so an unauthenticated request cannot see it. That
message means auth, not a typo. Confirm the repo really is private (it should be):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.github.com/repos/JoomlArt-Products/tracy-joomla-template
# 404 = private and healthy   ·   200 = PUBLIC, which violates NOTICE.md
```

Verify:

- `/plugin` lists `joomlart-t4` as installed.
- Start a new session and ask something conversion-ish — *"convert this HTML bundle into a JoomlArt
  T4 template"* — and the skill should load.
- The agents `t4-page-verifier`, `t4-editability-auditor`, `t4-coverage-auditor`,
  `t4-darkmode-auditor`, `t4-package-auditor`, `t4-design-review-unit`, `t4-chrome-builder`,
  `t4-acm-block-builder`, `t4-override-builder`, `t4-quickstart-parity` are available.

To update: `git pull` in the clone, then `/plugin marketplace update joomlart-t4`.

## 2. Claude Code — as a plain skill folder

If you would rather not use the plugin system. You lose auto-registered agents; the skill's
copy-paste dispatch prompts in `references/build-subagents.md` do the same job.

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/joomlart-t4-template" ~/.claude/skills/joomlart-t4-template
```

Run that from the repo root. Verify:

```bash
test -f ~/.claude/skills/joomlart-t4-template/SKILL.md && echo OK
```

A symlink keeps the skill live as you edit the repo. To uninstall, remove the **link** only —
`rm ~/.claude/skills/joomlart-t4-template` (no trailing slash). Deleting the link's *target* leaves a
dangling skill.

Prefer a copy? `cp -R skills/joomlart-t4-template ~/.claude/skills/joomlart-t4-template` — but
re-copy after every edit.

## 3. Codex, Cursor, and other CLI agents

These do not read Claude Code's plugin or skill format, so point them at the same content through the
convention they *do* read.

**Codex** — clone, then point your working directory at the repo's `AGENTS.md`:

```bash
git clone git@github.com:JoomlArt-Products/tracy-joomla-template.git
cd tracy-joomla-template
cp AGENTS.md /path/to/your/working/dir/AGENTS.md
# or, to keep one copy:
ln -s "$(pwd)/AGENTS.md" /path/to/your/working/dir/AGENTS.md
```

`AGENTS.md` tells the agent to read `skills/joomlart-t4-template/SKILL.md` first and then the phase
packet it names. Everything else — references, scripts, assets — is plain files that any agent with
shell and file access can use.

Codex also needs the Playwright MCP for the live-render phases. In `~/.codex/config.toml`:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
```

**Cursor** — same idea: reference `skills/joomlart-t4-template/SKILL.md` from your project rules, or
symlink `AGENTS.md` into the workspace root.

**Anything else** — there is no magic. `SKILL.md` is the entry point; it names which packet to read
per phase; the scripts run under plain `node` and `bash`.

## 4. Dependencies

### Node (required)

```bash
cd skills/joomlart-t4-template
npm install     # jsdom (parsing) + playwright (live render + the Phase 8b scanners)
npm test        # node --test over scripts/test/*.test.mjs; 81 tests, all green
npx playwright install chromium   # browser binaries for the Phase 8b scanners
```

If you installed by symlink, `node_modules/` lives in the repo folder and is shared — install once.

### Sass (required for Phase 6)

Run `npm ci` in the skill directory to install the pinned Sass version. `compile-scss.sh` uses
that binary first and an existing `sass` on PATH only as a fallback; it never downloads at build time.
The same invocation compiles main, dark and local entries; `--watch` watches all present entries.

### DDEV (for the local DDEV provisioning path)

```bash
ddev version        # confirm DDEV + a Docker provider are installed
```

### Playwright MCP (required)

Phase 0 drives the Joomla web installer through it, Phase 3 drives the T4 megamenu builder, and
Phases 8/8b/10 render and probe every page live. Make sure a Playwright MCP server is connected to
your session.

Running several verify agents in parallel? Give each one its own browser slot (e.g. `pw-1..5` /
`cdp-1..5` in `.mcp.json`) so they do not fight over one browser.

### Design-tool MCPs (only for the matching input)

- **pencil MCP** — required for `.pen` input. `.pen` files are encrypted; there is no fallback.
- **Figma MCP** — required for Figma input. The adapter fails fast rather than guessing values from
  a screenshot.

Neither is needed for HTML, URL or brief input.

## 5. The bundled T4 zip

`assets/t4/t4-framework-for-joomla-6.zip` is a complete Joomla 6.1.1 root with the T4 framework
plugin and `t4_bs5_blank` already inside. Standalone blank-template builds use it directly.
Customer websites instead select a product quickstart using
[`provision-quickstart.md`](skills/joomlart-t4-template/references/provision-quickstart.md),
which describes repository access and release-asset downloads.

Resolution order, if you want to override it:

1. `$JA_T4_ZIP` — an explicit path
2. `assets/t4/*.zip` — the bundled copy
3. the JoomlArt member area — fallback only, needs `JA_MEMBER_USER` / `JA_MEMBER_PASSWORD` in the
   environment

Read [`NOTICE.md`](NOTICE.md) before pushing this repo anywhere.

## 6. Confirm it works end to end

```bash
cd skills/joomlart-t4-template
npm test                                                       # 81 tests, all green

# the ingest path, on the shipped fixture
node scripts/ingest/from-html.mjs scripts/test/fixtures/bundle-min --out /tmp/demo-pack
node scripts/ingest/spec-pack.mjs --validate /tmp/demo-pack     # should FAIL, listing what's missing
```

That last failure is correct and is the point. The validator checks required files **first** and stops
there, so on this stub you get exactly:

```
spec-pack INVALID — 1 problem(s):
  - missing required file: design-spec.md
```

Generate the design-spec and re-run, and it moves on to the substantive checks (page-count floor,
missing views, unresolved slots). A spec-pack only passes once it is genuinely complete.
