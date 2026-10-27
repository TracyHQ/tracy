# Acceptance, packaging and recovery

DOCS_REQUIRED: Provide actual acceptance commands, evidence locations, backup/restore
steps, encryption-key recovery requirements and known blockers for this package.

Read ../AGENTS.md. Regenerate inventory after source changes with
`node tools/generate-docs.mjs`. When validation is authorized, run
`node tools/generate-docs.mjs --check`; it checks completeness/freshness, not prose
accuracy or runtime behavior. Regenerate artifact.json after documentation updates.

Acceptance includes clean install, editor-safe import, real admin publication,
localized routing/SEO, visual comparison, interaction, forms and owned-site recovery.
Record skips honestly. Export source through an explicit allowlist; exclude customer
databases/uploads, secrets, tokens, backups and all *.before-restore-* directories.
Ship AGENTS.md/docs for agents, outside public routes. Independent handoff must use
these instructions rather than undocumented context from the author.
