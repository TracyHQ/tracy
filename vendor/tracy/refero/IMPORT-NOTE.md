# Refero Styles — import note

- **Status on 08/10/2026:** all 1,342 public styles found were imported, with no errors and nothing left
  unprocessed; the authoritative record is `snapshot.json` and `source/completeness.json`. The sitemap
  at the start and the end of the run held the same set of UUIDs.
- **Source:** https://styles.refero.design/.
- **Location:** `vendor/tracy/refero`, kept as a separate library first and integrated with Tracy later.
- **Kind:** a data snapshot of a website — not a plugin, and not a subtree of an upstream repository.
- **Right to use and distribute:** Tracy holds a separate agreement with Refero covering this import
  (confirmed by Lee on 08/10/2026), and Tracy's legal team confirmed on 26/10/2026 that the snapshot may
  stay in this repository when it is published. The agreement itself is not stored here.
- **Licence:** the data is Refero's and is **not** covered by this repository's MIT licence, nor by the
  Apache-2.0 licence of `vendor/tracy/od-design-system`. Brand names and screenshots in it belong to their
  owners (see `THIRD_PARTY_NOTICES.md` at the repository root).
- **Shipping:** not wired into the product; not in any image (`.dockerignore` excludes the whole folder
  from the build context).

## How the data was collected

Tracy's crawler read the public HTML and the React Flight state of each `/style/<uuid>` page, resolved
the long-text references and kept the `result` data the page sends to the browser unchanged. It did not
sign in, did not change anything on Refero and did not download the brands' own websites.

The Compact/Extended exports were produced with the JavaScript formatter Refero serves publicly, stored at
`source/exporter/refero-export.chunk.js`. The crawler ran only the pure export functions, in a VM with no
network, filesystem or process access; the file is kept with its hash so the run can be reproduced. A
style was marked successful only when its Extended DESIGN.md matched the `<pre>` exported on the page
character for character.

The sitemap and 52 public collection pages were cross-checked before the run. The gallery API answered
HTTP 403; the crawler neither used nor bypassed it. Completeness means every UUID found in these public
sources and in the links between style pages — not private/unlisted styles or counts advertised on the
site.

Each style keeps its main screenshot. Video preview and extra poster URLs are kept in the manifest; videos
and assets of the original websites were not downloaded. Component data stays as it came in
`source/result.json` and `design-system.json`, including reconstructed HTML where Refero provides it.

## Pinning and updates

Under [ADR 0006](../../../docs/adr/0006-plugins-as-pinned-subtrees.md), vendored data needs a
fixed source and point in time. Refero has no upstream data repository, so no commit is recorded and the
snapshot is not called a subtree. Each import records its crawl/export point, hashes, source and terms in
`snapshot.json`.

Raw data is never edited in place to fit Tracy's schema. Normalised data and adapters written by Tracy
live separately; a later import must not overwrite Tracy's additions, nor replace good data with a failed
run.
