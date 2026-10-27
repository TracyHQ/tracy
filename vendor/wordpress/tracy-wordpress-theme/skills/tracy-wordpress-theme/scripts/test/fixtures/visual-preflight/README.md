# visual-preflight fixtures

`recorded.json` holds the readings the tools gave on JA Vega before their fixes (M4/M4b, 26/09/2026),
reduced to the fields the preflight judges, next to the census of the same pages:

- `t4-headings` — layout-boxes paired 1 heading of 10 (T4 section titles outside `main`).
- `reveals` — motion saw 0 reveals on the port while 12 elements faded in on scroll.
- `status-404` — the declared 404 page failed in functional, http-parity, layout-boxes and visual-qa.
- `all-differ` — every paired block differed; `controlUnstable` is the page compared with itself
  still differing (a misread), `controlClean` the same page reading clean (the differences are real).

The live fixtures are built in `scripts/test/visual-preflight.test.mjs`: an HTTP source and site the
five tools and the capability probes actually run against. Their pages carry what the preflight
certifies — a declared 404, three layouts, a dark theme applied from the `tracy_theme` cookie, an
AOS-marked reveal (a library motion reads) and an IntersectionObserver fade no library marks, a toggle
over a hidden region, and a container grid stepping at 768 and 1200 px (`.container` on the source,
`.wrap` on the site) — and variants that withhold each one (no dark script, a site selector that
matches nothing, random section colours, a source page whose body changes on every load, a time budget
spent before anything is read, a run interrupted by SIGTERM). The fixture server gzips every answer
whose request accepts it, as a production server does, so a certified run shows the recorded pages
asked for identity bytes. The runtime manifest they pass names the test's
own HTTP server with a placeholder digest.
