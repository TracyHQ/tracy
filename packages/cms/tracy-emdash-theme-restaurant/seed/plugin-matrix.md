# Plugin matrix

Versions from `package.json` (exact pins) and `astro.config.mjs`. "Declared" is not "enabled for content": the last column says what this template actually uses.

| Plugin | Package | Version | Role | Used by this template yet? |
|---|---|---|---|---|
| EmDash core | `emdash` | 1.1.0 | CMS runtime, admin, content API | Yes: all views read collections, menus, taxonomies |
| Node adapter | `@astrojs/node` | 11.1.3 | SSR standalone server | Yes |
| Audit log | `@emdash-cms/plugin-audit-log` | 0.2.3 | records admin/content changes | Registered; no template code reads it |
| Forms | `@emdash-cms/plugin-forms` | 0.2.9 | form builder and submissions (`defaultSpamProtection: 'honeypot'`) | Registered, **no form built yet** (`tools/forms.json` empty, `forms.bindings` empty); the subscribe form is P4/P5 (D12) |
| SMTP | `emdash-smtp` | 0.3.3 | outgoing mail (`template.config.json` `mail`) | Registered; configured by `tools/configure-smtp.mjs`; no mail is sent by the views |
| hreflang | local `tracy-hreflang` | 0.2.0 (`src/lib/hreflang-plugin.ts`) | emits `hreflang` alternates and restates the head policy over the SEO panel | Yes, via `Base.astro` (one locale today, so `x-default` and `en`) |
| Content API reader | `tools/content-api` (integration, not an EmDash plugin) | n/a | Tracy Content API, scalar fields | Only when `TRACY_CONTENT_API_SCALARS=1` (image sets it) |
| React | `@astrojs/react` | 6.0.0 | admin and shadcn primitives | Registered; the views use no React island |
| Tailwind | `@tailwindcss/vite` | 4.3.3 | storefront CSS | Yes (`global.css` only) |
