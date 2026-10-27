# Tracy EmDash template toolkit

Source inventory for coding agents converting HTML/assets/style guides into an
EmDash site. Imported sources are not installed or certified runtime dependencies.
Machine-readable pins: [toolkit-manifest.json](toolkit-manifest.json).

## Existing official sources (do not duplicate)

Baseline EmDash 1.1.0 (was 1.0.1 until 04/10/2026, 0.37.0 until 29/09/2026), provenance: [IMPORT-NOTE](emdash/IMPORT-NOTE.md).

- [core-i18n](emdash/packages/core/src/i18n/): Core locale support; also consult core content API, translations, menus and Astro routing.
- [field-kit](emdash/packages/plugins/field-kit/): Structured JSON editors; prove admin round-trip.
- [forms](emdash/packages/plugins/forms/): Forms/submissions; mail delivery must be tested separately.
- [audit-log](emdash/packages/plugins/audit-log/): Audit trail, not backup or universal undo.
- [embeds](emdash/packages/plugins/embeds/): Optional rich embeds.
- [color](emdash/packages/plugins/color/): Optional color field widget.

## Imported sources

- [emdash-mika](emdash-mika/IMPORT-NOTE.md): evaluation-only. Pinned source archive of 0.1.1; subtree ancestry pending. Optional commerce foundation requiring host backend/storage/payment wiring. Not installed or runtime-verified; do not enable by default.
- [astro-skills](astro-skills/IMPORT-NOTE.md): agent-reference. Astro/Tailwind/SEO guidance. Static content collections are not a replacement for EmDash live CMS data.
- [astro-image-inspector](astro-image-inspector/IMPORT-NOTE.md): development-only. 0.2.4. Astro dev toolbar image inspection; not a production plugin.
- [emdash-smtp](emdash-smtp/IMPORT-NOTE.md): runtime-candidate. Source package 0.3.3, not npm latest 0.3.4. Keep core and node-transports together. Trusted Node target for generic SMTP; only one email provider.
- [emdash-human-sitemap](emdash-human-sitemap/IMPORT-NOTE.md): optional-runtime-candidate. 0.1.1. Check locale filtering, drafts, noindex and complete pagination before shipping.
- [emdash-page-list](emdash-page-list/IMPORT-NOTE.md): optional-runtime-candidate. 0.1.4. Menu/collection-backed lists; use only where core/theme queries are insufficient.
- [emdash-plugin-seo](emdash-plugin-seo/IMPORT-NOTE.md): compatibility-review-only. 0.12.0 peer emdash ^0.21.0 excludes baseline 1.1.0. Review hooks and duplicate head/JSON-LD before enabling.

## Agent workflow

1. Select the minimum tools required by the input site's content model.
2. Read the selected source README and IMPORT-NOTE; check pinned CMS/API compatibility.
3. Keep customer content in EmDash collections, menus, settings and media. Astro
   static collection recipes are reference material, not a substitute for CMS storage.
4. Configure selected plugins in the generated site, not the Tracy dsh bundle.
5. Verify admin edit/publish, frontend rendering, locale behavior, access control,
   data persistence and a clean second install before claiming runtime readiness.
6. Keep tokens, SMTP credentials and real submissions out of template/seed artifacts.

Native i18n is the foundation. emdash-i18n-translations is intentionally absent:
its researched version has API and authorization issues. Paid Lexington themes
are also absent; only the two explicitly approved MIT repositories were imported.

Official source uses monorepo workspace/catalog dependencies. Do not copy these
verbatim into a standalone site without resolving its dependency graph.
Field Kit edits JSON fields; it does not automatically supply a page builder.
SMTP source here is 0.3.3; do not label it as npm 0.3.4. SEO remains opt-in and
requires a compatibility port/review for EmDash 1.1.0.

## Integration history

Mika was added as an immutable source archive at commit
03d205758da358f2f4a2586e656bb01995fef193, without Git operations. Its subtree
integration remains pending; it is recorded separately as a source snapshot in
the manifest, not as one of the completed subtrees below.

Subtree commits are retained on local branch vendor/emdash-toolkit-20260913.
The main working copy receives only new directories and these inventory files;
its existing staged and unstaged changes are untouched. Integrate that branch
when consolidating work to preserve subtree ancestry. No publish/deploy performed.
