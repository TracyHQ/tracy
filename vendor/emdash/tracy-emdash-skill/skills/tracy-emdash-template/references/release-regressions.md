# Release regressions: required acceptance beyond a green crawl

Read before packaging, a clean installation, or acceptance behind a proxy. Derived
from the Tracy Business local publication on 2026-09-13. Apply the mechanisms to the
current template; do not reuse its ports, users, counts or Northgate data.

## 1. Prove the distributable, not the working directory

1. Record artifact hash/image digest, site origin, container/process and owned data
   directory. Build from the actual distribution allowlist.
2. Include approved seed media, public assets (including favicon), generated client
   assets and fonts. Compare referenced seed files against files in the artifact by
   hash, not only count. Include supplied PDFs; absent PDFs remain declared gaps.
3. Inspect the artifact before startup: no runtime DB/users, customer uploads,
   credentials, tokens, backups or restore copies. Create owner/service credentials
   per install through the authorized bootstrap flow, never a shared Tracy admin.
4. Install that exact artifact into a new, empty owned destination without old
   volumes. Confirm imported files and content references, then test rendered pages.

Pass: the clean site loads its assets without the source checkout, previous site's
uploads or developer session. Recreating a container on old volumes proves
persistence, not clean installation. Stop on bootstrap failure; never label the
site ready simply because the container serves HTTP.

## 2. Image visibility and access context

1. Test each supported viewing context separately: direct preview, authenticated
   private vanity/proxy, and anonymous published site when publication is authorized.
   Anonymous requests to a private site must remain denied.
2. Collect img src/currentSrc/srcset, picture sources, CSS background images, icons,
   fonts and download references across the route/locale matrix.
3. Scroll lazy content into view and confirm each expected image completes with
   naturalWidth > 0. Capture screenshot evidence, final URL, response status and MIME.
   A 200 HTML login/error response is not a valid image.
4. For local storage, ensure preview media does not require a separate login at a
   configured public hostname. Preserve genuine external CDN URLs. Keep canonical,
   hreflang and share metadata bound to the configured public origin.

Pass: no broken expected image in any supported context. Media API counts and an
authenticated curl audit are insufficient. Image FIELDS passing does not cover
images inside rich text: EmDash's default Portable Text image block renders an
absolute URL on the configured public origin (Tracy Business D33, caught by the
browser gate on the article page) — render body images through the template's
own component. Preserve access control while fixing
origin handling; do not expose a private site to make preview photos load.

## 3. Font coverage per language

1. Inventory actual scripts and accented characters in every supplied locale.
2. Inspect emitted font-face unicode ranges and the shipped font's glyph coverage,
   for body/display, regular/italic and used weights. A configured subset name does
   not add characters to a font that lacks them.
3. Check font requests and actual rendered font per script in the browser, then
   visually compare mixed-script text, headings, navigation and forms at the matrix
   viewports. Computed font-family or document.fonts.ready alone is not proof.
4. If the design font lacks coverage, record the gap and obtain the owner's choice
   of a compatible locale font/fallback. Ship its files and license with the build.

Pass: intentional, documented typography and glyph coverage for every locale, no
silent OS-dependent substitution. Do not change EN merely to repair RU.

Compare effective fallback chains with the reference before proposing a new font.
In Tracy Business both Joomla and EmDash shipped Latin-only design fonts, but
Astro inserted metric-adjusted Arial/Times faces ahead of Joomla's system-ui/Georgia
fallbacks. Lee chose reference parity: optimizedFallbacks false and the original
fallback order, not additional Noto fonts. An explicitly approved system fallback
is acceptable; record its OS dependency instead of claiming bundled glyph coverage.

## 4. Evidence integrity and negative tests

For mega navigation, measure panel bounds separately from its inner content.
Tracy Business's source uses a full-header-width background and a centered 1240px
inner grid. A trigger-aligned 1240px popover is not equivalent. Compare open-state
screenshots and header/panel rectangles on wide screens and wrapped mobile headers;
include Escape, outside click, focus return and viewport resize. Closed-menu
screenshots and an overflow-only audit cannot establish this contract.

Keep source checks, HTTP tests, browser checks, clean install and proxy checks as
separate results. API edits are not admin UI acceptance. Expected 404 routes should
be asserted as 404 without concealing unrelated broken links. A truncated crawl is
incomplete. Browser unavailable or blocked means pending, never pass.

When extending automation, first demonstrate these negative fixtures fail:

| Fixture | Required failure |
| --- | --- |
| Zip packed, release green, fleet dies with `app.new/Dockerfile: no such file` (package built from an old kit, allowlist lacks `Dockerfile`/`tools/docker-entrypoint.sh`) | `release.mjs` rejects before upload; `build-qa-contract.mjs` lists both under `required`; `new-template.sh` generates `Dockerfile` from `Dockerfile.template` |
| A seed file or public favicon omitted from the artifact | Distribution/asset gate |
| Media count correct but image response is 403 or HTML | Rendered-media gate |
| Preview image points to a private foreign origin | Viewing-context gate |
| Config requests Cyrillic but shipped font lacks its glyphs | Locale-font gate |
| Bootstrap exits nonzero while server is healthy | Installation gate |
| Crawl stops early or browser measurement is unavailable | Incomplete/pending |
| Dark axis: white surface, dark-on-dark text, bright border, doubled seam | Visual scanners (`visual-scan`, `visual-qa`) |
| Hover moves the box; mega panel closes on the way down (`gapPx > 0`); Escape does not return focus | Interaction axis (`mega-hover`, `visual-qa`) |
| A visible component no rule measures; site diverges from the source render | `design.coverage` / `design.parity` (`visual-qa`) |

Since 2026-09-13 the first four rows and the incomplete/blocked row are held by
`tools/qa.mjs` + `tools/distribution.mjs` with the negative fixtures in
`tests/qa-contract.test.mjs`, `tests/distribution.test.mjs` and `tests/qa.test.mjs`
(the mapping is in qa-contract.md); the three visual rows are held by `tools/visual-qa.mjs`, `tools/visual-scan.mjs` and `tools/mega-hover.mjs` with the fixtures in `tests/visual.test.mjs` (method: visual-review-method.md). The bootstrap row is still a `clean-install`
receipt: a person or agent runs the packed artifact into a new destination and
signs the result. Existing media URL unit tests do not replace browser decoding.
