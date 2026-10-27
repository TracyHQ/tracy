/**
 * Route docs for `/v1/demos` (`opportunities-build/public-demos-route.js`): demo sites an outside builder asks for
 * with an account token of scope `demos`. Documented on the api host's public reference beside `/v1`.
 */

const TOKEN =
  'An account token of scope `demos` (Connect Tracy), `Authorization: Bearer <token>`. A seat key is refused 403 `ACCOUNT_TOKEN_REQUIRED`.'
const COUNT =
  '`demos: {live, limit}`: the account’s live demo sites made through this door and the most it may have at once.'
const DEMO =
  '`demo`: `{id, status, statusUrl, createdAt, business: {name}, cms, template, site: {key, url, editUrl} | null, error: {code} | null, retention: {expiresAt, frozenAt, deletedAt}, model: "tracy" | "account", photos: {stored, skipped}}`. `status` is `queued`, `waiting-for-you`, `building`, `needs-review`, `ready` (only with its site check passed), `failed` or `cancelled`. A demo is built by the AI the account uses in Tracy (its own AI account, or Tracy’s model) in the site’s chat: `waiting-for-you` means the site exists and `site.editUrl` opens that chat, which sends the build brief; it is `building` once the brief is sent. `retention` is the Website Opportunities demo clock, started when the site exists; reading a demo never extends it.'
const PROFILE =
  'Only when `GET /v1/demos/options` announces `profile/1` in `accepts`, the host also accepts `website-opportunities/demo-request/v2`: `{schema, profile, photos: [{url, caption?, alt?}], cms?, template?: {quickstart, design?}}`. The host freezes the original profile and its own fact assessment into the build revision. The profile must name the business in `business.name.value` and follow `website-opportunities/place-profile` version `1.0.0`; collections contain facts whose entities are in `.value`. The entire UTF-8 JSON body is at most 512 KiB, with at most 200 offerings, 50 people, 100 quotes and 24 photos. Every `profile.media[].value.url` and `profile.brand.logo.value.url` must be in `photos[].url`; the logo counts toward the 24 in v2. Any `assessment` or `verified` key anywhere in the profile is refused as `SENDER_CANNOT_ASSESS`, including inside extensions. Unknown fields and invalid evidence references are refused. Every fact cites at least one evidence item, and every address in the profile is http(s) (`URL_SCHEME` otherwise), except `tel:`/`mailto:` on a link of kind `phone`/`email`. Names are at most 200 characters, texts and quotes at most 2000, addresses at most 2048 (`MAX_LENGTH`). Declared research sources remain sender statements: only identity, contact, offerings and hours are accepted under the host policy; people, claims, testimonials and reviews are withheld, except a review or rating whose every source is a Google (`google-maps`, `google-places`) or Tripadvisor (`tripadvisor`) page cited by its https address, which is accepted verbatim with its author. Other unassessed quotations stay in the frozen profile and are not imported into legacy content. Facts older than 365 days are marked stale at the frozen assessment time. Without that capability, send v1. If a v2 request receives 422 `SCHEMA_UNSUPPORTED` (possibly in the `errors` of `INVALID_DEMO_REQUEST`), a sender may fall back once to v1 using a NEW idempotency key and logging the downgrade; never send a changed body under the old key.'
const ID = { id: 'The demo id `POST /v1/demos` answered.' }

/** @type {import('./index.js').RouteDoc[]} */
export const DEMO_ROUTES = [
  {
    method: 'POST',
    path: '/v1/demos',
    summary: 'Ask Tracy for a demo site of one business',
    description: `${PROFILE} Body \`website-opportunities/demo-request/v1\` (at most 512 KiB): \`{schema, business: {name, address?, location?: {lat, lon}, phone?, website?, category?, hours?: string[], socials?: {facebook, instagram, tiktok, youtube, x}, description?, items?: [{name, price?, currency?, section?, description?, size?, priceScale?: 1000 | 10000 | 1000000, photo?}]}, photos?: [{url, caption?, alt?}] (≤ 24), cms?: "wordpress" | "joomla" | "emdash", template?: {quickstart, design?}, brand?: {logo?, colors?: [{hex: "#rrggbb", role?}] (≤ 8)}, links?: {menu?, booking?}, posts?: [{text, url?, publishedAt?, source?: "facebook" | "instagram" | "tiktok" | "youtube" | "x" | "website" | "other", photos?: url[]}] (≤ 12)}\`. An item’s \`size\`, \`priceScale\` and \`photo\`, and \`brand\`, \`links\` and \`posts\`, are taken only when \`GET /v1/demos/options\` names them in \`accepts\`. \`priceScale\` says the menu prints its prices shortened (\`55\` for 55,000) and needs a \`price\`; an item’s \`photo\` and a post’s \`photos\` must each be one of the request’s \`photos[].url\` (422 \`PHOTO_NOT_IN_PHOTOS\`). A dish photo is kept as a candidate, not shown as that dish’s photo; one photo named by two dishes is kept for neither, and one that does not download is dropped. \`brand.logo\` is fetched like a photo but is not one of the 24. A booking link is listed, never made the booking button. Posts become the demo’s content, never menu items. A field the contract does not name is refused 422 \`INVALID_DEMO_REQUEST\` with \`errors: [{path, code}]\`. Header \`Idempotency-Key\` (8–100 of \`A-Za-z0-9._:-\`) is required: the same key with the same body answers the same demo, with another body 409 \`IDEMPOTENCY_KEY_REUSED\`. Tracy fetches each photo itself and refuses 422 \`PHOTO_URL_BLOCKED\` an address that is not public (private, loopback, link-local or cloud metadata, also after a redirect); a photo that does not download is skipped and counted in \`photos.skipped\`. A demo is built from the business\u2019s own photos: with none sent it is refused 422 \`PHOTOS_REQUIRED\`, with none that downloads 422 \`PHOTOS_UNUSABLE\` (with \`photos.skipped\`), and 503 \`PHOTO_STORE_UNAVAILABLE\` when Tracy cannot keep them, nothing accepted in each case. Refused before anything is accepted: 409 \`DEMO_LIMIT_REACHED\` with \`demos\` when the account already has its most live demos (delete one in Tracy to make room), 503 \`SPONSOR_BUDGET_EXHAUSTED\` when the account has no AI account of its own and Tracy’s model budget for the month is spent, 503 \`DEMOS_UNAVAILABLE\` when Tracy is not building demos, 429 \`RATE_LIMITED\` with \`Retry-After\`. ${TOKEN}`,
    audience: ['public'],
    auth: 'token',
    internal: false,
    body: { type: 'object', required: ['schema'] },
    answers: `202 \`{demo, demos}\`. ${DEMO} ${COUNT}`
  },
  {
    method: 'GET',
    path: '/v1/demos',
    summary: 'List the demos this account asked for, newest first',
    description: `${TOKEN}`,
    audience: ['public'],
    auth: 'token',
    internal: false,
    params: {
      query: {
        limit: 'How many, 1–50 (default 20).',
        cursor: 'The `nextCursor` of the previous page, as it was.'
      }
    },
    answers: `\`{data: demo[], nextCursor, demos}\`. ${COUNT}`
  },
  {
    method: 'GET',
    path: '/v1/demos/options',
    summary: 'Read the CMS and templates a demo may be built with',
    description: `Per CMS the templates on offer and the one Tracy picks when none is named (\`pinned\`). ${TOKEN}`,
    audience: ['public'],
    auth: 'token',
    internal: false,
    answers: `\`{cms: [{cms, pinned, templates: [{design, quickstart, label}]}], defaultCms, accepts, demos}\`. \`accepts\` names the optional parts of demo-request/v1 this Tracy takes to the demo (\`items.size\`, \`items.priceScale\`, \`items.photo\`, \`brand\`, \`links\`, \`posts\`); send only those. It may also name \`profile/1\`, which alone announces support for demo-request/v2 with a place profile 1.0.0. ${COUNT}`
  },
  {
    method: 'GET',
    path: '/v1/demos/:id',
    summary: 'Read one demo’s status',
    description: `404 \`NOT_FOUND\` for a demo of another account. ${TOKEN}`,
    audience: ['public'],
    auth: 'token',
    internal: false,
    params: { path: ID },
    answers: `\`{demo, demos}\`. ${DEMO}`
  },
  {
    method: 'POST',
    path: '/v1/demos/:id/cancel',
    summary: 'Stop a demo that has not finished',
    description: `A demo stopped before its build began frees its place among the live demos; one whose build had begun keeps it until its site is deleted. Cancelling again answers the cancelled demo; a finished demo is refused 409 \`DEMO_FINISHED\` (delete its site in Tracy instead). ${TOKEN}`,
    audience: ['public'],
    auth: 'token',
    internal: false,
    params: { path: ID },
    answers: `\`{demo, demos}\` with \`status: "cancelled"\`.`
  }
]
