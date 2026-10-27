# Tracy import: emdash-smtp

Imported 2026-09-13 as a git subtree with --squash.

- Upstream: https://github.com/masonjames/emdash-smtp
- Pinned commit: 211a954e3cb357781c09ec5f19a931f4aadda1d7
- License: MIT; retain upstream LICENSE and notices.
- Role: runtime-candidate
- Runtime baseline to evaluate: EmDash 0.37.0 / Node + Astro.
- Status: source imported only; no dependency install, build or runtime validation.
- Upstream implementation is unmodified. This note is Tracy-owned.

Source package 0.3.3, not npm latest 0.3.4. Keep core and node-transports together. Trusted Node target for generic SMTP; only one email provider.

## Consumption

Read the upstream README before use. This import does not register a dsh plugin,
enable an EmDash plugin, or add packages to the TCH workspace. Package the exact
dependencies with the generated site; do not reference this machine's absolute
paths. Use pinned npm artifacts for unmodified packages or a self-contained
workspace for forks. Do not assume the source snapshot matches another npm release.

## Updating

Choose and review an explicit upstream commit, then use git subtree pull with
--prefix=vendor/emdash/emdash-smtp and --squash from the upstream repository.
Record the new pin and evidence in this note and the toolkit manifest. Preserve
Tracy notes. Follow ADR 0006 and repository fork/version rules for source changes.
