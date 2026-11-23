# Visual contract — measured on the rendered source (1440 px unless said)

Source: JA Fresco Joomla 6 quickstart 1.0.4 in Docker, `http://127.0.0.1:18080`, probed with `perf/probe.mjs`. The page is near-black only (no light/dark switch).

| Token | Value | Where |
|---|---|---|
| Page | `#0a0b0a`, text `rgba(255,255,255,.8)`, headings `#fff`, accent `#e6c9a2`, footer `#1a191b`, dark `#1b1a1c` | `etc/theme/default.json` |
| Fonts | headings Playfair Display 400; body Roboto 400/16/24; lead 20/30 weight 300 | `etc/site/default.json` |
| Heading scale | h1 46 / h2 36 / h3 28 / h4 24 / h5 20 / h6 16; below 1420 h1 34, h2 32; below 992 h1 30, h2 28, h3 24; below 576 h1 28, h2 26, h4 22 | compiled `:root` |
| Gutters | xl 128, lg 64, normal 48, sm 24, xs 12; below 1420 normal/lg 32, xl 64; below 992 xl 32; below 576 sm 16, normal/lg/xl 24 | compiled `:root` |
| Top bar | 47.3 px, 14/21, bottom border `rgba(255,255,255,.1)`, 25 px icon squares at 10% white | probe |
| Header | 80 px row, logo 116.6 × 60, nav 15/500 uppercase, link padding 20/16, active/hover accent; Book Table button 142 × 43 | probe |
| Buttons | 14/21, 1 px tracking, uppercase, padding 10/24, 1 px border, square; solid primary has white text on `#e6c9a2` | probe |
| Hero | 720 px tall at 900 px viewport (80vh from 1420), title 90/117, lead 20/30 max 700, 70% page-colour wash | probe |
| Section title | label 20/26 accent, main title = h1 size, lead max 600 | probe |
| Footer | padding 128/24, four columns, column titles 24 at 60% opacity, copyright 11.6/17.4 uppercase at 70% | probe |
