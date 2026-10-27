# `vendor/wordpress/` — code for customers' WordPress sites

The same role as `vendor/joomla/` for Joomla and `vendor/emdash/` for EmDash.

| Tree | What it is | Pin |
|---|---|---|
| [`tracy-wordpress-theme`](tracy-wordpress-theme/IMPORT-NOTE.md) | Skill that builds a WordPress 7 site from any source (a running Joomla site, an HTML folder, a URL, a brief): spec-pack, generated theme, seed via wp-cli, content-parity and editability gates, theme zip, quickstart for the fleet | `JoomlArt-Products/tracy-wordpress-theme` @ `1ff5b81c` (1.0.0) |

Tracy's WordPress theme (`packages/cms/tracy-wordpress-theme`, two targets `tracy` and `tracy-base`)
is still **Tracy's code**, not vendor code: it is built from `vendor/tracy/od-design-system`.

Before importing another tree here, read [`ADR 0006`](../../docs/adr/0006-plugins-as-pinned-subtrees.md)
first: a subtree pinned to exactly one commit, with an `IMPORT-NOTE.md` that states which version is pinned and why.
