# Content API and publication

DOCS_REQUIRED: Document the supported native admin/API/MCP entry points, token scope,
entry identity rules and revision/draft/publication behavior for the pinned CMS.

Read ../AGENTS.md. Confirm origin and locale, read published state and any draft,
make the smallest change, reject concurrent revisions and explicitly publish only
when requested. Do not port Joomla API actions or perform routine content edits
through SQL. Document seed receipt/adopt/conflict behavior without automatic force.

## Tracy's Content API and provenance stamps

DOCS_REQUIRED: Document which collections `seed/content-api-map.json` maps (type, URL pattern,
chrome entry), that the image builds the reader on (`TRACY_CONTENT_API_SCALARS`, default 1), and
which elements each view stamps (`src/lib/stamps.ts`) — plus what it deliberately leaves
unstamped (menus, template words, formatted dates) and why.
