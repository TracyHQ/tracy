# `vendor/` — other people's code, grouped by **who consumes it**

Four groups, decided 10/09/2026. Before that, fourteen folders sat flat side by side and you could not
read which one served what — `od-design-system` (Tracy's design library) stood right next to
`joomlart-t4-skill` (a toolkit only Joomla uses) as if they were the same kind of thing.

| Group | Consumed by | Contains |
|---|---|---|
| **`tracy/`** | the Tracy core and dsh — what runs in the harness page | `deepseek-harness` (submodule) · `dsh-passwords` `dsh-better-locale` `dsh-better-sidebar` `dsh-locale-vi` · `od-design-system` `od-brand-engine` `od-skill` · `mattpocock-skills` |
| **`joomla/`** | customers' Joomla sites | `joomlart-t4-skill` |
| **`wordpress/`** | customers' WordPress sites | `tracy-wordpress-theme` (skill) |
| **`emdash/`** | customers' EmDash sites | `emdash` (CMS) · `emdash-theme-bravada` · `emdash-theme-tracy-editorial` · `emdash-theme-tracy-coral` · `tracy-emdash-skill` (template-building skill, home repo `JoomlArt-Products/tracy-emdash-template`) |

The rule is still `CLAUDE.md` RULE #5 and [`ADR 0006`](../docs/adr/0006-plugins-as-pinned-subtrees.md):
one submodule, the rest are subtrees pinned to exactly one commit. The groups only change **where they sit**, not
how they enter the tree.

## 🔒 The move broke the `git subtree pull` path

`git subtree` finds the previous split by scanning history for the line `git-subtree-dir: <prefix>`.
The prefix has just changed, so the next `pull` **will not find** the old marker and will demand to merge the whole
upstream history. The table below lists the old prefixes; when bumping a version, use it to find the latest split commit
(`git log --grep="git-subtree-dir: <old prefix>"`) and merge from there, rather than letting subtree guess.

| Now | Before 10/09 |
|---|---|
| `vendor/tracy/<name>` | `vendor/<name>` |
| `vendor/joomla/joomlart-t4-skill` | `vendor/joomlart-t4-skill` |
| `vendor/emdash/<name>` | `vendor/<name>` |

`vendor/wordpress/tracy-wordpress-theme` was first imported on 14/09/2026, so it has no old prefix.

## The word `vendor` elsewhere is NOT this folder

Three places use the same word with a different meaning; do not "fix them to match":

- `vendor/` of **Composer on a customer site** (`vendor/psr/log`, `vendor/php-debugbar/…`) —
  `webroot-excludes.sh`, `publish-excludes.sh`, `tracy-webroot-read`.
- `vendor/` **nested inside** dsh (`vendor/cordis`, `vendor/cosmokit`, `vendor/loader`) — relative paths
  inside the submodule.
- The gates' `SKIP_DIRS` / `SKIP_SUBTREES` match by **name**, so a bare `'vendor'` still covers
  all four groups. Adding a level there would narrow the gate.
