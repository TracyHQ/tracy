# Visual contract — JA Diner (source: Joomla 6.0.3 quickstart `ja_diner` 1.0.5, rendered at 127.0.0.1:18080)

Measured with a Playwright probe on the source home at 1440 px (computed styles; the rendered page, not the LESS).
Source light theme only; the source has no dark theme (`html[data-theme="dark"]` changes no body colour). A dark theme is
derived for the port because the Visual QA tiers include `dark-*` (see DECISIONS D12 in the next session).

## Tokens (light) — provenance: computed style on the rendered home

| Role | Value | Source |
|---|---|---|
| page background | `#fcfaf6` | `body` background · `@body-bg` in `less/variables.less:62` |
| body text | `#555` (rgb 85,85,85) | `body` color · `@gray` |
| heading ink | `#222` | `h3`, `h4` color · `@gray-darker` |
| brand / link / nav | `#c36349` | `.t3-mainnav a` color · `@brand-primary` |
| secondary | `#428bca` | `@brand-secondary` (not seen on the home) |
| on-dark text | `#fff`, paragraphs on hero `rgba(255,255,255,.8)` | hero `p` |
| highlight | `#fc0` marker under title words | `@bg-text-highlight: @yellow` |
| container | 1260 px, 18 px side padding | `.container` |
| button radius / pill | 0 | `.btn` (square) |

## Type scale

| Element | Family | Size / line | Weight | Case |
|---|---|---|---|---|
| body | Work Sans | 15 / 24 | 400 | none |
| h1 (hero) | Eczar | 60 / 72, letter-spacing −0.5 | 400 | none |
| h3 | Eczar | 22 / 30 | 400 | none |
| h4 | Eczar | 18 / 21.6 | 500 | none |
| h2 (section label) | Work Sans | 15 / 36 | 700 | uppercase |
| main nav | Work Sans | 12 / 24 | 600 | uppercase |
| buttons | Work Sans | 17 | 600 | uppercase |

Fonts the browser actually loads on the source: Work Sans 400/600/700, Eczar 400/500 (the adapter reported Eczar as
"never loaded"; the browser measurement shows it loaded: see `perf/skill-findings.md`).

## Layout facts (home, from the 1440 render)

Header: centred logo under a slim top menu (uppercase, 12 px); slideshow 1 full-width with left-aligned title, text, two buttons;
two-column intro (tall image + location, text + image + hours); gallery carousel with prev/next; menu tabs with dish list in
two columns and round plate image on the left; four-card news row; chef quote with cut-out photograph on a yellow circle;
dark newsletter band; three-column footer; copyright row with the T3 mark.
