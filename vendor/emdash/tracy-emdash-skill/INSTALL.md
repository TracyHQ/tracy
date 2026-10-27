# Install

Three ways in, all pointing at the same files. Pick the one that matches your tool.

| Tool | Method | What you get |
|---|---|---|
| **Claude Code** | plugin marketplace (§1) | the skill, discoverable by name |
| **Claude Code** (no plugin) | symlink the skill folder (§2) | the same skill, no marketplace |
| **Codex / Cursor / other CLI agents** | [`AGENTS.md`](AGENTS.md) (§3) | the same files, read directly |

Whichever you choose: §4 proves the install in one command, and §5 is only needed to run the kit's tools.

**The repository is private**, so every route below needs credentials: an SSH key on the
`JoomlArt-Products` org, or `gh auth login`. Without one you get a "repository not found" that
looks like a typo but is an auth failure.

---

## 1. Claude Code — as a plugin

```
/plugin marketplace add JoomlArt-Products/tracy-emdash-template
/plugin install tracy-emdash-template@tracy-emdash-template
```

From a local clone instead:

```
git clone git@github.com:JoomlArt-Products/tracy-emdash-template.git
/plugin marketplace add ./tracy-emdash-template
/plugin install tracy-emdash-template@tracy-emdash-template
```

## 2. Claude Code — as a plain skill folder

```bash
git clone git@github.com:JoomlArt-Products/tracy-emdash-template.git ~/src/tracy-emdash-template
ln -s ~/src/tracy-emdash-template/skills/tracy-emdash-template ~/.claude/skills/tracy-emdash-template
```

Inside a repository that vendors this tree, point the link at the vendored copy instead, so one
checkout is the single source of truth.

## 3. Codex, Cursor, other CLI agents

Clone the repository and hand the agent [`AGENTS.md`](AGENTS.md). It names the router
(`skills/tracy-emdash-template/SKILL.md`), the phase flow and the commands. No plugin format is
involved.

## 4. Check it landed — one command, five seconds

```bash
node skills/tracy-emdash-template/scripts/ingest/detect-source.mjs https://example.com/
```

It needs no dependencies and writes nothing. Point it at any site and it answers the four
questions the skill asks before anything else: which CMS this is, whether JoomlArt's T4 is in
front of it, whether the source is within **reach** (this machine, or HTTP only), and what the
package should be called. Output like this means the install is good:

```
CMS        : joomla (score 9)
T4/ACM     : yes — page sections are ACM modules with named fields
reach      : remote (HTTP only — the database is out of reach)
name hint  : ja-kinetic → packages/cms/tracy-emdash-theme-ja-kinetic
road       : rendered-ask — …
```

It is also the first command of a real run: `SKILL.md` §Getting started reads its answer and picks the
road from it. Hand the agent a one-line request — *"turn this site into an EmDash template"* —
and this is what saves the person from having to describe the source themselves.

## 5. The sibling repositories

Two of the four source roads run scripts that live in other repositories — same org, same
contract, no dependency between them (ADR 0006 of TCH: nothing points at a live repo).

| Road | Needs | Repository |
|---|---|---|
| `contract` — a Joomla site you can reach | `joomla-dump.mjs`, `from-joomla.mjs` | `JoomlArt-Products/tracy-wordpress-theme` |
| `rendered`, `rendered-ask`, `frames`, `brief` | nothing beyond this repo | — |

```bash
gh repo clone JoomlArt-Products/tracy-wordpress-theme
```

Both are private, so the same credentials note above applies. Inside TCH both trees are already
vendored side by side and nothing needs cloning.

## 6. Dependencies for the tools

The kit is copied into a template and runs from there, against that template's `node_modules`
(EmDash, Astro, better-sqlite3, Playwright). To run the kit's own tests in place:

```bash
cd skills/tracy-emdash-template
npm install                 # playwright
npx playwright install chrome
npm test                    # the negative fixtures: the gate must be able to fail
```

System Chrome is used by the visual pass (`channel: "chrome"`); Playwright's bundled Chromium is
the fallback. Node ≥ 22.19 (24.x used in the reference build).
