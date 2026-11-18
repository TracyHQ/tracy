# Visual contract — tracy-essence (P1, measured on the stand render)

Reference: `/home/agent/out/essence/render/` (80 renders: 20 pages × 1440/390 × light/dark, `render-manifest.json`: 0 failed,
0 horizontal overflow, console errors only the expected 404 resource on `/nope-404`). Design values: `docs/design-system.md` of the
product repo (file and line evidence there).

- **Themes**: `html[data-theme=light|dark]`, cookie `ja_essence-theme`; body background `rgb(248,248,255)` / `rgb(17,21,31)`,
  text `rgba(37,36,36,.7)` / `rgb(194,201,214)` (measured). Accent `#4d6bff`.
- **Fonts** (measured, `render-manifest` `fonts`): Noto Serif (body, 400/700), Jost (headings, nav), Font Awesome 5 icons; the logo is an
  image (script wordmark "Essence" in the footer; plain "JA Essence" text in the header). Loaded from Google at render time (D6).
- **Shape**: white cards radius 1rem, buttons/pills 0.5rem, container 1164px, card padding 2.25rem, hairlines `rgba(0,0,0,.1)`.
- **Page families seen**: Home (slider of 3 cards + 3 small list + blog list with pagination + gallery strip + footer band; Home 2–5 swap the
  header block and sidebar placement), category blog (3-column cards, "More Read" strip), article (cover, byline, quote, gallery,
  prev/next, share, tags, "Author's latest articles", sidebar with Latest / Newsletter / Features / Tags cloud / Follow), contact, author list,
  tag list, 404.
- **Evidence gaps** (to measure at P3): the exact card paddings and rhythm (design-spec slots listed in `content-gaps.md`).
