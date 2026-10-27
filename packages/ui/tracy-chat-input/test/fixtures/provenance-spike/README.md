# Raw data from the spike (27/09/2026)

Enough to rerun `scripts/match.py` and `scripts/eval_stamps.py` without a network. The Northgate demo set
on three dev sites (`capiv2j` Joomla, `capiv2w` WordPress, `gf1410` EmDash) — not customer data.

- `<j|w|e>-detail.json.gz` — `content.read {id}` of every English item (`scripts/detail.mjs`).
- `<j|w|e>-dom.json.gz` — visible elements of 4 pages (`scripts/extract.mjs`, clean browser context).
- `<j|w>-dom-stamped.json.gz` — as above, with the label strings (`?tracy_provenance=1`, test plugin).
- `sources.tgz` — the indexed template/language files (Joomla `tracy_business` + `language/en-GB`, WP theme
  `wp-tracy-business`, EmDash `src/` + the seed used to measure the `seed-only` gap).

To rerun: extract into a folder, name things as `scripts/` expects (`<site>-detail.json`,
`<site>-dom.json`, `src/<site>/…`), then `python3 match.py <j|w|e>` and `python3 eval_stamps.py <j|w> <site>-dom-stamped.json`.
