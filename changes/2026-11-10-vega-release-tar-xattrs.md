- **Exclude extended attributes from release tar archives.** — Vega executor · #625 · `fix/ja-vega-readiness` · 2026-11-10
  **Affects:** Joomla webroot packaging through `packTar`; existing mode normalization and member contents are preserved. Existing archives are unchanged.
  **Why / Measured:** A synthetic macOS extended attribute reached the archive with the existing AppleDouble controls. Adding bsdtar's `--no-xattrs` excludes PAX extended attributes; the focused release-pack tests verify attribute exclusion, member bytes and archive modes.
