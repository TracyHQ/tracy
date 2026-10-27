# WO A–Z build quality and runtime verification

This work makes autonomous website builds safer and keeps visual QA bounded in memory. The build uses supported CMS content and settings operations, batches copy into structured tasks, and reconciles rendered-theme edits against verified output. The QA reader checks evidence from the page and viewport it actually read. Full-height vision streams overlapping tiles with bounded queues and model requests, cancellation cleanup, and explicit incomplete-coverage results.

## Local acceptance

- WordPress, Joomla, and EmDash each passed 26/26 independent core checks and seven-page visual review.
- Final vision totals: WordPress 110 tiles/38 model calls; Joomla 110/39; EmDash 90/32. Desktop and mobile screenshots were captured and reviewed.
- WordPress Home, Contact, and Blog were recaptured after native content repairs; all returned HTTP 200 without horizontal overflow or broken images.
- The constrained Docker environment uses serial browser/model work and capped image payloads. These measurements are samples, not a universal peak-memory claim.
- Focused integration suites pass. The complete database-backed gate remains subject to a free local PostgreSQL port.

Detailed private-site captures remain on the test machine under `~/TCH-local/a2z-bench/runs59/`.
