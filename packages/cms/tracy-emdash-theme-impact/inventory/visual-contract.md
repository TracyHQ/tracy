# Visual contract — measured on the rendered source (1440 px unless said)

Source: JA Impact Joomla 6 quickstart 1.0.6 in Docker, `http://127.0.0.1:18090`, probed with `perf/probe.mjs`, `perf/dom.mjs` and `perf/sections.mjs`. The page is white with a navy primary; a dark theme exists (`css/darkmode.css`) and follows the OS (`data-theme` on `<html>`, DECISIONS D12).

| Token | Value | Where |
|---|---|---|
| Page / text | `#ffffff`, text `#495057`, headings `#1d3677` (primary) | `media/t4/css/<style>.css`, `etc/theme/default.json` |
| Accents | success `#0cb76d` (buttons, eyebrows, hover), warning `#f48a29` (highlight number, date tile, band), info `#2970db` (quote block, mission box), cream `#fff9ef` (light sections), card `#fbfbfb` | same |
| Dark theme | page `#111a2c`, card `#1e2a45`, text `#c2c9d6`, heading `#eef1f6`, border `#33415e`, link `#6f9bf0`, eyebrow `#2fd98a` | `css/darkmode.css:14-80` |
| Fonts | Readex Pro everywhere; body 400 16/25.6, headings 500 line 1.2 | `etc/site/default.json` |
| Heading scale | h1 72 / h2 40 / h3 28 / h4 24 / h5 18 / h6 16; below 1200: h1 56; below 992: h1 40, h2 28, h3 24, h4 20, h5 16 | `scss/tpl/theme.tpl.scss:24-36` |
| Container | 1376 at ≥ 1400, 1140 at ≥ 1200, 960 at ≥ 992, 720 at ≥ 768, 540 at ≥ 576, else full; 16 px padding | measured |
| Section spacing | `top-large`/`bottom-large` 128 px from 1200 px, else 48; `medium` 64 px from 992 px, else 48 | measured on `#Mod133`, `#Mod155` |
| Header | 207 px: navy band 141 (logo 61 px high at y 40; three contact items: icon tile 48, 16 px label, 18/500 value; 64 px apart) + menu row 66 (links 16/500 padding 22 × 32, hairlines between, the green `Donate now` button 160 × 66 at the right) | `#t4-header` |
| Hero | 814 px, picture per slide, eyebrow 24/500 green, h1 72, text 18, button 56 high; dots at the bottom; the next section overlaps it by 128 px at ≥ 1200 | `#t4-hero` |
| Buttons | 8 px radius, 500, padding 16 × 24 (56 high), hover opacity .85 | `theme.tpl.css:171-180` |
| Home sections (top, height) | header 0/207 · hero 207/814 · helpline + intro + fund 893/943 · what we do 1836/1135 · stories 2971/998 · meet us 3969/534 · events 4503/1251 · connected 5754/786 · blog 6541/1240 · contact band 7781/473 · link columns 8254/368 · copyright 8622/112 (total 8734) | `perf/sections.mjs` |
| Footer | navy `#1d3677`; link text `#ced4da`; column titles 24/500; links 15 with 37 px rows | `#t4-footnav` |
| Masthead | 350 px band over `hero-1.jpg`, title 40/500 white, breadcrumb white | `#t4-masthead` |
| Article pages | grey breadcrumb bar 90 px, then main + a right column (categories with counts, search, recent posts with pictures, tags) | `#t4-breadcrumbs`, `#t4-main-body` |
