# Refero Styles snapshot library

The Refero data library was imported on 08/10/2026: keep the full source data first, integrate it into Tracy later. The right to download and store the library internally rests on a separate agreement that has been confirmed; see [IMPORT-NOTE.md](IMPORT-NOTE.md).

The authoritative status, style count and snapshot timestamp are in [snapshot.json](snapshot.json). The catalogue is in [catalog.json](catalog.json), the discovery scope and remaining errors in [source/completeness.json](source/completeness.json), and the full verification results in [source/verification.json](source/verification.json).

## Data scope

The crawler cross-checks the sitemap, 52 collection pages, the public Popular/Newest pages and the links between style pages. The Refero UUID is the primary identity; one brand can have several systems or several reference pages, so nothing is merged by domain.

The gallery API returns 403 and is not used. The snapshot covers the UUIDs discovered from the public sources above; the number advertised on the homepage is not used as a verification total, and private or unlisted entries are not inferred. The initial UUID set, the original discovery pages and the HTTP metadata are in `source/discovery/`.

Each style keeps the public `result` data the page sends to the browser, including extracted metadata, raw measurements, the interpreted design system, typography, colours, components, layout, imagery, guidelines and custom sections. Reconstructed component HTML is kept in the JSON when the source provides it. No extra fixtures are built to fill gaps in the source.

## Structure of each style

```text
systems/<refero-style-uuid>/
├── manifest.json
├── DESIGN.md
├── tokens.css
├── tailwind-v4.css
├── design-tokens.json
├── design-system.json
├── exports/compact/
│   ├── DESIGN.md
│   ├── tokens.css
│   ├── tailwind-v4.css
│   └── design-tokens.json
├── assets/screenshot.jpg
└── source/
    ├── page.html.gz
    ├── react-flight.txt.gz
    ├── result.json
    ├── http.json
    └── screenshot-http.json
```

The image extension follows the real file; not every source is assumed to be JPEG. `manifest.json` declares each file, its SHA-256 hash and byte count, along with the style URL, the source website URL, theme, industry, the date Refero extracted it and the date the snapshot fetched the data.

| File here | Refero export format |
| --- | --- |
| `DESIGN.md` | DESIGN.md, the Extended version at the root and Compact in `exports/compact/` |
| `tokens.css` | CSS Variables, Refero's download name is `variables.css` |
| `tailwind-v4.css` | Tailwind v4, Refero's download name is `theme.css` |
| `design-tokens.json` | Design Tokens, Refero's download name is `tokens.json` |
| `design-system.json` | The `designSystem` field taken verbatim from `source/result.json` |

File names are chosen close to the shape of the OpenDesign library for readability; the values and token names inside stay as Refero has them, not yet mapped to the Tracy schema. Exports are generated with exactly Refero's public formatter set, pinned in `source/exporter/`; the Extended DESIGN.md matches the version rendered on the page character for character before it is accepted.

The main screenshot is stored locally. Video preview URLs and additional posters are kept in the manifest; videos, and images/fonts from the brand's original website, have not been downloaded. This is a snapshot of design-system data plus screenshots, not an offline copy of the reference websites.

## Further downloads and verification

Run from the TCH root with Python 3 and Node, no packages to install:

```sh
python3 scripts/refero/crawl.py --reuse-discovery
python3 scripts/refero/verify.py
```

The crawl command skips styles already complete, retries styles that failed or are missing files, and continues from the saved UUID set. Drop `--reuse-discovery` to run a fresh discovery pass. By default at most four workers and four HTTP requests per second; transient errors are retried with backoff, and doors that return 403 are not bypassed.

A refresh of already-complete data should run into a separate snapshot to keep the previous one; the current CLI only adds or retries incomplete entries and does not overwrite good entries by itself. If Refero's formatter changes, keep the new chunk and its provenance in the new snapshot; the comparison against the rendered export will report a mismatch when the pinned formatter set no longer fits.

`verify.py` checks the UUID set and the total, the hash/byte count of every file in the manifest, JSON parsing, React Flight data against the stored result, the design-system JSON, page identity, the screenshot, and DESIGN.md against the rendered export. This check confirms the snapshot is intact and faithful to the source; it is not yet a measure of the quality of the sites Tracy generates.

## Integration boundary

This folder is not a plugin or a pnpm workspace member. `.dockerignore` excludes all of it from the build context. No runtime, UI switch, customer theme or Tracy adapter reads it at this import step. Normalised data and the decisions about where to differ from OpenDesign belong to a later integration step; do not edit the source data in place.

[The initial survey sample](../../../tasks/evidence/refero-styles-2026-10-08/README.md) and [the evaluation report](../../../docs/tracy-design-inspiration/improvements-from-refero-styles.md) are kept separately for comparison with this snapshot.
