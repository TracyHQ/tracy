# Website Opportunities, standalone

Run the open Website Opportunities layer on its own: find local businesses around a place (any kind, or one kind
such as food and drink, beauty or home services), see which ones need a website, and research them. One operator, one Postgres database, your own provider keys. Demos are
built by Tracy once the operator connects this server to a Tracy account (Operator page, Tracy tab); the brief
export of the manual builder stays beside it.

This folder holds the server (`server.js`), the one-operator host adapter (`host.js`), its settings
(`config.js`), the operator principal (`operator-principal.js`), the object store on disk (`disk-objects.js`) and
the web page mount (`ui.js`). The `Dockerfile` and `docker-compose.yml` are at the package root, and build from
the package folder alone.

## Run with Docker

From the package root, with your settings in `.env` (copy `.env.example`; `OPERATOR_TOKEN` is required):

```sh
cp .env.example .env
printf 'OPERATOR_TOKEN=%s\n' "$(openssl rand -hex 32)" >> .env
docker compose up -d --build
```

The page is at <http://localhost:8080> (`HOST_PORT` in `.env` changes the port). The API takes the same token:

```sh
curl -H "Authorization: Bearer $OPERATOR_TOKEN" http://localhost:8080/api/website-opportunities/capabilities
curl -H "Authorization: Bearer $OPERATOR_TOKEN" -H 'content-type: application/json' \
  -d '{"query": "Lisbon", "radiusM": 3000}' http://localhost:8080/api/website-opportunities/search
```

At start the server applies the package schema (`../schema/index.js`, `migrate(pool)`) to an empty database and
creates the operator principal (`wo_principal`, kind `operator`). If you applied the schema yourself, set
`SKIP_MIGRATIONS=1`.

## Run with Node

Node 22.19+ and a Postgres database (13 or later), from the package root after `npm install`:

```sh
DATABASE_URL=postgres://user:pass@localhost:5432/wo GOOGLE_PLACES_API_KEY=... \
  node src/standalone/server.js
```

Without `OPERATOR_TOKEN` the server listens on `127.0.0.1` only and answers only requests that come from this
machine and name it (`localhost`, `127.0.0.1` or `[::1]` in the `Host` header).

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | required | Postgres connection string |
| `PORT` | `8080` | Port to listen on |
| `OPERATOR_TOKEN` | none | At least 24 characters. Set: every request needs `Authorization: Bearer <token>` and the server listens on all interfaces. Unset: local-only mode |
| `BIND_ADDRESS` | `127.0.0.1`, or `0.0.0.0` with a token | Listen address; anything but loopback needs a token |
| `OPERATOR_EMAIL` | `operator@localhost` | The operator's address, as the API reports it. Every row belongs to the one operator principal, whatever this says |
| `OPERATOR_NAME` | empty | Signs outreach drafts; empty leaves them unsigned |
| `DATA_DIR` | `./data` (`/data` in the image) | Where photos and logos are stored |
| `UI_DIR` | `ui/public` of the package | A folder with an `index.html` to serve beside the API |
| `TRUST_PROXY` | `0` | `1`: the caller's address is the last `X-Forwarded-For` entry. Set it only behind a proxy you run |
| `PUBLIC_ORIGIN` | `http://localhost:<PORT>` | The address people use to reach the server |
| `SKIP_MIGRATIONS` | `0` | `1`: do not migrate at start |
| `HUB_SERVE` | `0` | `1`: also serve a shared research hub under `/hub/v1` (see the package README) |
| `HUB_URL`, `HUB_TOKEN` | none | Read a shared research hub before paying for a place; set both or neither |
| `HUB_CONTRIBUTE` | `0` | `1`: offer what your own research read from Google to that hub |
| `WO_SHARED_RESEARCH` | `1` | `0`: research runs per request instead of per place |
| `WO_SITE_READ_TLS` | `0` | `1`: a homepage that refuses the site check (403 or a bot challenge) is read once more with Chrome's TLS fingerprint through the optional `impit` package, dialled through a loopback proxy that refuses private addresses. Without `impit` installed it stays off |
| `GOOGLE_PLACES_API_KEY` (or `GOOGLE_API_KEY`) | none | Google Places search, details and photos |
| `OVERPASS_URL` | public instances | Your own Overpass (https, reachable on the internet) for OpenStreetMap search; the public ones rate-limit busy addresses |
| `APIFY_TOKEN` | none | Google Maps through Apify, and the social connectors |
| `SERPAPI_API_KEY`, `FIRECRAWL_API_KEY`, `JINA_API_KEY`, `LITESCRAPE_API_KEY` | none | Optional research providers |
| `RAPIDAPI_KEY`, `SCRAPECREATORS_API_KEY` | none | Social page statistics |
| `MONID_API_KEY` | none | Optional: up to 100 more Google reviews a place, once Monid is added to the Google reviews order in Settings |
| `DEEPSEEK_API_KEY` | none | Model used by research steps that need one |
| `TRACY_URL` | `https://cowork.tracy.ai` | The Tracy that "Build it with Tracy" connects to (OAuth device flow) and builds in |
| `TRACY_API_URL` | `TRACY_URL` | Where that Tracy's `/v1` API answers, when it is another address |

A key left unset turns its source off; `GET /api/website-opportunities/capabilities` shows what is on.

## What differs from a hosted install

- **One operator.** No sign-in, no accounts, no operator switches: the feature is always on.
- **Rate limits live in memory.** The server is one process. A restart starts every window again, the daily
  caps on paid calls included.
- **No vision model.** Menu photos are not read; everything else in research runs.
- **Files on disk.** Photos and logos are stored under `DATA_DIR`, at the same content-addressed keys a hosted
  install uses.
- **Provider keys are read-only.** The Operator page (`#/operator`: Settings, Spend, Queue, and Hub where the hub is
  served, Tracy) shows where each key comes from and tests it, but keys are set in the environment: this server seals none.
  Settings, spend caps and provider order are saved from the page. Its doors are `/api/website-opportunities/operator/*`.
- **The Tracy connection is a file.** Its tokens are kept in `DATA_DIR/tracy-connection.json`, mode 0600, in plain
  text (this server seals nothing): restricted permissions, not encryption. A host with `sealSecret` seals it.
- **A plain web page.** `ui/public/` is served as it is, with no build step; a `UI_DIR` with no `index.html` leaves
  `/` answering with the API's address.

## Tests

From the package root. The server test creates its own empty database on the server `TEST_DATABASE_URL` names
(the user needs `CREATEDB`) and drops it afterwards:

```sh
node --test test/standalone-host.test.mjs test/standalone-disk-objects.test.mjs test/standalone-ui.test.mjs
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/postgres node --test test/standalone-server.test.mjs
```
