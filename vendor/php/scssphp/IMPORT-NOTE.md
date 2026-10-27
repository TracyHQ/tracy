# Tracy import: scssphp

Imported 2026-09-27 as a git subtree with --squash (ADR 0006).

- Upstream: https://github.com/scssphp/scssphp
- Pinned tag: v1.13.0 (the last dependency-free line; v2 needs league/uri, which a site without composer cannot load)
- License: MIT; retain upstream LICENSE.md and notices.
- Role: runtime, on customer Joomla sites — pure PHP (>= 5.6, runs on the sites' 8.4), no composer at runtime.
- Why: a Tracy Joomla site runs the stock `joomla:6-apache` image (no node, no dart-sass). T4 ships
  its own scssphp (1.6.0, `plugins/system/t4/vendor/`, used by its admin action `Action/Scss.php`),
  but that copy dies on the sites' PHP 8.4 compiling `template.scss` (`array_walk_recursive():
  Argument #1 must be of type array`, Compiler.php:2038 — measured 27/09/2026 on tracy_business), so
  an agent asked to change the look was left writing plain CSS beside `darkmode.css` (measured
  27/09/2026 on `capiv2j`). 1.13.0 compiles the same file in ~5 s. `src/` is copied into every Joomla site folder as
  `tools/scssphp/` by `ensure-site-folder.mjs`, and `tools/t4-scss.php` (Tracy's own, in
  `packages/fleet/tracy-fleet-operation/scripts/provision/php/`) compiles
  `templates/<tpl>/scss/*.scss` → `css/*.css` with the site's own `php`.
- Upstream implementation is unmodified. This note is Tracy-owned.
- Update: `git subtree pull --prefix vendor/php/scssphp https://github.com/scssphp/scssphp.git <tag> --squash`,
  then bump the tag here.
