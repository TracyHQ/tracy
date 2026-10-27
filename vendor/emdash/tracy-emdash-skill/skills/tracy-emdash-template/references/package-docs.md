# Package documentation: authored guidance and generated inventory

Read at P2 when the model settles, and at P8 before handing off an installation.
The installed package must contain AGENTS.md and docs. The conversion skill is not
a substitute: a maintenance agent may receive only the installed application.

## Ownership

assets/package-docs/ supplies starter guidance through new-template.sh. The template
agent owns AGENTS.md and the eight top-level docs files. Complete every DOCS_REQUIRED:
marker with facts from this template and the owner's decisions. Keep machine paths,
live IDs, credentials and source-specific assumptions out of reusable guidance.

tools/generate-docs.mjs owns only docs/generated/inventory.json and inventory.md.
It reads allowlisted source inputs, never a running database, .env or token file.
It records collections and recursive field definitions, baseline counts, menu and
taxonomy summaries, locale/form-binding configuration, declared dependency pins,
Astro route files and source fingerprints. It does not execute the application.

Declared dependencies are not proof that a plugin is enabled. A catch-all route
file is not proof of every URL it serves. The authored architecture/language docs
must explain dispatch and the package must retain its runtime route-audit evidence.
Documentation inventory is a source snapshot, never a live-site inventory or audit.

## Workflow

1. Scaffold the package. Complete AGENTS.md and docs/{architecture,install,
   content-model,content-api,design-system,languages,content-rules,
   checks-and-recovery}.md against its actual source and runtime contract.
2. With package.json, lockfile, astro.config.mjs, template.config.json and seed ready,
   run `node tools/generate-docs.mjs` from the package root.
3. When authorized to validate, run `node tools/generate-docs.mjs --check`. It writes
   nothing and exits nonzero for missing/unfinished authored docs or stale generated
   output. Source changes require regeneration and a human/agent review of affected
   guidance; automatic fingerprints cannot establish prose correctness.
4. Regenerate artifact.json after documentation and seed changes. Include AGENTS.md
   and docs in the source distribution, outside public/ and src/pages/.
5. G8 uses those instructions to install, find and edit localized content, publish
   safely and locate backup/recovery steps. Record actual results and limitations.

Scaffold guidance is intentionally not byte-compared with a finished template:
it must be customized. The generator is a kit tool, so check-kit-sync.mjs covers
its copied implementation. Future updates preserve authored files.
