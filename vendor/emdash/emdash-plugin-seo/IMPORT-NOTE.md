# Tracy import: emdash-plugin-seo

Imported 2026-09-13 as a git subtree with --squash.

- Upstream: https://github.com/jdevalk/emdash-plugin-seo
- Pinned commit: c6cc96f286137ae921d58c7388e923f4beac4f45
- License: MIT; retain upstream LICENSE and notices.
- Role: compatibility-review-only
- Runtime baseline to evaluate: EmDash 0.37.0 / Node + Astro.
- Status: source imported only; no dependency install, build or runtime validation.
- Upstream implementation is unmodified. This note is Tracy-owned.

0.12.0 peer emdash ^0.21.0 excludes baseline 0.37.0. Review hooks and duplicate head/JSON-LD before enabling.

## Consumption

Read the upstream README before use. This import does not register a dsh plugin,
enable an EmDash plugin, or add packages to the TCH workspace. Package the exact
dependencies with the generated site; do not reference this machine's absolute
paths. Use pinned npm artifacts for unmodified packages or a self-contained
workspace for forks. Do not assume the source snapshot matches another npm release.

## Updating

Choose and review an explicit upstream commit, then use git subtree pull with
--prefix=vendor/emdash/emdash-plugin-seo and --squash from the upstream repository.
Record the new pin and evidence in this note and the toolkit manifest. Preserve
Tracy notes. Follow ADR 0006 and repository fork/version rules for source changes.
