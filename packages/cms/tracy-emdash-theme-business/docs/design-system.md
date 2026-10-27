# Layout and styling

Read ../AGENTS.md. The storefront uses Astro SSR, Tailwind v4 and committed shadcn
primitives. It does not require an external shadcn service at runtime.

| Concern | Source |
| --- | --- |
| Shared HTML, head and chrome | src/layouts/Base.astro |
| Page layouts | src/views/ |
| Shared storefront components | src/components/site/ |
| Interactive React islands | src/components/islands/ |
| shadcn primitives | src/components/ui/ |
| Semantic Tailwind theme tokens | src/styles/tokens.css |
| Storefront and form styles | src/styles/global.css, src/styles/forms.css |

Use semantic tokens instead of scattering replacement colors and dimensions.
Font fallback is intentionally aligned with the Joomla reference: Archivo uses
system-ui, -apple-system, Segoe UI, Roboto, sans-serif; Newsreader uses Georgia,
Times New Roman, serif. src/fonts.json disables Astro optimizedFallbacks because
its metric-adjusted Arial/Times faces otherwise intercept Cyrillic before these
families. The shipped design fonts cover Latin; RU intentionally uses the system
fallbacks approved by Lee, not a claimed self-hosted Cyrillic font. Keep this
distinction in acceptance reports; identical typography across operating systems
is not guaranteed by a system fallback.
Preserve the source design and both light/dark appearances. The existing dark
contract uses html[data-theme=dark]; do not introduce an unrelated theme switch.
Prefer Astro for static presentation and islands only where interaction needs them.

Do not import the storefront reset into EmDash admin or a Tracy/dsh host page.
Tailwind is appropriate in this independent site, not automatically in its host.
Keep attribution and provenance when modifying committed third-party primitives.

Changing CMS content normally does not require recompiling template source.
Local CMS photos use same-origin media paths in Photo.astro and the media helper.
Do not turn them into EMDASH_SITE_URL URLs: a direct preview may not have a session
for that private hostname. External provider images retain the native EmDash Image
component; local files use ordinary img elements with dimensions and lazy/priority
loading, without claiming dynamic resizing. Canonical metadata still uses the
configured public origin.
Changing Astro/React/CSS does require rebuilding the application and restarting
the owned built-server process as appropriate. Never patch dist/ directly.

When visual verification is requested, compare desktop/mobile, two or more locales and both
themes, then exercise keyboard focus, menus, dismissal and theme persistence.
No horizontal overflow does not establish visual fidelity or accessibility.
