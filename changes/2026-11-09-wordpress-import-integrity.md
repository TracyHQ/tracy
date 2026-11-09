- **Refuse incomplete database exports, keep view definitions and retry transient database uploads** — import maintainers · `fix/wordpress-import-integrity` · 2026-11-09
  **Affects:** Add site imports on web and desktop; rebuild the dsh image. View preservation and keyless mutation checks also require the companion WordPress engine update.
  **Why / Measured:** Local HTTP fault injection reproduced malformed success replies, stalled cursors, cross-origin token forwarding and non-retried storage failures; real MariaDB fixtures cover view dependencies and escaped identifiers.
