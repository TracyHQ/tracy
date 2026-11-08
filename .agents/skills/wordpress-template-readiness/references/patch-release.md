# Procedure W4: a theme patch release of a WordPress port

How the next version of a ported WordPress quickstart is cut, as JA Diner WP7 1.0.2 was (TracyHQ/tracy#459). The tools
are the vendored `tracy-wordpress-theme` skill's (`vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/`,
`references/quickstart.md`, *Patch release recipe*); this page is the order and the traps met on the way.

## Inputs

- **The port's dossier** (`--run-root`): `spec/` with `page-map.json` and `visual.contract.json`, `DECISIONS.md`,
  `review.config.json`, the sweep history. Gitignored parts (sweep state, evidence, port data) must be there too; a copy
  without them is stop W4.
- **The source site** the port was made from, answering at the address the dossier names, serving the same HTML on
  every request. A Joomla source prints a fresh form token per request, and the sweep refuses with exit 4 ("the source
  changed while the sweep ran"): turn on its page cache (`plg_system_cache`, a long lifetime) before the baseline.
- **The previous release**, packed from its own `manifest.json`, archives and their `SHA256SUMS` lines. A published
  `SHA256SUMS` may list a README or release notes that no longer match the uploaded files: pack only the lines that
  name the archives and the manifest, and check them (`shasum -a 256 -c`).
- **The theme zip** of the new version: version stamped in the overlay (`style.css`, `readme.txt` changelog), built with
  `node scripts/build-wordpress-theme.mjs --target <theme>` (`--check` clean). Compare it with the previous zip file by
  file; every difference is in the changelog.

## Stands

Two WordPress stands with the fleet web image, a `wordpress:cli` runner and MariaDB: stand A (bind-mounted, the
capture stand) holds the previous release's webroot and database with the new theme installed by wp-cli; stand B (a
named volume) is where the chain restores what it packed.

## Order

1. **Baseline:** restore the previous release on stand B and run the full sweep against the source (`site-sweep.mjs
   --full`). This is the baseline the new version is compared with.
2. **Chain:** `scripts/quickstart/patch-chain.mjs` runs cycle (prune, pack, restore, verify), sweep, audit, bind and
   release, one phase each, resumable with `--from <phase>`. `--admin` is the pack's own account; `--plugin <zip>`
   binds with a local plugin build.
3. **Sweep differences:** the chain's sweep must pass all eleven checks. A failing group that the baseline already had
   (same route, width, scheme, cause) is the port's long-standing difference: it becomes a `sweep.accept` row of
   `review.config.json` with its decision in `DECISIONS.md`, written by a script that accepts a group only when every
   cell is in the baseline. A group that is not in the baseline is new: fix it in the theme (a `heights` or `scheme` group on a page whose markup
   you changed is recipe H8 of [`coverage-holes.md`](coverage-holes.md)), or stop W4 for the port
   owner. A cause that appears at different widths from one run to the next on a page you did not touch is the source's
   own intermittent measure: accept it at every width with its decision, after comparing two runs. A full sweep that exits 4 on a history merge (`effective.checks.<check>.intermittent was measured by a run
   before the full run`) runs again with the sweep state file moved aside.
   Declare such an exact-cell row `"intermittent": true`: a run in which its group is absent is then skipped, not a stale
   error, and the row still moves the cells when the group is there (dropping and re-adding rows between runs never
   converges). Never wrap the sweep in a log-idle watchdog: the heights phase prints nothing for minutes, and killing the
   process there closes the heights browser and leaves every heights case "not measured". A scoped re-run never writes
   `fix-measure.json`; the release needs a full run with every check passing.
4. **Prune trap:** `prune-audit` deletes an attachment that a pattern looks up by post name (no reference it can see).
   Bundle such a picture in the theme as the fallback instead of relying on the seed.
5. **Contract:** capture the new version's profile from the packed database (`capture-contract.mjs --posts
   --page-titles --role-vocabulary 3 --previous-map <previous map>`), `capture-inventory.mjs`, the derived files
   (`--check` clean), slot roles (`scripts/slot-roles/check.mjs`), then coverage ([`coverage-holes.md`](coverage-holes.md)),
   Slot fit and the label judge. While coverage has an open stop, nothing below runs.
6. **Bind:** the chain's bind needs a plugin carrying the new profile. Build claude-cowork locally with the new contract
   (`wordpress/cowork/build.sh`, the contract files byte for byte as this tree holds them) and resume `--from bind
   --plugin <local zip>`. Never publish that build.
7. **Release:** procedure W1 (`release-wordpress.mjs` through its `release/<tag>` PR), then the chain's release phase
   (`release.mjs --patch`) with the published plugin, upload the printed assets, then procedure W3 (the pin), then the
   readiness verdict on the pinned version must exit 0.
