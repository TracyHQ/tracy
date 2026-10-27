# Tracy import: emdash-mika

Imported 2026-09-13 as an immutable GitHub source archive.

- Upstream: https://github.com/bnomei/emdash-mika
- Pinned commit: 03d205758da358f2f4a2586e656bb01995fef193
- Package: @bnomei/emdash-mika, source version 0.1.1.
- License: MIT; upstream LICENSE and notices retained.
- Role: evaluation-only; optional commerce foundation, not a default dependency.
- Archive checksum: IMPORT-ARCHIVE.sha256.
- Source implementation is unmodified; IMPORT-* files are Tracy-owned.
- Git integration: pending. This archive import does not establish subtree ancestry.
  Before product integration, import this exact commit via git subtree --squash
  under vendor/emdash/emdash-mika in a clean integration worktree, following
  ADR 0006, and preserve these notes. Do not describe this snapshot as a completed
  subtree import. No Git commands were run for this import.

## Runtime boundaries

Source only: no dependency installation, build, tests, site activation, workspace
registration, image change or deployment. Compatibility with Tracy is unverified.
Mika declares EmDash >=0.22 <1, Astro ^7 and Node >=22.12. A peer range is not
runtime acceptance of the Tracy EmDash 0.37.0 baseline.

The Astro backend template contains an empty API wiring stub. The site must wire
repositories, migrations, payment provider, request context, authorization,
maintenance and notifications before it becomes a functioning shop. Keep raw-body
Stripe webhooks in the host endpoint as directed upstream. Agent descriptors do
not themselves enforce permissions or register Tracy MCP tools.

## Agent use

Read README.md and src/templates/astro/README.md before consuming this source.
Keep CMS content and translated product copy separate from shared SKU/stock and
order/payment records. Do not invent commerce data for corporate-only templates.
Do not enable a second Stripe plugin alongside Mika by default. Keep credentials
and customer data out of source and template exports. Implement Tracy adapters
outside upstream source; follow fork/version rules if upstream changes are needed.

Before enabling for customers, prove pinned-stack compatibility, admin round-trip,
concurrent stock reservation, webhook verification/replay/recovery, order access
control, refund policy, durable maintenance, EN/RU behavior and clean restore.
See tasks/research-emdash-ecommerce-selection-2026-09-13.md at the repository root.
