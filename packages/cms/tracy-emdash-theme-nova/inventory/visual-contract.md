# Visual contract — tracy-nova (P1, measured on the stand render)

Reference: `<evidence-dir>/render/` (68 renders: 17 pages × 1440/390 × light/dark, `render-manifest.json`: 0 failed, 0 horizontal
overflow). Console errors are only the static mirror's 404s (admin-widget sprite, watermark) and a 501 on a POST the mirror cannot
answer. Design values: `docs/design-system.md` of the product repo (file and line evidence there), not repeated here.

- **Themes**: `html[data-theme=light|dark]` (also `data-bs-theme`, class `t4-dark`), cookie `janova-theme`; body background `rgb(255,255,255)` /
  `rgb(20,23,28)` (`--dm-bg #14171c`), text `rgba(19,21,21,.7)` / `rgb(194,201,210)` (measured). Accent `#5e48db`, link hover `#3014cc`.
- **Fonts** (measured, `fonts` of the manifest): Golos Text 400/500/700 for body, headings and menu; Font Awesome 5/6 icon fonts.
  Headings h1 2.5rem … h6 1rem at 1200 px and wider; h1/h2 38/32 below 1200, 32/28 below 768, 28/24 below 576.
- **Chrome**: header (logo, mainnav with a three-column megamenu under item 102, header CTA, theme toggle), off-canvas menu from the right
  below 992 px, breadcrumbs row, footer block with four columns + copyright (`footnav-1..4`).
- **Home** (10768 px at 1440): hero · violet "Primary" feature band · marquee of pill chips · three feature cards · pale-violet CTA band ·
  clients logo row · image + feature list · yellow Teams carousel · image + feature list · green counters band · pricing tabs · green news
  band (one lead card + two) · FAQ accordion · CTA strip · footer. ~15 sections, each a separate T4 section with its own background.
- **Inner pages**: a page shell with breadcrumb title band; blog list/detail, project list (category tabs) and project detail (Client,
  Services, Date, "See live"), services pages, contact (form + info), career, author list, tags, smart search.
- **Carousels** (Owl): Clients, Teams, Text Sliders; **collapse panels**: Accordion and Features-intro style 7.
- Offline, error and login/registration/profile pages are Joomla system pages (see `content-gaps.md`).
