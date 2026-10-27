/** Route docs — see ./index.js for the entry shape. Filled from the source file named on each entry. */
import { AGAIN_PARTS_DOC } from './website-opportunities.js'

const SITE_KEY = { key: 'The site key (its canonical name, for example `shop.example.com`).' }

const MAIL_MODES = ['tracy', 'tracy-domain', 'own-smtp', 'own-cms', 'off']

/** @type {import('./index.js').RouteDoc[]} */
export const MISC_ROUTES = [
  {
    method: 'POST',
    path: '/auth/local/launch',
    summary: 'Create a personal local launch link',
    description:
      'Local installation mode only. Requires the installation Bearer secret and rejects browser Origin or Sec-Fetch-Site headers. Returns a short-lived one-use launch URL.',
    auth: 'token',
    audience: ['desktop'],
    internal: true
  },
  {
    method: 'GET',
    path: '/auth/local/open',
    summary: 'Open a personal local launch link',
    description:
      'Local mode only. Serves a restrictive-CSP page which exchanges the one-use code from the URL fragment and removes that fragment before navigation.',
    auth: 'none',
    audience: ['desktop'],
    internal: true
  },
  {
    method: 'POST',
    path: '/auth/local/exchange',
    summary: 'Exchange a personal local launch code',
    description:
      'Local mode only. Requires same Origin and JSON containing the one-use code. Consumes the code atomically, ensures the local owner and creates the local session cookie.',
    auth: 'token',
    audience: ['desktop'],
    internal: true
  },
  // src/app.js
  {
    method: 'GET',
    path: '/health',
    summary: 'Check that the service is up',
    description:
      'Answers `{ ok: true }` as long as the process is running. It reads nothing else: no database, no ' +
      'host, no mail. Registered before host routing, so it answers the same on every hostname.',
    audience: ['public', 'fleet'],
    auth: 'none',
    internal: false,
    answers: '`{ ok: true }`'
  },
  // src/app.js
  {
    method: 'GET',
    path: '/favicon.ico',
    summary: "Read Tracy's browser icon",
    description:
      'The icon a browser asks for on its own when a page declares none. Answers the Tracy mark as ' +
      '`image/svg+xml` (cacheable for a day) on Tracy’s own hostname only — a site’s hostname is ' +
      'answered by that site — so the address is never read as a site name.',
    audience: ['customer', 'team'],
    auth: 'none',
    internal: true,
    answers: 'The Tracy icon (SVG)'
  },
  // src/app.js
  {
    method: 'GET',
    path: '/',
    summary: 'Open the API host',
    description:
      'On the API host (the hostname `API_ORIGIN` names) the root redirects (302, uncacheable) to the ' +
      'documentation host (`DOCS_ORIGIN`). On every other hostname the root is the workspace door, not this. ' +
      'No sign-in; the API host reads no session cookie at all, and answers `404 NOT_ON_THIS_HOST` for ' +
      'every path outside `/`, `/v1`, `/docs`, `/.well-known` and `/health`.',
    audience: ['public', 'agent'],
    auth: 'none',
    internal: false,
    answers: '302 to the documentation host'
  },
  // src/docs/route.js
  {
    method: 'GET',
    path: '/docs',
    summary: 'Open the documentation site',
    description:
      'The documentation lives at the root of its own host, the one `DOCS_ORIGIN` names. ' +
      'This address redirects there (302, uncacheable). Answers a 404 page saying so when this ' +
      'deployment has no documentation host.',
    audience: ['public', 'agent'],
    auth: 'none',
    internal: false,
    answers: '302 to the documentation host'
  },
  // src/docs/route.js
  {
    method: 'GET',
    path: '/docs/*',
    summary: 'Open a page of the documentation site',
    description:
      'Redirects (302, uncacheable, query kept) to the same page on the documentation host: ' +
      '`/docs/quickstart/` to `/quickstart/`, `/docs/api` to the interactive reference at `/api/reference/`, ' +
      'and `/docs/api/<document>` to `/api/<document>`. On the API host the three published documents ' +
      '(`openapi.json`, `claude-cowork.json`, `llms.txt`) are still answered at their `/docs/api/` address.',
    audience: ['public', 'agent'],
    auth: 'none',
    internal: false,
    params: { path: { '*': 'Page or file path under `/docs/`.' } },
    answers: '302 to the documentation host'
  },
  // src/public/config-door.js
  {
    method: 'GET',
    path: '/api/config',
    summary: 'Read the addresses this deployment uses',
    description:
      'The public settings a plugin reads instead of writing Tracy addresses into its code: `origin`, ' +
      '`siteDomain`, `siteDomainAliases`, `sitePort` (empty when the default port is right), ' +
      '`cookieDomain` (empty means host-only), `badgeUrl` and `hostOrg`. Nothing secret; cached 60 seconds.',
    audience: ['customer', 'public'],
    auth: 'none',
    internal: false,
    answers: 'The deployment settings as JSON'
  },
  // src/public/build-info-door.js
  {
    method: 'GET',
    path: '/api/build',
    summary: 'Read which server build answers',
    description:
      'The build of this Tracy server, for the version line in Settings › Help & about: `commit` (the full ' +
      '40-character commit the image was built from) and `builtAt` (ISO-8601 UTC). An image reused because ' +
      'its build context did not change keeps the values of the build that made it. A value that is missing ' +
      'or not of its shape is `null`. Also returns `desktopVersion`, the published stable desktop release ' +
      'offered by the desktop download page (read from the public stable Mac feed, cached for up to 60 seconds; ' +
      'null when unavailable). Signed in only (401 `NOT_SIGNED_IN`); the HTTP response is never cached.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    answers: '`{ commit, builtAt, desktopVersion }`'
  },
  // src/badge/route.js
  {
    method: 'GET',
    path: '/tracy-badge.js',
    summary: 'Load the Tracy badge script for a demo site',
    description:
      'The advertising badge a demo site on any server can carry: the Tracy mark and a button that opens ' +
      'a template on the Design templates page. Built from the badge setting staff edit on /ops; if the ' +
      'setting cannot be read, the defaults are served. Any origin may load it; cached five minutes.',
    audience: ['public', 'site'],
    auth: 'none',
    internal: false,
    answers: 'JavaScript'
  },
  // src/badge/route.js
  {
    method: 'GET',
    path: '/build-with-tracy-demo.js',
    summary: 'Load the banner script for a JoomlArt demo',
    description:
      'The banner a JoomlArt demo site carries, written into the site when the demo is installed. Its ' +
      '`data-template` attribute points the link at that demo’s own Design template card. The script ' +
      'carries the template ids Design templates offers on this server and draws nothing on a demo ' +
      'whose template is not among them; when that list cannot be read it draws as before. Uses the ' +
      'same badge setting and defaults as `/tracy-badge.js`; any origin may load it.',
    audience: ['public', 'site'],
    auth: 'none',
    internal: false,
    answers: 'JavaScript'
  },
  // src/badge/route.js
  {
    method: 'GET',
    path: '/badge.js',
    summary: 'Load the seat badge script for a customer site',
    description:
      'The small badge shown on a customer site that Tracy serves. The script tag is added by Tracy when ' +
      'it serves the site at the site’s own address, never by the site itself. Built from the seat badge ' +
      'setting staff edit on /ops; cached five minutes. Off by default: until staff switch it on, the ' +
      'script draws nothing.',
    audience: ['site'],
    auth: 'none',
    internal: false,
    answers: 'JavaScript'
  },
  // src/badge/route.js
  {
    method: 'GET',
    path: '/tracy-badge',
    summary: 'Show a demo page for the Tracy badge',
    description:
      'A plain HTML page with the badge running live, the tag to copy onto a site, and what each `data-*` ' +
      'attribute does. Not indexed by search engines.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    params: {
      query: {
        template: 'Template the badge opens; `tracy-business` by default.',
        provider: 'Provider shelf the badge link names.'
      }
    },
    answers: 'HTML'
  },
  // src/docs/route.js
  {
    method: 'GET',
    path: '/docs/api',
    summary: 'Open the API reference',
    description:
      'The interactive reference moved to the documentation host: this address redirects (302, ' +
      'uncacheable) to its `/api/reference/` page, drawn by Scalar from the `/v1` document. The viewer is ' +
      'served by Tracy, not a CDN; fonts, telemetry and Scalar’s online services are turned off, and ' +
      '"Test request" calls the API host.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers: '302 to the documentation host'
  },
  // src/docs/route.js
  {
    method: 'GET',
    path: '/docs/api/scalar.js',
    summary: 'Load the API reference viewer script',
    description:
      'The Scalar viewer bundle moved with the reference page: this address redirects (302) to ' +
      '`/api/reference/scalar.js` on the documentation host, where `?v=` matching the hash of the bytes ' +
      'caches it for a year.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    params: { query: { v: 'Hash of the bundle, set by the page; enables long caching when it matches.' } },
    answers: '302 to the documentation host'
  },
  // src/api-reference/route.js
  {
    method: 'GET',
    path: '/docs/api/openapi.json',
    summary: 'Download the OpenAPI document',
    description:
      'The OpenAPI 3.1 document the reference page shows, built on each request, at the address it was ' +
      'published under. On the API host it describes `/v1` with that host as its server; the documentation ' +
      'host serves the same document at `/api/openapi.json`. Any origin may read it; never cached.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers: 'OpenAPI 3.1 JSON'
  },
  // src/public/design-inspiration-redirects.js, src/public/route.js
  {
    method: 'GET',
    path: '/design-inspiration',
    summary: 'Move an old Design templates page address to the Templates pages',
    description:
      'The old public page address answers a permanent redirect (301) to `/templates/`. With `?open=<id>` ' +
      '(the badge links) it goes to `/templates/<id>/` when `<id>` is a published template, otherwise to ' +
      '`/templates/`; `utm_*` keys are kept. `/design-inspiration/<id>` follows the same rule. The files of ' +
      'the built page and the `/design-inspiration/api/*` doors are not redirected.',
    audience: ['public', 'customer'],
    auth: 'none',
    internal: false,
    params: { query: { open: 'A template id; the redirect goes to that template when it is published.' } },
    answers: '301 to the Templates pages'
  },
  // src/public/route.js
  {
    method: 'GET',
    path: '/design-inspiration/*',
    summary: 'Load a file of the Design templates page',
    description:
      'A path ending in a file extension answers that file from the built Design templates page ' +
      '(154 design templates and a brand reader; 404 when missing), as the ' +
      'brand reader and the library readers expect. Any other path is an old page address and is redirected ' +
      '(301) to the Templates pages. The `/design-inspiration/api/*` paths are separate doors registered ' +
      'before this one and answer as they always did.',
    audience: ['public', 'customer'],
    auth: 'none',
    internal: false,
    params: { path: { '*': 'File or page path under `/design-inspiration/`.' } },
    answers: 'The file, or a 301 to the Templates pages'
  },
  // src/public/templates-page.js
  {
    method: 'GET',
    path: '/templates/',
    summary: 'Browse every published template',
    description:
      "Server-rendered HTML, no sign-in: every published template, with a filter link for each platform that has one (wordpress, joomla, emdash). Read per request from the cards `GET /api/templates` answers. When the pages live on another host (`TEMPLATES_PUBLIC_ORIGIN`; on production the landing site), every `/templates*` address answers 301 to the same path and query there, except for that host's own Cloudflare Worker (`CF-Worker: <public host>`), which is served the page.",
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers: 'HTML'
  },
  // src/public/templates-page.js
  {
    method: 'GET',
    path: '/templates/:id/',
    summary: 'Open a template page, or a platform filter page',
    description:
      'A template id (`/templates/ja-fresco/`) answers the page of that template; a platform name (`/templates/joomla/`) answers the gallery limited to that platform. 404 when the template is not published or the platform has none.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    params: { path: { id: 'A template id, or wordpress, joomla or emdash.' } },
    answers: 'HTML'
  },
  // src/public/templates-page.js
  {
    method: 'GET',
    path: '/templates',
    summary: 'Move /templates to its slash form',
    description: 'Answers a permanent redirect (301) to `/templates/`, query kept.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers: 'HTML'
  },
  // src/public/templates-page.js
  {
    method: 'GET',
    path: '/templates/:id',
    summary: 'Move a template or platform address to its slash form',
    description: 'Answers a permanent redirect (301) to `/templates/<id>/`, query kept.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    params: { path: { id: 'A template id, or wordpress, joomla or emdash.' } },
    answers: 'HTML'
  },
  // src/public/templates-discovery.js
  {
    method: 'GET',
    path: '/sitemap.xml',
    summary: 'List the Templates pages for search engines',
    description:
      'A sitemap of `/templates/`, each platform page that has a template and each template page, as absolute ' +
      'addresses on this origin, read per request from the published templates. No `lastmod`: a card carries ' +
      'no publish date.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers: 'Sitemap XML'
  },
  // src/public/templates-discovery.js
  {
    method: 'GET',
    path: '/llms.txt',
    summary: 'List the Templates as plain text for AI readers',
    description:
      'A short description of Tracy Templates and one line per published template (name, address, blurb, ' +
      'CMS, industry), read per request from the published templates. Off production it still answers but ' +
      'carries `x-robots-tag: noindex`.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers: 'Plain text'
  },
  // src/public/templates-discovery.js
  {
    method: 'GET',
    path: '/templates/sitemap.xml',
    summary: 'List the Templates pages for search engines, inside the Templates section',
    description:
      'The same sitemap as `/sitemap.xml`, at an address under `/templates/` so it also exists on the public ' +
      'origin (on production the landing site), whose proxy forwards only `/templates*`. robots.txt names this one.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers: 'Sitemap XML'
  },
  // src/public/templates-discovery.js
  {
    method: 'GET',
    path: '/templates/llms.txt',
    summary: 'List the Templates as plain text for AI readers, inside the Templates section',
    description:
      'The same text as `/llms.txt`, at an address under `/templates/` so it also exists on the public origin ' +
      '(on production the landing site).',
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers: 'Plain text'
  },
  // src/public/templates-discovery.js
  {
    method: 'GET',
    path: '/robots.txt',
    summary: 'Tell crawlers they may read the Templates pages',
    description:
      'Allows `/templates/` and names the sitemap (`<public origin>/templates/sitemap.xml`). It does not open any signed-in area.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers: 'Plain text'
  },
  // src/public/wo-find-page.js
  {
    method: 'GET',
    path: '/find',
    summary: 'Show the sign-in-free restaurant search page',
    description:
      'Website Opportunities’ public Find: the same Find view as the signed-in tab, in a public mode that ' +
      'searches only when asked, shows no photos, map or per-row actions, and lets a visitor pick up to 10 ' +
      'places and continue to the signed-in tab with the picks in the address. A signed-in visitor, or one a ' +
      'shard holds, is sent straight to `/new/?tab=tracy:website-opportunities&wo-view=find` with ' +
      '`wo-at`, `wo-radius`, `wo-pick` and `utm_*` kept. Answers only on the main deployment (404 on a shard) ' +
      'and only while the `website-opportunities` and `website-opportunities-public-find` switches are both ' +
      'on; otherwise redirects to `/login` for the signed-in Find.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers: 'HTML, or a redirect'
  },
  {
    method: 'GET',
    path: '/find/',
    summary: 'Show the sign-in-free restaurant search page (trailing slash)',
    description: 'The same page and the same redirects as `GET /find`.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers: 'HTML, or a redirect'
  },
  {
    method: 'GET',
    path: '/find/find-assets/*',
    summary: 'Load a file of the sign-in-free Find page',
    description:
      'A built script, stylesheet or font of the page, with its own content type; 404 when missing, never the page.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    params: { path: { '*': 'File path under `/find/find-assets/`.' } },
    answers: 'The file'
  },
  {
    method: 'GET',
    path: '/find/api/capabilities',
    summary: 'Read what the sign-in-free Find can do',
    description:
      'Read-only: the place kinds, the radii the search takes, and that there is no map key and no social ' +
      'stats for a visitor who is not signed in. `404 FEATURE_OFF` while either switch is off.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers:
      '`{kinds, cuisines, discovery, search: {maxRadiusM, radiiM, depths}, maps: {browserKey: null}, socialStats: {providers}}`'
  },
  {
    method: 'GET',
    path: '/find/api/places/suggest',
    summary: 'Suggest places as a visitor types, without signing in',
    description:
      'The public Find’s place box: `?q=` (3 to 200 characters; shorter answers no suggestions and asks ' +
      'nobody), `session` (a UUID for the typing session, so the pick bills with it) and an optional ' +
      '`lang`. One Google Autocomplete call, the same code as the signed-in Find. Limits from ' +
      '`/ops/settings/wo`, per address an hour and a minute and per deployment a minute and a UTC day; ' +
      'a refusal (`429` `RATE_LIMITED`, `BUSY`, `DAILY_LIMIT`, `CLOSED`) only stops the suggestions.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    params: {
      query: {
        q: 'What was typed.',
        session: 'UUID of this typing session.',
        lang: 'Optional language tag for the suggestions.'
      }
    },
    answers: '`{suggestions: [{placeId, text, mainText, secondaryText, types}]}`'
  },
  {
    method: 'GET',
    path: '/find/api/places/suggest/:placeId',
    summary: 'Resolve a picked suggestion to its point, without signing in',
    description:
      'One Google Place Details call (location only) in the typing session of `?session=`; the public ' +
      'search then goes by these coordinates. Same limits and refusals as the suggestions.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    params: {
      path: { placeId: 'The placeId of a suggestion.' },
      query: { session: 'UUID of the typing session.', lang: 'Optional language tag.' }
    },
    answers: '`{label, lat, lon}`'
  },
  {
    method: 'POST',
    path: '/find/api/search',
    summary: 'Search restaurants around an area without signing in',
    description:
      'Body `{query, radiusM}` (an area name, geocoded with OpenStreetMap Nominatim) or `{lat, lon, radiusM}`; ' +
      '`radiusM` is 1000, 3000, 5000 or 10000; any other field, or a body over 2 KB, is `400 INVALID_SEARCH`. ' +
      'One Google Places Text Search page (the signed-in Find’s default area search), at most 20 places, known chains left out. ' +
      'Google’s answer is kept for both Finds for `placesCacheDays` (default 183) per cache cell: a kept answer costs no Google call and no deployment budget. ' +
      'Limits from `/ops/settings/wo`, per address a minute and an hour (IPv6 per /64) and for the whole deployment a minute and a UTC day ' +
      '(`429` with `RATE_LIMITED`, `BUSY`, `DAILY_LIMIT` or `CLOSED`). A search that ' +
      'reached the provider counts even when it failed. `404 FEATURE_OFF` while either switch is off.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    body: {
      type: 'object',
      required: ['radiusM'],
      properties: {
        query: {
          type: 'string',
          description:
            'An area: a city, district or street (up to 200 characters). Send this or `lat` and `lon`.'
        },
        lat: { type: 'number', description: 'Latitude of the search centre.' },
        lon: { type: 'number', description: 'Longitude of the search centre.' },
        radiusM: { type: 'integer', enum: [1000, 3000, 5000, 10000], description: 'Search radius in metres.' }
      }
    },
    answers:
      '`{center: {lat, lon, label}, provider, pages, hiddenChains, candidates: [{provider, providerId, name, kind, category, distanceM, rating, reviews, website?, socials, status}]}` (the signed-in search’s row shape, without photos)'
  },
  {
    method: 'POST',
    path: '/find/api/research',
    summary: 'Research places found on the public Find, without signing in',
    description:
      'Body `{placeIds}`: 1 to 10 Google place ids and nothing else; any other field (a name, website, phone ' +
      'or social page) is `400 INVALID_RESEARCH`, so every fact of a place comes from Tracy’s own research. ' +
      'Research is shared: a place someone already researched answers `researched` at once and costs nothing; ' +
      'a place being researched is joined; a place nobody researched yet is queued only within the day limits ' +
      'from `/ops/settings/wo` (new places per address and per deployment a UTC day, and the strangers’ research ' +
      'budget). A refusal is per place: `state: "refused"` with `PUBLIC_RESEARCH_LIMIT` or `PUBLIC_RESEARCH_SPENT` ' +
      '(sign in to research it). Research that stopped is not retried from here (`stopped`). The results are ' +
      'published for everyone. `404 FEATURE_OFF` while either switch is off.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    body: {
      type: 'object',
      required: ['placeIds'],
      properties: {
        placeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Google place ids from the public search, at most 10.'
        }
      }
    },
    answers:
      '`{places: [{placeId, state: "researched" | "queued" | "running" | "stopped" | "refused", receipt?, researchedAt?, canBuild?, code?}]}`'
  },
  {
    method: 'GET',
    path: '/find/api/research',
    summary: 'Read research progress on the public Find, without signing in',
    description:
      '`?placeIds=` (comma list, at most 10) answers `researched` or `none` per place; `?receipts=` (the receipts ' +
      'the POST gave) answers that research’s progress: `queued`, `running` with its `stage`, `researched`, or ' +
      '`stopped`. Never starts or resumes research; a receipt reads for two days.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    params: {
      query: {
        placeIds: 'Comma list of Google place ids.',
        receipts: 'Comma list of receipts from POST /find/api/research.'
      }
    },
    answers:
      '`{places: [{placeId, state, researchedAt?, canBuild?}], receipts: {[receipt]: {placeId, state, stage?, researchedAt?, canBuild?}}}`'
  },
  {
    method: 'GET',
    path: '/find/api/research-again',
    summary: 'Preview Research again of a researched place on the public Find',
    description:
      '`?placeId=` (a Google place id). Answers what a Research again would look at now: the parts that failed, ' +
      'are more than 30 days old, were never tried or whose rule changed, each with its reason and the most it ' +
      'may cost in cents, cut to one research job’s cap; and the parts kept. `plan` is null for a place nobody ' +
      'researched yet. Tracy pays (`payer: "tracy"`); `open: false` while the operator has closed the button. ' +
      'Never starts research. A `menu-photos` part to run carries `photos`, how many photos it would read. ' +
      '`400 INVALID_RESEARCH` for `parts` naming something that is not a research part. ' +
      '`404 FEATURE_OFF` while either switch is off.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    params: {
      query: { placeId: 'A Google place id from the public search.', parts: AGAIN_PARTS_DOC }
    },
    answers:
      '`{placeId, plan: {run: [{part, reason: "never" | "failed" | "outdated" | "rule-changed", ceilingCents, photos?}], kept: [{part, reason: "up-to-date" | "none" | "unavailable" | "over-cap", detail?}], ceilingCents} | null, payer: "tracy", open}`'
  },
  {
    method: 'POST',
    path: '/find/api/research-again',
    summary: 'Research a researched place again on the public Find, without signing in',
    description:
      'Body `{placeId, parts?}` and nothing else (any other field, or `parts` naming something that is not a ' +
      'research part, is `400 INVALID_RESEARCH`). Runs only the parts that ' +
      'are due, paid by Tracy from the strangers’ research budget, at most a set number of times a place a UTC ' +
      'day, within the same per-address and per-day limits as a first research. A run already going is joined. ' +
      '`state: "up-to-date"` when nothing is due; `state: "refused"` with `PUBLIC_AGAIN_LIMIT`, ' +
      '`PUBLIC_RESEARCH_LIMIT`, `PUBLIC_RESEARCH_SPENT` or `NOT_RESEARCHED`. Follow the receipt with ' +
      '`GET /find/api/research?receipts=`. `404 FEATURE_OFF` while either switch is off.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    body: {
      type: 'object',
      required: ['placeId'],
      properties: {
        placeId: { type: 'string' },
        parts: {
          oneOf: [{ type: 'array', items: { type: 'string' }, minItems: 1 }, { type: 'string' }],
          description: AGAIN_PARTS_DOC
        }
      }
    },
    answers: '`{placeId, state: "queued" | "running" | "up-to-date" | "refused", receipt?, code?, plan}`'
  },
  // src/seats/route.js
  {
    method: 'GET',
    path: '/:label/join',
    summary: 'Show the "Request to join" page for a site',
    description:
      'A plain HTML page for a site that has no seat for the viewer yet. Signed-out viewers are sent to ' +
      '`/login`. If the viewer already holds an invitation the page shows an Accept button; if they asked ' +
      'already, it says so; otherwise it offers "Request to join". 404 for an unknown label.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: { label: 'The site’s short name (lowercase letters, digits, hyphens; never `api`).' },
      query: { next: 'Where to go afterwards; defaults to the site’s team page.' }
    },
    answers: 'HTML'
  },
  // src/seats/route.js
  {
    method: 'POST',
    path: '/:label/join',
    summary: 'Ask the site’s owners for access',
    description:
      'Records a join request from the signed-in viewer and emails the site’s owners. Answers ' +
      'the same HTML page, saying the request was sent, or that the viewer is already invited, already has ' +
      'a seat, or that the site has no owner. Signed-out viewers are sent to `/login`.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: {
      path: { label: 'The site’s short name.' },
      query: { next: 'Where to go afterwards; kept from the page’s own URL.' }
    },
    answers: 'HTML'
  },
  // src/github/route.js
  {
    method: 'POST',
    path: '/fleet/git-token',
    summary: 'Get a fresh GitHub push token for a fleet host',
    description:
      'A fleet host names itself and signs the raw body with its own host secret in `x-tracy-signature` ' +
      '(hex HMAC-SHA256). Answers a GitHub App installation token for the site’s own repo, read from the ' +
      'site record, or for Tracy’s shared design-inspirations repo when no site is named.',
    audience: ['fleet'],
    auth: 'signature',
    internal: true,
    body: {
      type: 'object',
      required: ['host'],
      properties: {
        host: { type: 'string', description: 'The calling host’s name; picks the secret checked.' },
        siteKey: { type: 'string', description: 'The site whose repo is wanted; omit for the shared repo.' },
        label: {
          type: 'string',
          description:
            'Required with `siteKey`: the site’s label on the calling host. The site record must name this host ' +
            'and this label, or the answer is `REPO_NOT_YOURS`.'
        },
        repo: { type: 'string', description: '`owner/name`; must match the site’s repo when given.' }
      }
    },
    answers: '`{ token, expiresAt, repo }`'
  },
  // src/github/route.js
  {
    method: 'POST',
    path: '/github/release',
    summary: 'Receive a GitHub release event for quickstarts',
    description:
      'GitHub webhook, verified by `x-hub-signature-256` against the webhook secret. When the release event ' +
      'is one Tracy cares about, re-reads the quickstart releases at once instead of waiting for the ' +
      'ten-minute sweep. Every signed call answers 200 so GitHub does not retry.',
    audience: ['fleet'],
    auth: 'signature',
    internal: true,
    body: { type: 'object', description: 'GitHub release event payload.' },
    answers: '`{ read: n }` or `{ ignored: true }`'
  },
  // src/github/route.js
  {
    method: 'POST',
    path: '/github/push',
    summary: 'Check a push to a site repo for code changes',
    description:
      'GitHub webhook, verified by `x-hub-signature-256`. For a push to `main` of a site repo, compares the ' +
      'change: data-only pushes answer `clean`, recorded merges `sanctioned`, and a code change that no ' +
      'recorded merge covers answers `alerted`. Every signed call answers 200.',
    audience: ['fleet'],
    auth: 'signature',
    internal: true,
    body: { type: 'object', description: 'GitHub push event payload.' },
    answers: 'One of `{ clean }`, `{ sanctioned }`, `{ alerted }`, `{ ignored }`'
  },
  // src/mail/site-mail/route.js
  {
    method: 'POST',
    path: '/_site-mail',
    summary: 'Send a customer site’s outgoing mail',
    description:
      'Called by the sendmail replacement inside a site’s container over the internal Docker network; ' +
      'requests on Tracy’s public hostname get 404. `x-tracy-site` names the site and `x-tracy-token` is ' +
      'a token derived from its host secret. The body is a raw email (up to 10 MB), relayed per site mail policy.',
    audience: ['site'],
    auth: 'token',
    internal: true,
    answers: 'The relay result as JSON; 429 when a sending limit is reached'
  },
  // src/mail/site-mail/route.js
  {
    method: 'GET',
    path: '/api/ops/mail',
    summary: 'Read site mail settings and usage for all sites',
    description:
      'For /ops: whether site mail is on, its mode and sending domain, the global daily cap and today’s ' +
      'use, per-site defaults, how many domains the Resend account holds, and every site’s mode, limits, ' +
      'domain and last error. `writable` says whether the viewer may change them.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'Site mail overview JSON'
  },
  // src/mail/site-mail/route.js
  {
    method: 'PUT',
    path: '/api/ops/mail/sites/:key',
    summary: 'Change one site’s mail mode or limits',
    description:
      'Staff with the owner or admin role only, and the `Origin` must be Tracy’s own. Sets the mode and ' +
      'hourly/daily overrides (null means the default). Leaving `tracy-domain` removes the site’s domain ' +
      'first. Written to the audit log.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: SITE_KEY },
    body: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: MAIL_MODES },
        hourly: { type: ['integer', 'null'], minimum: 0, maximum: 1000000 },
        daily: { type: ['integer', 'null'], minimum: 0, maximum: 1000000 }
      }
    },
    answers: 'The site’s updated row'
  },
  // src/mail/site-mail/route.js
  {
    method: 'DELETE',
    path: '/api/ops/mail/sites/:key/domain',
    summary: 'Release a site’s own mail domain',
    description:
      'Staff with the owner or admin role only, and the `Origin` must be Tracy’s own. Deletes the domain on ' +
      'Resend when Tracy created it there, clears it from the site, and moves `tracy-domain` back to ' +
      '`tracy`. Written to the audit log.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: { path: SITE_KEY },
    answers: 'The site’s updated row'
  },
  // src/mail/site-mail/route.js
  {
    method: 'GET',
    path: '/api/ops/mail/log',
    summary: 'Read the site mail log',
    description: 'For /ops: the most recent site mail log entries, newest first, for all sites or one.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    params: {
      query: { siteKey: 'Only this site’s entries.', limit: 'How many entries, 1 to 500; default 100.' }
    },
    answers: '`{ entries }`'
  },
  // src/mail/site-mail/route.js
  {
    method: 'GET',
    path: '/api/sites/:key/mail',
    summary: 'Read a site’s mail settings',
    description:
      'For the site’s owners only (403 `NOT_SITE_OWNER` for an editor or viewer): the mode, the From address, where replies go, its own domain with ' +
      'status and DNS records, its own SMTP server (never the password, only `hasPassword`), limits and ' +
      'today’s count. 503 when site mail is off.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: SITE_KEY },
    answers: 'Site mail settings JSON'
  },
  // src/mail/site-mail/route.js
  {
    method: 'PUT',
    path: '/api/sites/:key/mail',
    summary: 'Change a site’s mail settings',
    description:
      'For the site’s owners only. Sets the mode, and optionally the site’s own sending domain ' +
      '(registered on Resend, one site per domain) or its own SMTP server (password stored encrypted; omit ' +
      'it to keep the stored one). Leaving `tracy-domain` removes the domain. Written to the audit log.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: SITE_KEY },
    body: {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: { type: 'string', enum: MAIL_MODES },
        domain: { type: ['string', 'null'], description: 'Own sending domain; null removes it.' },
        smtp: {
          type: ['object', 'null'],
          description: 'Own SMTP server; null removes it.',
          properties: {
            host: { type: 'string' },
            port: { type: 'integer' },
            user: { type: 'string' },
            password: { type: 'string' }
          }
        }
      }
    },
    answers: 'The updated mail settings'
  },
  // src/mail/site-mail/route.js
  {
    method: 'POST',
    path: '/api/sites/:key/mail/verify',
    summary: 'Check a site’s mail domain again',
    description:
      'For the site’s owners only. Asks Resend to verify the site’s own domain and stores the new ' +
      'status and DNS records. If Resend no longer has the domain, it is registered again. Written to the ' +
      'audit log.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: SITE_KEY },
    answers: 'The updated mail settings'
  },
  // src/mail/site-mail/route.js
  {
    method: 'DELETE',
    path: '/api/sites/:key/mail/domain',
    summary: 'Remove a site’s own mail domain',
    description:
      'For the site’s owners only. Deletes the domain on Resend when Tracy created it there, clears it ' +
      'from the site, and moves `tracy-domain` back to `tracy`. Written to the audit log.',
    audience: ['customer'],
    auth: 'session',
    internal: false,
    params: { path: SITE_KEY },
    answers: 'The updated mail settings'
  },
  // src/api-reference/route.js
  {
    method: 'GET',
    path: '/ops/api',
    summary: 'Open the internal API reference',
    description:
      'The same reference as /docs/api, with every route included — the staff, fleet and machine-to-machine ones too. Signed-out visitors are sent to /login; a signed-in person without a Tracy admin seat gets 403.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'An HTML page'
  },
  // src/api-reference/route.js
  {
    method: 'GET',
    path: '/ops/api/openapi.json',
    summary: 'Read the internal OpenAPI document',
    description: 'The OpenAPI 3.1 document of every route, internal ones included, built on each request.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'An OpenAPI 3.1 document'
  },
  // src/api-reference/route.js
  {
    method: 'GET',
    path: '/docs/api/claude-cowork.json',
    summary: 'Read the OpenAPI document of the Claude Cowork plugin',
    description:
      'The HTTP surface of the Claude Cowork plugin on a customer Joomla or WordPress site (its action door and /content.json), as an OpenAPI 3.1 document; the second source of the reference page.',
    audience: ['public'],
    auth: 'none',
    internal: false,
    answers: 'An OpenAPI 3.1 document'
  },
  // src/api-reference/route.js
  {
    method: 'GET',
    path: '/ops/api/scalar.js',
    summary: 'Load the API reference viewer script for the staff reference',
    description:
      'The Scalar viewer bundle the staff reference page loads, from its own origin. With `?v=` matching the ' +
      'hash of the bytes it is cached for a year; otherwise for five minutes. Answers 503 when the bundle is ' +
      'not installed on the server.',
    audience: ['team'],
    auth: 'none',
    internal: true,
    params: { query: { v: 'Hash of the bundle, set by the page; enables long caching when it matches.' } },
    answers: 'JavaScript'
  },
  // src/api-reference/route.js
  {
    method: 'GET',
    path: '/ops/api/claude-cowork.json',
    summary: 'Read the Claude Cowork plugin document for the staff reference',
    description:
      'The same document as `/docs/api/claude-cowork.json`, served under `/ops/api` so the staff reference ' +
      'page reads every source from its own origin.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'An OpenAPI 3.1 document'
  },
  // src/api-reference/route.js
  {
    method: 'GET',
    path: '/ops/api/agent-tools.json',
    summary: "Read the catalogue of the agent's tools",
    description:
      'Every tool the Tracy agent is given, per surface (Joomla, WordPress, EmDash, sealed or not): the description the model reads, its parameters, and the Apply action each call becomes. Generated from the site tools and kept equal by the `agent-tools` gate.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'An OpenAPI 3.1 document with the catalogue in its description'
  },
  // src/api-reference/route.js
  {
    method: 'GET',
    path: '/ops/api/site-address.json',
    summary: "Read what a customer site's own address answers before the site",
    description:
      'The paths Tracy answers on https://<site address>/ (build and error reports, the address probe, robots.txt, the proxy to the site) as an OpenAPI 3.1 document.',
    audience: ['team'],
    auth: 'admin',
    internal: true,
    answers: 'An OpenAPI 3.1 document'
  },
  // src/api-reference/route.js
  {
    method: 'GET',
    path: '/docs/api/llms.txt',
    summary: 'Read the public reference as llms.txt',
    description:
      'The public API reference as plain text in the llms.txt format: one line per operation, grouped as on the page, with links to the page and the OpenAPI document. For language models and quick reading.',
    audience: ['public', 'agent'],
    auth: 'none',
    internal: false,
    answers: 'text/plain'
  },
  // src/speech/route.js
  {
    method: 'GET',
    path: '/api/speech',
    summary: 'Read whether voice input is available',
    description:
      'Voice consumers refresh these facts before starting a session. `available` is true when this deployment has a speech key and the operator has voice on (the User Interface switch `composer-voice-input`, /ops › Agents › Voice); it does not promise the speech service accepts that key — a session it refuses ends with `provider` (see `GET /api/speech/stream`). `sessionSeconds` is the longest a voice session runs and `silenceSeconds` how long it waits for a word before it ends. Where voice is available the chat header also offers a voice conversation: `voices` are the voices Tracy may read its replies in (`id`, `name`; the first is the default) and `speak` the longest reading `POST /api/speech/say` takes (`maxChars`) and the rate its sound comes at (`sampleRate`). `provider` names the primary and `actualProvider` the initial effective provider; WS ready is authoritative if fallback occurs. `revision`, provider-correct `voices`, `transcriptWaitMs` and `capabilities` describe PCM16k STT/PCM24k TTS; `speak.answerMs` bounds a reading. VoiceStudio reports tts.streaming=false and tts.prewarm=false. No credentials or provider URLs are exposed here. 401 `NOT_SIGNED_IN`.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false,
    answers:
      '`{available: boolean, sessionSeconds: number, silenceSeconds: number, voices: {id: string, name: string}[], speak: {maxChars: number, sampleRate: number}}`'
  },
  // src/speech/route.js (the socket itself: src/speech/relay.js)
  {
    method: 'GET',
    path: '/api/speech/stream',
    summary: 'Dictate into the chat box (WebSocket)',
    description:
      'A WebSocket opened by a page on Tracy’s own origin (`Origin` must be the app’s; a `Sec-Fetch-Site` other than `same-origin` is refused) with a session cookie. The page sends the microphone as binary frames of PCM, 16-bit little-endian, mono, 16 kHz, at most one second each, and `{"type":"stop"}` when the person is done; it receives `{"type":"ready",provider,actualProvider,primaryProvider,fallbackUsed,revision,sessionToken,voices,capabilities,speak,transcriptWaitMs}`, `{"type":"partial","text"}` (the phrase being spoken, revised as it goes), `{"type":"committed","text"}` (a finished phrase), `{"type":"language","code"}` (the language heard, ISO 639) and finally `{"type":"end","reason","settled"}` before the socket closes. `reason` is `stopped`, `time-limit` (five minutes of audio), `silence` (30 seconds without a word), `quota` (the account’s daily minutes of audio, or the deployment’s, are used: every second of audio received counts, never a whole minute per session), `elsewhere` (the same account opened another session), `provider`, `provider-busy` or `network`; `settled` is false when the last phrase was not confirmed before the close. `?language=<code>` names the language the conversation is in (the chat box sends its first clear message’s, else the interface’s); the service is told it only for `vi`, where it keeps a phrase that switches to English that it would otherwise drop, and when it then hears speech it makes nothing of (another language) the session is reopened without it and the phrase replayed, once. Any other code, or none: the service recognises the language itself. `?turns=voice` is a voice conversation, where Tracy answers when the person stops: a phrase is finished after 0.8 seconds of silence instead of the service’s default 1.5 (dictation). `?site=<site key>` names the site the page stands in: for a site in the keyterms pilot (`PUT /api/ops/speech/keyterms`, none by default) and an account with a live seat on it, the session asks ElevenLabs to listen for the site’s own names, read on the server; the page never sends a name, and any other site, or none, changes nothing. When the service starts a phrase again at a language switch, the words already sent stay as a `committed` phrase, so words on screen never vanish. ElevenLabs-only language rescue and duplicate handling do not apply to VoiceStudio. VoiceStudio uses its server-active ASR engine and authoritative final summary, with bounded utterance sessions. Ready chooses one coherent STT/TTS provider; runtime failure after audio stops without replay. The opaque sessionToken binds subsequent say requests to this exact account and snapshot for thirty minutes. Audio and words are relayed, never stored. A handshake is refused with 404 when this deployment has no speech key or the operator has voice off, 503 when the switch cannot be read, 403 from another origin and 401 without a session. Asked over plain HTTP, answers 426 `UPGRADE_REQUIRED`.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false,
    answers: 'A WebSocket; over plain HTTP, 426 `{code: "UPGRADE_REQUIRED"}`'
  },
  // src/speech/say.js
  {
    method: 'POST',
    path: '/api/speech/say',
    summary: 'Read a reply of Tracy out loud',
    description:
      'A voice conversation reads the start of Tracy’s reply, and short lines while Tracy works, through this door. Body `{text, voice?, language?, revision?, sessionToken?}`: `text` at most `speak.maxChars` characters (600), `voice` one of `GET /api/speech` `voices` (the first when absent), `language` an ISO 639-1 code the service is told only for the interface languages. The answer is raw speech (VoiceStudio may return it only after full synthesis): 16-bit little-endian mono PCM at `x-sample-rate` (24000) Hz. The speech key stays on the server and needs the Text to Speech permission. Characters are counted before the service is asked, per account (20,000 a day) and for the deployment (300,000 a day); a reading the service refuses gives them back. Neither the words nor the sound are logged. A sessionToken from WS ready keeps this reading on its listening provider, including fallback; x-speech-provider and x-speech-fallback name the actual result. 409 `VOICE_RESTART_REQUIRED` for a changed revision, expired/unknown/cross-account token, or ambiguous legacy snapshots. Legacy requests remain compatible when their retained snapshots share one provider and revision. Standalone requests may make one enabled pre-output provider fallback attempt, including upstream credit/rate failure, while Tracy quota always refuses. No fallback or replay after spoken output. 400 `TEXT_MISSING` | `TEXT_TOO_LONG` | `VOICE_UNKNOWN`; 401 `NOT_SIGNED_IN`; 404 `VOICE_OFF` (no key, or the operator has voice off); 429 `SPEAK_QUOTA`; 502 `SPEAK_PROVIDER`; 503 `SPEAK_PROVIDER_BUSY` or `SPEAK_UNAVAILABLE` (a switch or the budget could not be read).',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: false,
    answers: '`application/octet-stream` (PCM, `x-sample-rate`), or `{code}` on a refusal'
  },
  // src/speech/trace.js
  {
    method: 'POST',
    path: '/api/speech/trace',
    summary: 'Report how long a voice turn took',
    description:
      'Called by the voice conversation once a turn it sent is done with: how long each step took, as the page measured it on its own clock (`performance.now()`), never a browser time set against the server’s. Spans in milliseconds: `speechToCommit` (the person stopped speaking → the speech service confirmed the phrase), `commitToSent` (→ the message was sent), `sentToAck` (→ Tracy’s “got it” started to be heard), `sentToReply` (→ the reply started to be heard) and `speechToReply`, the whole wait; each only when both of its moments were reached. Flags, 0 or 1: `ackCached` (the “got it” played from the page’s copy), `error` (not sent, a failed turn, a reply that could not be read), `interrupted` (cut off before its reply was heard), `pressed` (sent by Send now). Numbers only: any other field is ignored, a span that is not a finite number from 0 to 600000 is dropped, and no words are sent or kept. Kept once per `id`, so the page may send the same report by `fetch` and by `navigator.sendBeacon` (a `text/plain` body of the same JSON is read). At most 1024 bytes and 600 reports an account an hour. Read back, staff left out, on `/api/ops/speech` as `turns`.',
    audience: ['customer', 'desktop'],
    auth: 'session',
    internal: true,
    body: {
      type: 'object',
      required: ['id'],
      properties: {
        id: {
          type: 'string',
          description: 'The id the page drew for this turn (8 to 64 of A–Z, a–z, 0–9, _ and -)'
        },
        speechToCommit: { type: 'number', description: 'Milliseconds' },
        commitToSent: { type: 'number', description: 'Milliseconds' },
        sentToAck: { type: 'number', description: 'Milliseconds' },
        sentToReply: { type: 'number', description: 'Milliseconds' },
        speechToReply: { type: 'number', description: 'Milliseconds' },
        ackCached: { type: 'integer', enum: [0, 1] },
        error: { type: 'integer', enum: [0, 1] },
        interrupted: { type: 'integer', enum: [0, 1] },
        pressed: { type: 'integer', enum: [0, 1] }
      }
    },
    answers:
      '`{ok: true}`; 400 `INVALID_TRACE` | `INVALID_TRACE_ID`; 401 `NOT_SIGNED_IN`; 413 `TRACE_TOO_LARGE`; 429 `RATE_LIMITED`'
  }
]
