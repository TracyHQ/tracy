# Website Opportunities

> **Status: pre-release.** This repository is being prepared for its first public release. The code is
> being moved out of a larger application into a standalone library and server. Anything marked
> **(planned)** below is not available yet. Please do not rely on it until it is released.

Website Opportunities finds local businesses that have **no website**, or a website that **needs
replacing**, researches them from public sources, helps you **reach out** to them, and hands a
**brief** to whatever you use to build the site.

It is for people who sell websites to small businesses: freelancers, agencies, and web sellers.

## Place profile

`placeProfileFromResearch` and `validatePlaceProfile` are exported from `website-opportunities/domain`.
The contract is `domain/place-profile-schema.json` (JSON Schema 2020-12,
`website-opportunities/place-profile`, version `1.0.0`). It contains facts and verbatim quotations;
it does not contain a sitemap, generated copy, template instructions or website assessments.

Business attributes and brand attributes are `Fact<T>` values: `{id, value, evidenceRefs, language?, derivation?}`.
Every fact cites at least one evidence item. Every address is `http(s)`; only a link of kind `phone` or
`email` may use `tel:` or `mailto:`. Names hold at most 200 characters, texts at most 2000.
Collections contain entity facts: for example, `offerings[].value` holds `kind`, `name`, `section?` and
`variants[]`; a variant keeps its size, duration and price together. A price keeps its printed `raw`
value and observed `currency`/`priceScale`; an assumed currency is omitted. Media facts carry
`value.relations[]`, whose `entityId` refers to an offering fact or the business. Only an accepted
stored dish-photo link produces a `depicts` relation. Reviews carry `restrictions: ['not-on-demo']`.

The adapter is pure and deterministic. Pass `madeAt` to stamp an export, or supply the snapshot's
publication time; it never reads the clock. IDs use the provider identity, source and locator.
Without a provider identity or website, `extensions['research:identity']` records that identity is
unidentified or deployment-local. Legacy extraction versions that were not stored remain `unrecorded`.
For photo readings, `raw` preserves the stored price; the adapter cannot recover separators already
removed by an earlier collector. Missing collectors report `not_researched`, not a failed search.

`readPlaceProfile(db, {opportunityId})` (or `{placeId}`) in `src/place-profile-read.js` reads the current
shared research with the opportunity's private overlay, or the older private rows. It keeps collector
statuses, drops revoked media and calls the adapter without writing to the database. An unknown ID
returns `null`. This read API does not change the existing brief or builder paths.

## What it does

1. **Find.** Search an area or a business name and get a list of places, with their website and
   social links when they have any.
2. **Assess.** Check each place's current web presence (is the site up, is it slow, is it served
   over HTTPS, is it mobile friendly, how old is it, how active are its social pages) and turn that
   into a score that says how much the place needs a new website.
3. **Reach.** Draft an outreach message in the business's language, and list the contact channels
   found for it (phone, email, chat links).
4. **Build.** Turn the brief into a demo site with the AI you already use (Claude, ChatGPT Codex, GitHub
   Copilot, Grok, Gemini, Kimi, GLM or Qwen in Tracy's chat; ChatGPT, Claude Code, Codex, Cursor or any MCP app through Tracy MCP) and a
   template from [Tracy](https://tracy.ai)'s library, or export it with the `manual` builder for any other tool.

## From research to a sold website

The tool does the finding and the homework; the selling stays yours. A typical round for one business:

1. **Pick.** Each place in *My opportunities* carries a score and its reasons. A place with no website, or a slow, insecure or years-old one,
   and an active social page or recent reviews, is a business that is open and reachable.
2. **Build a demo before you call, with your own AI.** Owners say yes to a site they can open on their phone, far
   more than to a pitch. Press **Build demo** to get the business's brief: name and trade, what it offers, its
   current site and social pages, contact channels, opening hours, photos and reviews with where each came from,
   its colours, a suggested sitemap and what is still missing. Then:
   - **With Tracy's templates (recommended).** In [Tracy](https://tracy.ai), add a site from a template in the
     library (WordPress, Joomla or EmDash, ready-made designs and quickstarts). Give the brief to the AI you
     already pay for, in either of two ways:
     - **In Tracy's chat**, signed in with your own AI account: Claude, ChatGPT Codex, GitHub Copilot,
       Grok, Gemini (Antigravity), Kimi, GLM or Qwen.
     - **From your own AI app** through [Tracy MCP](https://docs.tracy.ai/mcp/), which connects it to that
       one website: ChatGPT, Claude, Claude Code, Codex, Cursor, or any app that speaks MCP.

     The AI fills the template with the business's real content; every change is listed and
     can be undone, and the owner can keep editing the site after you sell it. Or skip the pasting: once this
     server is connected to your Tracy account, **Build it with Tracy** on the place sends it in one step
     (see [Build demos with Tracy](#build-demos-with-tracy)).
   - **With anything else.** The `manual` builder gives the same brief as Markdown and JSON for the tool you
     build with (an AI site builder, your own template, a developer). Put the demo's address in the outreach
     preview (**Link to the demo you built**); the API also keeps it per business
     (`PUT /api/website-opportunities/:id/manual/built`), and a button for it is planned.
3. **Reach out with the demo.** The outreach draft is written in the business's language for the channel it
   answers on (email, WhatsApp, phone) and carries the demo link. Nothing is sent
   for you: you read it, change it and send it yourself.
4. **Follow up and close.** Tracking who you contacted and what they answered is not in the app yet (planned);
   keep it in your own CRM or sheet for now. Price, domain, hosting and handover are yours to agree with the
   owner. Many sellers offer hosting and small monthly changes, which turns one sale into a recurring one.

Contact businesses the way your local rules allow: some countries limit unsolicited email or messages to
companies. Keep an easy way to opt out, and remove a business that asks you to.

## Quickstart

The standalone server runs from this folder: Postgres, the app and local disk storage, one operator.

```sh
git clone https://github.com/TracyHQ/website-opportunities.git
cd website-opportunities
cp .env.example .env
printf 'OPERATOR_TOKEN=%s\n' "$(openssl rand -hex 32)" >> .env
# optional: put your keys in .env, e.g. GOOGLE_PLACES_API_KEY (OpenStreetMap needs no key)
docker compose up -d --build
```

Then open <http://localhost:8080> and paste the operator token from `.env` (`grep OPERATOR_TOKEN .env`). Port 8080
taken? Set `HOST_PORT` in `.env`. The same token calls the JSON API. Settings and the API in short:
[`src/standalone/README.md`](src/standalone/README.md).

### Build demos with Tracy

Connect once, then one button per place:

1. Open **Operator** at the top of the page, then its **Tracy** tab, and press **Connect Tracy**. The tab shows
   **Your code** and a link, **Open Tracy to allow it**.
2. Open the link in any browser, sign in to [Tracy](https://tracy.ai) (or sign up), check that Tracy shows the
   same code, and press **Allow**. The tab then reads **Connected as** your email.
3. On a place, press **Build it with Tracy** (pick a **Website builder** and **Template** beside it, or keep
   Tracy's default). Tracy makes the site from the template and the place's facts and photos.
4. The card then reads **Open in Tracy to finish the demo**. Open that link, signed in to the same Tracy account:
   it opens the site's chat, and the AI you use in Tracy builds the demo there from what this server found. That
   AI is one of the eight AI accounts you can connect in Tracy (Claude, ChatGPT Codex, GitHub Copilot, Grok,
   Gemini, Kimi, GLM or Qwen), or Tracy's own model when none is connected.
5. The card follows the build and shows the demo's link, a link to edit it in Tracy, and the date the demo is
   kept until.

Tracy limits how many demo sites an account keeps live at once; at the limit the card says how many you have and
asks you to delete one in Tracy. **Disconnect** on the same tab revokes the connection in Tracy; demos already
built stay in your Tracy account. The connection is kept on the server, never in the browser: in the standalone
server it is a file in `DATA_DIR` (`tracy-connection.json`) in **plain text, readable only by the server's own
user** (mode 0600), not encrypted. Protect that folder like the database. A demo that misuses a business's name
or content can be reported to Tracy, which takes the site down through its own process.

`TRACY_URL` (default `https://cowork.tracy.ai`) names the Tracy to connect to, so you can point the server at a
test deployment (both lines are commented out in `.env.example`: uncomment them to use them); `TRACY_API_URL` (default `https://api.tracy.ai` when `TRACY_URL` is not set) names its API when
that answers on another address.

### Bring your own keys

Website Opportunities does not ship with any API keys. You use your own, and you pay the provider
directly. Every provider below is optional except a way to find places; OpenStreetMap works with no
key at all.

| What for | Providers the code calls today |
|---|---|
| Finding places in an area or by name | Google Places API (New), Apify (Google Maps), OpenStreetMap (Nominatim + Overpass, no key) |
| Google reviews and menu photos | Google Places API, SerpApi (Google Maps); optionally Monid for up to 100 more Google reviews a place (off until added to the Google reviews order) |
| Tripadvisor reviews | SerpApi, RapidAPI (TripAdvisor), Litescrape |
| Facebook, Instagram, TikTok pages | ScrapeCreators, RapidAPI, Apify |
| YouTube channels | YouTube Data API (Google key), RapidAPI, Apify, or the public channel page (no key) |
| Reading a website | Direct crawl (no key), Apify browser, Jina Reader, Firecrawl |
| Web search (finding a place's pages when it has no website) | ScrapeCreators (Google search), SerpApi, Jina, Firecrawl |
| Site speed and mobile checks | Google PageSpeed Insights |

OpenStreetMap search goes through public Overpass instances, which are shared and rate-limit busy addresses: a
search can then answer "The map provider did not answer". Set `OVERPASS_URL` in `.env` to an Overpass of your own
(an https address the server reaches on the internet), or add a Google Places key.

For each research step you choose which providers answer and in which order, or turn the step off.
A measurement that could not be taken is shown as unknown, never guessed.

## Architecture

The project has three open layers and one interface to the outside:

```
  find  ──▶  assess  ──▶  reach  ──▶  builder (interface)
  sources     site checks     outreach        ├─ manual   (brief export)
  place store scoring         templates       ├─ tracy    (one adapter among others)
                                               └─ yours
```

- **find**: data sources turn an area or a name into businesses. Each business is stored once in a
  *place store*, with every value tagged by its source and the time it was fetched.
- **assess**: website checks (reachability, PageSpeed, HTTPS, mobile, copyright year), social
  activity, and an opportunity score from 0 to 100 with a grade (A, B, C) and the reasons behind it.
- **reach**: outreach drafts per channel and language, and a contact preview. Nothing is sent
  automatically: the app drafts, you send.
- **pipeline**: your own list of opportunities, research jobs and a cost ledger that records what
  each paid provider call cost you.
- **builder**: a small contract for long-running work. A builder receives an immutable
  brief and an idempotency key, exposes `submit`, `status` and `cancel`, and returns a receipt. A
  timeout must never create a second build or a second charge.
  - `manual` (default): writes the brief to a file you download and lets you mark the business as
    "built elsewhere", with the link.
  - `tracy`: sends the place to [Tracy](https://tracy.ai), which builds and hosts a demo site in your
    Tracy account. It is one adapter among others, not a requirement: without a connection nothing is sent.
  - Anyone can write an adapter for another site builder or for their own agency workflow. See
    [CONTRIBUTING.md](CONTRIBUTING.md).

The project is a **library plus a small server**: the same router, worker and database schema run
inside a larger host application or on their own. The host supplies a small adapter (database pool,
caller identity, rate limits, object storage, cost recording). Importing the router does not start
background jobs or run migrations by itself; the worker has explicit `start`, `stop` and `drain`
and can run as its own process. The standalone server (`src/standalone/`) is one such host: one operator,
Postgres and files on disk.

### Layout

- `domain/`: plain ESM with no npm dependency and every network call injected: discovery, crawling,
  connectors, media sniffing, brand observation, brief. Import it as `website-opportunities/domain`.
- `src/`: the server layer: the Hono router (`src/route.js`), the research executor, the place store,
  the `wo_*` schema and its migrator (`src/schema/`), and the `host` contract (`src/host.js`) a host
  application implements. Import modules as `website-opportunities/src/<file>.js`.
- `test/`: the domain's tests and fixtures. Nothing under `src/` or `domain/` imports outside this
  package (`test/package-boundary.test.mjs`).

## The shared research hub

Researching a business costs money (API calls) and time. A hub lets several servers share that work: one server
pays for a place once, the hub checks what it was sent against the source itself, and every other server reads the
checked copy instead of paying again. **The hub is off by default**: with no `HUB_*` setting the server neither
serves one nor reads one, and every research call uses your own keys.

### Use a hub

Set both of these (a hub operator gives you the token; one token per account, and its quotas belong to the account):

| Variable | Default | Meaning |
|---|---|---|
| `HUB_URL` | none | The hub's address, e.g. `https://hub.example.com` |
| `HUB_TOKEN` | none | Your hub token (`woh_...`) |
| `HUB_CONTRIBUTE` | `0` | `1`: offer what your own research read from Google back to the hub |

With a hub set, before the server pays for a place's Google details it looks the place up on the hub
(`POST /hub/v1/places/lookup`, then `GET /hub/v1/places/:id` with an ETag). A copy observed in the last 30 days is
used as research input and recorded on the place's source with provenance `hub`; anything else (no copy, an old
one, a fact the hub marked conflicted, quota spent, hub unreachable) falls back to your own paid research. Every
minute the server follows the hub's `/revocations` and `/changes` feeds from cursors it stores. A revoked or removed
place leaves the local cache, its website link is dropped, the source is due for research again, and briefs made
afterwards leave its facts out. Feeds cost no read quota, so revocations arrive even when your quota is spent. When
a cursor is too old for the hub (`410 cursor_expired`), every cached place is checked again before reading on.

### What is shared and what never leaves your server

- **Sent, only with `HUB_CONTRIBUTE=1`:** after a research run, the facts Google's own record gave for that place, in
  the closed field list of `wo-contribution/v1`: its identity, name, website, phone, address and location, each naming
  Google as the source. Facts that came from the hub are never sent back.
- **Never sent:** your opportunities and pipeline (who you contacted, replies, notes, deal status), briefs, demos,
  outreach drafts, your keys, and anything a crawler read from a website. The hub refuses such fields anyway.
- **Read from a hub:** place snapshots and the two feeds. Nothing you read is published anywhere by your server.

### Run a hub

`HUB_SERVE=1` mounts the hub on the same server under `/hub/v1` and starts two background jobs: one verifies pending
contributions by reading the named source itself (Google Place Details with your `GOOGLE_PLACES_API_KEY`, one read per
source object, under a daily budget), the other links verified businesses to a place and publishes a snapshot for
every place whose evidence changed. A contribution alone never creates a place.

What the Google verifier checks, field by field, against the record it read:

| Field | Accepted when |
|---|---|
| `identity`, `name`, `address` | the same place id; the same words, ignoring case and punctuation |
| `website` | the same host (without `www.`) and path |
| `phone` | the same digits, or the same last nine digits |
| `location` | within 150 m of Google's point |
| `rating` | within 0.1 stars and 5% of the review count (at least 5) |
| `category` | Google's primary type (`italian_restaurant`; case, spaces and hyphens ignored) |
| `opening_hours` | `periods` (`{open: {day, hour, minute}, close?}`, day 0 = Sunday): the same weekly periods in any order; `weekdayText` alone: the same lines word for word as Google's weekday descriptions |

`email`, `social_profile` and `photo_ref` have no Google field to check against: they are rejected as
`unsupported_source` until a verifier for their source exists. Operator commands:

```sh
DATABASE_URL=... node src/hub/cli.js token issue --principal <principal id>     # prints the token once
DATABASE_URL=... node src/hub/cli.js account block --account <hub account id>   # its token stops working
DATABASE_URL=... node src/hub/cli.js contribution withdraw --id <contribution id>
DATABASE_URL=... node src/hub/cli.js place revoke --place <place id> --reason "wrong data"
DATABASE_URL=... node src/hub/cli.js place suppress --place <place id> --reason "owner asked"   # never comes back
DATABASE_URL=... node src/hub/cli.js media revoke --media <media id> --reason "not theirs"
```

The hub does not research places on request for someone else: a lookup that finds nothing answers `not_found`.

## Data and privacy

- **You are responsible for your keys.** Each provider has its own terms of service. When you use your
  own API key, you are responsible for following that provider's terms, including what you may store
  and for how long. The hub run by Tracy is responsible only for the data Tracy itself holds.
- **Public business information only.** The tool collects information that businesses publish about
  themselves (listings, websites, social pages). Your outreach pipeline is private to you.
- **Removal requests.** A hub operator removes a business at its request (`place suppress`); every identity it
  was known by is recorded so the same data is not accepted again, and readers drop their copies through the
  revocation feed.
- **Research data is untrusted.** Text collected from the web can contain instructions aimed at an AI
  model. The code treats it as data all the way to the brief; see [SECURITY.md](SECURITY.md).

## Contributing

Contributions are small plugin files: data sources, scoring rules, outreach templates for a
language, and builder adapters. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/plugins.md](docs/plugins.md).

## License

[Apache License 2.0](LICENSE). See also [NOTICE](NOTICE).
