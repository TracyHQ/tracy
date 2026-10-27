# Tracy import: astro-skills

Imported 2026-09-13 as a git subtree with --squash.

- Upstream: https://github.com/Lexington-Themes/astro-skills
- Pinned commit: 6070f472d1b83bbb49bcb1c87519d9931755de1b
- License: MIT; retain upstream LICENSE and notices.
- Role: agent-reference
- Runtime baseline to evaluate: EmDash 0.37.0 / Node + Astro.
- Status: source imported only; no dependency install, build or runtime validation.
- Upstream implementation is unmodified. This note is Tracy-owned.

Astro/Tailwind/SEO guidance. Static content collections are not a replacement for EmDash live CMS data.

## Consumption

Read the upstream README before use. This import does not register a dsh plugin,
enable an EmDash plugin, or add packages to the TCH workspace. Package the exact
dependencies with the generated site; do not reference this machine's absolute
paths. Use pinned npm artifacts for unmodified packages or a self-contained
workspace for forks. Do not assume the source snapshot matches another npm release.

## Updating

Choose and review an explicit upstream commit, then use git subtree pull with
--prefix=vendor/emdash/astro-skills and --squash from the upstream repository.
Record the new pin and evidence in this note and the toolkit manifest. Preserve
Tracy notes. Follow ADR 0006 and repository fork/version rules for source changes.
