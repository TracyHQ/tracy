# Example: Tracy Base 1.0.0 / wp7 — ported from Tracy Base j6 (13–14/09/2026)

Not a general rule — these are the measurements of one specific run, so the next person knows "what normal looks
like" and what had to be done by hand. The rules are in `SKILL.md`; the decisions in
`tasks/tracy-base-wp7/DECISIONS.md` (D1–D17); the gaps in `content-gaps.md` (G1–G21).

## Source and target

- **Source**: Joomla 6.1.1 site Tracy Base 1.0.0 (T4 template `tracy`, od-landing layout on the home page),
  tree `~/TracyHQ/quickstart-builds/tracy-base-j6-1.0.0/` (inventory.json, render-routes.json 43
  routes, `capture/` webroot), live at `127.0.0.1:8217`. 82 articles / 19 categories / 102 menu items /
  116 modules (46 ACM, 18 kinds, 27 mod_custom) / 186 images 20 MB.
- **Target**: WordPress 7.1, PHP 8.3.33, prefix `tr_`, theme `tracy-base` (second build target; `Version:` 0.1.0 at capture time, since 14/09 the generator carries 1.0.0 = the quickstart version — the draft release still has the asset `tracy-base-0.1.0.zip`, replaced on publish)
  of `packages/cms/tracy-wordpress-theme`, overlay `overlays/tracy-base/`, look = OpenDesign
  `apple`, second variation `airbnb`), stand `~/TracyHQ/quickstart-builds/tracy-base-wp7-1.0.0/`
  on `:8227`, clean stand `:8228`.
- **Products**: theme zip 229 KB (123 entries, with AGENTS.md + docs), quickstart
  `tracy-base/wp7` = webroot tar ~45 MB + database sql.gz ~70 KB + manifest + SHA256SUMS +
  VERIFICATION.json, draft release on `JoomlArt-Products/ja-products` tag `tracy-base/wp7`
  "Quickstart: Tracy Base / WordPress 7".

## Measurements by phase

| Phase | Measurement | Time |
|---|---|---|
| Ingest (`from-joomla`) | 43 routes → 40 page-map pages (38 + single + 404), 32 WP pages (27 routes + 404 + 4 aggregate parents), 51 posts, 14 categories, 3 site menus (menu `main` is admin, dropped), 46 ACM, 5 gaps → 301, 8 redirects; validate OK | minutes |
| Source images | 172 shots (43 × 1440/390 × light/dark), dark via `class:t4-dark+attr:data-bs-theme=dark`, home mean gray 242 light / 15 dark | ~6 min |
| Theme | 21 patterns for 18 ACM kinds (hero/story/team in two styles), 16 templates, 2 parts, mega block, dark `light-dark()` + toggle + cookie; `tracy` build byte-identical; 22 package tests | — |
| Seed | 8 runs to the final version; first run 182 wp-cli calls, ~5 min (each call one `compose run` ~2 s); last run `+0 ~1`, 127 calls; 56 sections (35 ACM, 21 library), 0 fallback; 36 media; 6 `wp_navigation`; 2 part overrides; CF7 | 3–5 min/run |
| Content parity | 43/43 routes; 519 source runs, 425 matched, 94 accepted under 21 entries with a G-number, 0 missing | ~2 min |
| Target images | 152 shots, 0 errors | ~6 min |
| Scanners | leak + contrast pass on 6 pages (395–598 elements), mega-hover 3/3 gap 0 px, editability 0 BAKED on 7 pages (8 chrome runs in parts) | minutes |
| Theme zip | 4/4: 111→123 clean entries, install-smoke on a clean stand, Theme Check 0 ERROR (2 REQUIRED accepted: `register_block_type`, `Update URI`), 332 msgid | ~2 min |
| Quickstart | prune 0 PRUNE (after `--apply` removed the revisions of 8 seed runs); pack 45 475 996 B tar + 70 771 B sql, secret-scan clean; restore `--wipe`, 151 search-replace, checksums clean; verify-parity 40/40 routes, 12/12 counts, **0 drift / 9 600 measurements / 152 axes**; draft release 7 assets, sha256 pinned in `quickstarts.json` + contract + presentation-lock (104 theme files) | ~15 min for the whole cycle; **restore → site 200: 57 s** locally (7 `docker run`) |

## What had to be done by hand, and why

1. **Docker died silently because the host disk was full** (13/09 20:58, 6.7 GB free after Lee cleaned up): kill the backend,
   `open -a Docker`, `docker start` another session's site container, `up -d` three stands. Gotcha 4.
2. **`entrypoint: ["wp"]`** for the `cli` service — the image does not add it by itself. Gotcha 2.
3. **`tracy-nav-top-left` + `tracy-hero-split`** pinned in `inc/extra.php`: the apple archetype is
   overlay/cover, painting the hero with the background colour → cr=1.00. Gotchas 7, 12.
4. **Redirect hook** `template_redirect` reads the option `tracy_base_redirects` — the seeder writes the option, the theme
   must read it.
5. **One-row header chrome** (b): six source links + three megas, `core/navigation` kept for the mobile
   overlay; part overrides 148/149 deleted by hand, then the seeder recreated 217/218.
6. **Canonical `/x/`**: three tools fixed the same bug. Gotcha 13.
7. **Parity contains, not equals**: one source team-card `<li>` = three target blocks. Gotcha 14.
8. **T4 chrome outside `<header>`**: `.mega-*`, `footnav-N` listed by hand. Gotcha 15.
9. **Copyright** missing from `style.css` — Theme Check caught it, fixed.
10. **Session rate limit** at 23:20 on the night of 13/09 cut four subagents off mid-way; resumed from the start, no files
    lost because the Writes had completed.

## Remaining deltas, named

- The hero and the first two sections of the home page are left-aligned (the source is centred); the source hero's dashboard mock is
  a text div, not an SVG → not carried over. Fix in `fillFromLibrary` in a later run.
- Home-onepage: 4 sections (`about/services/product/process`) are `core/html` from the adapter (no
  matching kind) — G-number in content-gaps.
- The site title prints "Tracy" as text; the "Tracy Base" logo is not yet assigned to `custom_logo` (contract slot `site.logo`).
- The contract's `contact.phone/address` are written as options, the theme does not render them yet.
- Choosing "Tracy Base" on Build's design-inspiration tab: no tile yet — `tracy-base` only enters Build
  when `meta.id` carries it. Separate UI work.
- Fleet: the `tracy-base/wp7` entry has pinned the sha256/asset ids from the draft release; provider `ready`. The release is still
  a **draft** (not published) and the `ja-products` repo is private → provisioning needs `TRACY_RELEASES_GITHUB_TOKEN`.
  Not yet pushed `develop` → dev machine, "Create with WordPress" not yet measured on `cowork.tracy.site`.

## Ways in

- `http://127.0.0.1:8227/` (build stand) · admin `tracyagent`, password in `private-login.json`.
- `http://127.0.0.1:8228/` (the copy restored from the quickstart).
- `http://127.0.0.1:8217/` (Joomla source).
- Evidence: `~/TracyHQ/quickstart-builds/tracy-base-wp7-1.0.0/evidence/{source,wp7,review,http-parity.json,package-report.json}`, `pack/{parity.json,restore.json,manifest.json}`, `release/`.
