# Plugins

Website Opportunities is extended through four kinds of small plugin. Each kind has an interface, a
loader and one working example in this repository. This page gives one section per kind.

| Kind | Interface and loader | Example |
|---|---|---|
| Source | `src/plugins/sources.js` | `src/plugins/sources/osm.js` |
| Scoring rule | `domain/opportunity-score.mjs`, loader in `src/plugins/scoring.js` | `domain/scoring/no-website.mjs` |
| Outreach template | `src/plugins/outreach.js` | `src/plugins/outreach/en/demo.json` |
| Builder | `src/plugins/builders.js` | `src/plugins/builders/manual.js` |

Every plugin file is a module whose **default export** is the plugin (a plain object, or for a builder
a factory). A loader reads a folder in file-name order and checks each plugin; a malformed one stops
the load with a `TypeError` that names what is wrong.

General rules for every plugin:

- **No hidden network access.** Take `fetch` from `deps`; never import a global HTTP client.
- **Unknown is `null`.** Never return a guessed value.
- **Keep the source.** Every value you return says where it came from.
- **English** for code, comments and identifiers.

## 1. Sources (`src/plugins/sources/`)

A source answers one or more *capability groups* (`domain/capabilities.mjs`): a question research can
ask, such as "Find places in an area" (`map-discovery`), "Web search" or "Tripadvisor reviews". A
discovery source finds businesses in an area; an evidence source collects what is public about one
business.

**Interface** (`defineSource` checks it):

```js
export default {
  id: 'osm',                 // kebab-case; the provider id the operator orders
  label: 'OpenStreetMap',    // what the settings page shows
  credential: null,          // the key it needs (a PROVIDER_CREDENTIALS name), or null
  groups: ['map-discovery'], // capability groups it answers
  discover: async ({ lat, lon, radiusM, limit }, deps) => [/* candidates */], // for map-discovery
  // collect: async (place, deps) => evidence                                  // for any other group
}
```

`deps` carries `fetch` (plus `resolve` and `timeoutMs`), and `key` when the source has a credential.
Throw on a provider failure; set `code` or `status` on the error (`TIMEOUT`, `QUOTA` or 429, 401/403,
5xx) so the next provider can be tried. Fetch untrusted URLs only through `fetchLimited`
(`domain/fetch-limited.mjs`) and the URL guard (`domain/url-guard.mjs`).

A candidate has this shape (fields you do not have are left out, not set to empty strings):

```js
{
  provider: 'example',         // your source id
  providerId: 'abc123',        // the id of this place at the provider
  name: 'Corner Cafe',
  address: '1 Main Street, Springfield',
  phone: '+1 555 0100',
  lat: 40.0,
  lon: -74.0,
  website: 'https://corner-cafe.example',
  socials: { facebook: 'https://www.facebook.com/cornercafe' }
}
```

**Loader and runner:**

- `sourceRegistry(sources)` checks a list (built-in: `BUILT_IN_SOURCES`) and answers `get(id)`,
  `list()` and `forGroup(groupId)`.
- `loadSources(dir)` adds every source file of a folder to the built-in ones.
- `discoverInOrder(registry, order, area, { keys, fetch, ... })` asks the discovery sources in the
  operator's order (`resolveOrder(providerOrder, 'map-discovery')`) through `runInOrder`: the first
  with candidates answers, one with none ends the search as `not_found`, a missing key or a failure
  falls to the next.

**Example:** `src/plugins/sources/osm.js` wraps the OpenStreetMap search (`searchRestaurants` in
`domain/discovery-osm.mjs`) without changing it. Test: `test/plugins-sources.test.mjs`.

**The other built-in providers** still run through their own code: the Find search calls
`discoverRestaurants` (`domain/discovery-gmaps.mjs`), which tries Google Places, then Apify Google
Maps, then OpenStreetMap; research calls the evidence providers of each group in
`src/place-executor.js`. Each would register the same way as `osm`, for example:

```js
// Google Places as a source (not registered yet)
import { searchRestaurantsGplaces } from '../../../domain/discovery-gplaces.mjs'
export default {
  id: 'google', label: 'Google Places API', credential: 'google', groups: ['map-discovery'],
  discover: (area, deps) => searchRestaurantsGplaces(area, { ...deps, googleKey: deps.key })
}
```

Moving the Find search and research onto the registry is the next step; until then a new source is
used by code that calls `discoverInOrder` or the registry directly. For the operator to order a new
provider on the settings page, add it to its group in `domain/capabilities.mjs` too.

### Kinds of business an area search finds (`domain/trade-search.mjs`)

An area search finds every kind of local business unless the person picks one (`trade` in
`POST /search`; `GET /capabilities` lists them as `trades`). What each kind asks the map providers for
is data in `domain/trade-search.mjs`, one row per kind:

- `google`: Google Places (New) Table A types, sent as Nearby `includedTypes` (at most 50).
- `osm`: OpenStreetMap tags, `[key, [values]]`, or `[key, null, [except]]` for "any value but these".
- `phrase`: the words a Google Maps (Apify) search uses.

"Any local business" is `ANY_GOOGLE_TYPES` on Google (one call, at most 50 types), every row's OSM tags
in one Overpass query, and one phrase per kind on Apify with the place budget split between them. To
add a type, put it in its row and in the same trade in `domain/trades.mjs`, which files a found place
under its trade; `test/domain-trade-search.test.mjs` checks that the two agree and that no row passes
50 types. Only businesses that sell to the public belong here: no government office, school,
hospital, place of worship, ATM, parking, mall or department store. Food and drink keeps its own
search (`domain/place-kinds.mjs`), with cuisines and the six Find tabs.

### Sub-trades: the words a brief speaks in

A trade picks the template; its **sub-trade** picks the words (`domain/sub-trades.mjs`). Each trade
that needs it has a closed list (fitness: gym, studio, coaching, club; beauty: salon, spa, barber;
health: clinic, dentist, vet, pharmacy), and each sub-trade a fixed, hand-written word set in
`domain/trade-words.mjs` (`SUB_TRADE_WORDS`). The business-reading model call, the one that already
reads services and audience, picks one id with 1 to 3 verbatim quotes (Google types and the social
category are quotable, the business name is not); code checks every quote. Without a usable pick,
Google's types decide (`sports_club` decides nothing), else the trade's own words stay. The brief
keeps `business.subTrade {id, method: model | table | trade, quotes}`. To add a sub-trade: its
entry in `SUB_TRADES`, its words in `SUB_TRADE_WORDS`, its Google types in the table, and a case in
`test/domain-sub-trade.test.mjs`.

## 2. Scoring rules (`domain/scoring/`)

The opportunity score runs from 0 to 100 with a grade (A from 75, B from 50, else C) and the list of
reasons behind it. It is the sum of what each rule gives, halved once for a chain and once for a
place marked temporarily closed (those two are fixed, not rules).

The engine and the built-in rules live in `domain/` because the browser client bundles them; files
there import nothing outside `domain/` and no npm package.

**Interface** (`defineScoringRule` checks it):

```js
export default {
  id: 'no-website',  // kebab-case, unique
  weight: 40,        // the most points it can give; more is cut to the weight, less than 0 to 0
  holdsScore: false, // optional: true makes the score `pending` while this rule answers `points: null`
  score({ candidate, siteCheck, social, slowSiteThreshold, now }) {
    if (candidate.website) return null              // does not apply: no reason is listed
    return { points: 40, reason: 'web.none' }       // reason = the translation key the UI shows
  }
}
```

`points: null` means the data the rule needs is still being checked (the UI shows a spinner); `0`
means "checked, no points". A rule is pure: no clock but `now`, no network.

**Built-in rules, in order:** `no-website` (40), `website-health` (40: down, slow, insecure, not
mobile-friendly or dated), `demand` (30: reviews and rating), `marketing` (20: the last social post),
`contact` (10). `scoreOpportunity` is `scoreWithRules(BUILT_IN_SCORING_RULES, input)`.

**Loader:** `loadScoringRules(dir)` (`src/plugins/scoring.js`) returns the built-in rules followed by
every rule file of a folder; pass the result to `scoreWithRules`. A rule the project accepts is added
to `domain/scoring/` and to `BUILT_IN_SCORING_RULES`. Find still scores with the built-in rules;
letting an operator add a folder of rules is not wired yet.

**Example:** `domain/scoring/no-website.mjs`. Test: `test/plugins-scoring.test.mjs`, which also checks
that the built-in rules give byte-identical scores to the single function they replaced.

## 3. Outreach templates (`src/plugins/outreach/<lang>/`)

An outreach template is the text of a first message in one language. The app never sends it: it
drafts it, and the user copies or sends it.

**Interface:** one folder per language (`en`, `pt`, `pt-BR`), one JSON file per kind of message. The
only kind today is `demo.json`, the offer of a demo website. Five strings with three placeholders:
`{place}` (the business name), `{url}` (the demo link) and `{expires}` (the date the demo is kept
until, formatted for the language).

| Key | Used for |
|---|---|
| `greeting` | First line |
| `body` | The offer, must contain `{url}` |
| `expiry` | Closing line when the demo has an end date, must contain `{expires}` |
| `kept` | Closing line when the demo has no end date |
| `subject` | Email subject |

```json
{
  "greeting": "Hello {place} team,",
  "body": "I made a free demo website for {place}: {url}",
  "expiry": "Have a look. The demo is available until {expires}.",
  "kept": "Have a look at the demo.",
  "subject": "A demo website for {place}"
}
```

**Loader:** `src/plugins/outreach.js` reads the built-in file `src/outreach-templates.json` (keyed by
language) and every `outreach/<lang>/` folder when the server starts. A language defined in both
places is refused, and English is required (it is the fallback). Every language with a template is a
language a message can be drafted in (`MESSAGE_LANGUAGES`). `src/outreach-countries.json` maps a
country (and a phone prefix) to the language a message should use; add your country there when you
add a language.

**Example:** `src/plugins/outreach/en/demo.json`, the English template moved out of the built-in
file. Test: `test/plugins-outreach.test.mjs`. To move another language to a folder, delete its entry
from `outreach-templates.json` in the same change.

Write the text as a native speaker would. Keep it short, polite and free of claims you cannot back up.

## 4. Builders (`src/plugins/builders/`)

A builder turns an opportunity's research into a website, somewhere else. The router takes one
(`deps.builder`); without one, nothing builds and the demo fields are left out of every answer.

**Interface** (`defineBuilder` checks it): exactly the members the router calls.

| Member | Called for |
|---|---|
| `id` | kebab-case name |
| `routes(app, ctx)` | mounts the builder's own doors on the router's Hono app; `ctx` holds the router's helpers (`caller`, `refuse`, `notFound`, `featureOn`, `featureOff`, `domainOr`, `domainDeps`, `runtime`, `body`, `candidateFields`, `urlFields`, `jobShape`, `startResearch`, `UUID`, `REQUEST_ID`) |
| `settingsOf(domain, accountId)` | `GET /settings` |
| `saveSettings(domain, accountId, sent)` | `PUT /settings`, returns `{ status, body }` |
| `templateChoicesOf(settings)` | `templates` of `GET /capabilities` |
| `listedDemoOf(accountId, ids)` | a `Map` of the demo columns of listed rows |
| `detailOf(opp, accountId)` | the demo half of `GET /:id` |
| `demoFactsOf(accountId, ids)` | a `Map` of `{ built, liveSiteKey, queuedActionId }` for Find |
| `demoJourneySql` | `null`, or SQL fragments that move a row to the Demo and Outreach stages |

A list of ids may hold ids that are not the account's: answer only for the account's own. A builder
file's default export is a factory, `(deps) => builder`; `loadBuilderFactories(dir)` returns them by
file name.

**Builders in this repository:**

- **`manual`** (`src/plugins/builders/manual.js`, the example): "Build demo" makes the site brief
  from the current research and keeps it as `brief.json` and `brief.md` in the host's file store;
  the person downloads the Markdown, gives it to whoever builds the site, then records the link of
  the demo built elsewhere. Doors: `POST /:id/manual/brief`, `GET /:id/manual/brief.md`,
  `PUT /:id/manual/built` (`{ "url", "note"? }`), `DELETE /:id/manual/built`. It calls no other
  service. Outreach drafts are made only for demos that passed a quality check, so a demo recorded
  here does not get one yet. Test: `test/plugins-builders.test.mjs`.
- **`tracy`** (`src/plugins/builders/tracy.js`, the standalone server's builder): "Build it with
  Tracy" sends one place to [Tracy](https://tracy.ai), which builds and hosts a demo site in the
  operator's Tracy account. The operator connects the server to that account once, on the Operator
  page's Tracy tab (OAuth device flow, `src/tracy-connection.js`); the tokens stay on the server.
  The body sent is the public contract `website-opportunities/demo-request/v1`
  (`src/plugins/builders/tracy-request.js`, checked by `domain/demo-request.mjs`): business facts and
  public https photo links, nothing internal. Its menu items are the brief's dishes
  (`sitemap[].sections[].menuItems[]`), never the business's posts; a photo's caption is the one it
  was published with. The optional parts (`items.size`, `items.priceScale`, `items.photo`, `brand`,
  `links`, `posts`) go only to a Tracy that names them in `accepts` at `GET /v1/demos/options`; an
  older Tracy names none and gets the base request. A price the menu prints shortened (`55` for
  55,000) goes without its price to a Tracy that does not take `items.priceScale`, so it is never
  read as 55. A dish photo goes only when the brief accepted it or the menu card itself shows it,
  and it is one of the request's `photos` (sent first, within the 24); a post's photos only when
  they already are. Each request is a row of `wo_tracy_demo`, written with its exact body and idempotency
  key before it is sent, so a retry after a timeout reaches the same demo; a tick follows every demo
  not finished yet, as often as Tracy's `Retry-After` allows. Doors: `GET /tracy/connection`,
  `POST /:id/tracy/demo` (`{ "cms"?, "template"? }`), `POST /:id/tracy/demo/cancel`. It keeps the
  manual builder's doors beside its own, so the brief can still go to any other tool. A ready demo
  moves the row to Outreach with a draft that carries its link. Tested against a fake Tracy
  (`test/tracy-fake.mjs`): the connection, the request body and the builder end to end.

The brief both builders hand over is made by `makeSiteBrief` (`src/brief-research.js`) from the same
research read, so a brief does not depend on which builder made it.

### Demo request v2: a place profile

When `GET /v1/demos/options` announces `profile/1` in `accepts`, the Tracy builder sends
`website-opportunities/demo-request/v2`:

```js
{
  schema: 'website-opportunities/demo-request/v2',
  profile, // website-opportunities/place-profile, schemaVersion 1.0.0
  photos: [{ url: 'https://images.example/studio.jpg', caption: 'The studio', alt: 'Training room' }],
  cms: 'joomla', // optional
  template: { quickstart: 'tracy-base/j6' } // optional; requires cms
}
```

The profile contains facts and original quotations with evidence references, independently of any
template. Collections contain `Fact<Entity>` entries: read the entity through `.value`. The sender
builds it with `placeProfileFromResearch` from the stored research read, before the brief's generated
copy and content limits. `placeProfileFromBrief` and `placeProfileFromDemoRequest` convert legacy
documents; statements without provenance use a `sender-statement` source, without an invented source URL.

The complete serialized request must fit in 512 KiB of UTF-8 JSON. A profile may have at most 200
offerings, 50 people and 100 quotes. The sender never sends reviews (their text, author and links
stay in the research) and cuts each collection to its limit with `placeProfileForHost`: deterministic,
in profile order, offerings with a price or an accepted photo first; a cut collection's coverage is
`partial`. A profile still invalid after the cut is sent as base v1 instead. At most 24 photos may be sent; every `media[].value.url` and
`brand.logo.value.url` must occur verbatim in `photos[].url`. A logo counts toward that limit in v2.
The sender prioritizes the logo and accepted offering photos, excludes revoked and restricted media,
and keeps only photos it can send at public HTTPS addresses. The host still checks and fetches them.
`validateDemoRequest` validates the profile, its references and the transport envelope; unknown fields
are refused. An `assessment` or `verified` key anywhere inside the profile, including extension data,
is refused as `SENDER_CANNOT_ASSESS`. Evidence does not grant permission to publish a fact.

Without `profile/1`, the existing v1 path and its individual capabilities stay unchanged. A v2
submission refused with HTTP 422 `SCHEMA_UNSUPPORTED` (including a schema diagnostic inside
`INVALID_DEMO_REQUEST`) retries once as base v1, projected from the frozen profile. The sender logs
the fallback and atomically saves the v1 body under a **new idempotency key before sending it**.
Other refusals do not downgrade. A timeout retries the saved body under its saved key, including
after a restart; a changed body never reuses the v2 key. Shortened prices are omitted on this base
v1 fallback because an older host has not promised to interpret their scale.

Hosts announce `profile/1` only once their complete receiving path supports v2; the capability's
presence in the shared contract is not an announcement by a particular host.

**Skeleton** of an adapter for another service:

```js
// src/plugins/builders/example-builder.js
import { defineBuilder } from '../builders.js'

export default function createExampleBuilder({ pool, objects }) {
  return defineBuilder({
    id: 'example-builder',
    routes(app, ctx) { /* POST /api/website-opportunities/:id/example/build … */ },
    settingsOf: async () => ({}),
    saveSettings: async () => ({ status: 404, body: { code: 'NO_SETTINGS', next: 'Nothing to set.' } }),
    templateChoicesOf: async () => ({}),
    listedDemoOf: async () => new Map(),
    detailOf: async () => ({ demo: null }),
    demoFactsOf: async () => new Map(),
    demoJourneySql: null
  })
}
```

A builder that calls a remote service sends the brief as an immutable snapshot with an idempotency
key, so a retry after a timeout never builds or charges twice.
