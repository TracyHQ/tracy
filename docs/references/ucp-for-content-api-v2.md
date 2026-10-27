---
description: UCP (Universal Commerce Protocol, Google + Shopify, spec v2026-08-25) read from the official spec and repo, measured on a real store — discovery, catalog model, agent profile, MCP transport, write doors — then separating the catalog-generic part from the commerce-specific part to answer the hypothesis "content and product have the same shape" for content.json v2; does not decide on the PO's behalf.
sources:
  - apps/tracy-web/src/sites/route.js
  - packages/tools/tracy-site-tools/src/host/site.mjs
  - docs/adr/0016-two-layer-source-contract.md
  - docs/references/shopify-products-json-for-content-api-v2.md
---

# UCP — Universal Commerce Protocol — and the question "organise `content.json` v2 after UCP?"

Context: Lee (PO, 25/09/2026) put forward the hypothesis *"whether it's content or product, the
shape is basically the same, we should organise management after UCP"*. This document reads UCP from
the **official spec and repo** (tag `v2026-08-25`), adds measurements on a real Shopify store, then
compares it with Tracy's Content API v1 ([ADR 0021](../adr/0021-one-content-api-for-three-cms.md),
[Content API v1](content-api-v1.md), [integration decision](content-api-integration-decision.md)).
It continues [Shopify `products.json`](shopify-products-json-for-content-api-v2.md) §10–§13
(measuring `/.well-known/ucp` on Allbirds and the Storefront Catalog MCP) — that part is **not
repeated**, only gone into more deeply.

The PO's addition in this run: every lesson must be labelled **[generic]** (catalog-generic —
copyable) or **[commerce]** (commerce-specific — **DO NOT copy**), and must list outright the CMS
properties that UCP **has no model for** (**[CMS-only]**). The proposal at the end is **not**
"turn `content.json` into UCP".

## 0. How it was read and confidence level

- **Official spec + schema**: repo `Universal-Commerce-Protocol/ucp`, reading the source markdown in
  `docs/specification/` and the JSON Schema in `source/schemas/` **at tag `v2026-08-25`** (not
  through the rendered HTML). The pages `ucp.dev/2026-08-25/...` are a render of the same tree.
- **Measured directly** (25/09/2026, `curl`): `https://www.allbirds.com/.well-known/ucp` (headers +
  body 4,569 bytes), `https://shopify.dev/ucp/schemas/2026-08-25/shopify_catalog.json`,
  `https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json`,
  `https://ucp.goog/.well-known/ucp.json` (Google's platform profile), the GitHub API for tags/
  releases/the repo tree.
- **Vendor documentation** (primary source on *how they implement it*, not on the spec): shopify.dev
  `docs/agents/*`, shopify.engineering, developers.google.com/merchant/ucp,
  developers.openai.com/commerce, modelcontextprotocol.io, repo `google-agentic-commerce/AP2`.
- **Secondary** (only for positioning, marked in place): third-party articles/blogs about
  Visa/Mastercard/PayPal.
- Where no source was found it is marked **could not be confirmed** (§10). Every claim has a URL in
  §11.

## 1. (a) What UCP is, who owns it, version, license, status

| Question | Answer | Source |
|---|---|---|
| What it is | "An open standard enabling interoperability between various commerce entities" — Platform (agent/app) ↔ Business (merchant) ↔ PSP ↔ Credential Provider, through **Capabilities** (checkout, cart, catalog, order, identity linking) + **Extensions** (fulfillment, discount, buyer_consent, loyalty…) | repo README |
| Who created it | Shopify: "We co-developed UCP with Google" (Ilya Grigorik, 11/01/2026). GOVERNANCE: **Google and Shopify are the two "founding organizations"** of the Shopping TC (4 fixed seats each out of 16); standing Governing Council Google + Shopify, **Stripe joined on 28/04/2026**. The CLA is the **Google CLA** | shopify.engineering/ucp, GOVERNANCE.md, announcements |
| Who sits on the TC | Shopping TC (25/09/2026): Google ×5, Shopify ×4, Etsy, Meta, Amazon, Target, Microsoft, Stripe, Salesforce, Wayfair. There are also a Food TC, Lodging TC, Payments TC | MAINTAINERS.md |
| Version | **Date-based `YYYY-MM-DD`**. Releases: `v2026-01-11`, `v2026-01-23`, `v2026-04-08`, **`v2026-08-25`** (current, 25/08/2026). Repo created 31/12/2025 | GitHub tags/releases |
| License | **Apache-2.0** (spec, schema, SDK) | LICENSE |
| Status | The page calls itself "Official Specification"; a release is a stable snapshot (branch `release/YYYY-MM-DD` frozen, controlled backports); profiles **forbid** declaring a non-date version (`"draft"`). Breaking changes carry `!` and 2 weeks' notice | versioning.md, overview §Pre-release |
| Public RFC/repo | Yes: spec repo + `samples`, `conformance`, `python-sdk`, `js-sdk`, `ucp-schema` (validator), `meeting-minutes`. Significant changes must go through an **Enhancement Proposal** (Proposal → Provisional → Implemented, TC vote) | GitHub org, CONTRIBUTING.md |
| Who uses it | Shopify (every eligible store, `/.well-known/ucp` comes automatically — measured on Allbirds), Google (platform profile `ucp.goog`), Etsy/Target/Walmart/Wayfair according to the Shopify blog | shopify.engineering, measured |

A point to stay clear-headed about: UCP is the product of a **commerce alliance** (retailers + PSPs +
advertising/search platforms). Every design choice in it is optimised for the problem *a stranger
agent finds and buys goods from a stranger merchant*, not *a person with a seat edits the content of
their own site*.

## 2. (b) Discovery: `/.well-known/ucp`

### 2.1 Real example (Allbirds, shortened — measured 25/09/2026)

Notable headers: `link: </.well-known/ucp>; rel="ucp"; version="2026-08-25"`,
`cache-control: public, max-age=60`, `etag: W/"page_cache:…:Ucp::WellKnownController:…"`,
`access-control-allow-origin: *`, `content-type: application/json`. Body:

```json
{
  "ucp": {
    "version": "2026-08-25",
    "supported_versions": {
      "2026-04-08": "https://weareallbirds.myshopify.com/.well-known/ucp/2026-04-08",
      "2026-01-23": "https://weareallbirds.myshopify.com/.well-known/ucp/2026-01-23"
    },
    "services": {
      "dev.ucp.shopping": [
        { "version": "2026-08-25", "transport": "mcp",
          "endpoint": "https://weareallbirds.myshopify.com/api/ucp/mcp",
          "spec": "https://ucp.dev/2026-08-25/specification/overview/",
          "schema": "https://ucp.dev/2026-08-25/services/shopping/mcp.openrpc.json" },
        { "version": "2026-04-08", "transport": "embedded",
          "schema": "https://ucp.dev/2026-04-08/services/shopping/embedded.openrpc.json" }
      ]
    },
    "capabilities": {
      "dev.ucp.shopping.checkout":       [{ "version": "2026-08-25", "spec": "…", "schema": "https://ucp.dev/2026-08-25/schemas/shopping/checkout.json" }],
      "dev.ucp.shopping.cart":           [{ "version": "2026-08-25", "schema": "…/cart.json" }],
      "dev.ucp.shopping.order":          [{ "version": "2026-08-25", "schema": "…/order.json" }],
      "dev.ucp.shopping.catalog.search": [{ "version": "2026-08-25", "schema": "…/catalog_search.json" }],
      "dev.ucp.shopping.catalog.lookup": [{ "version": "2026-08-25", "schema": "…/catalog_lookup.json" }],
      "dev.ucp.shopping.fulfillment":    [{ "version": "2026-08-25", "extends": ["dev.ucp.shopping.checkout", "dev.ucp.shopping.cart"],
                                            "requires": { "protocol": { "min": "2026-08-25" } },
                                            "config": { "multi_destination": [], "method_combinations": [["shipping"]] } }],
      "dev.ucp.shopping.discount":       [{ "version": "2026-08-25", "extends": ["…checkout", "…cart"] }],
      "dev.shopify.catalog":             [{ "version": "2026-08-25",
                                            "spec": "https://shopify.dev/docs/agents/catalog/storefront-catalog",
                                            "schema": "https://shopify.dev/ucp/schemas/2026-08-25/shopify_catalog.json",
                                            "extends": ["dev.ucp.shopping.catalog.search", "dev.ucp.shopping.catalog.lookup"] }],
      "dev.ucp.common.identity_linking": [{ "version": "2026-08-25",
                                            "config": { "providers": { "app.shop.accounts": [{ "type": "oauth2", "auth_url": "https://accounts.shop.app" }] }, "scopes": {} } }]
    },
    "payment_handlers": {
      "com.google.pay":   [{ "id": "gpay", "version": "2026-01-11", "config": { "merchant_info": { "merchant_name": "Allbirds", "merchant_id": "…" }, "allowed_payment_methods": [ … ] } }],
      "dev.shopify.card": [{ "id": "shopify.card", "version": "2026-01-15", "config": { "payment_methods": [ … ] } }]
    }
  }
}
```

(Allbirds does **not** publish `keys[]` — the store does not sign responses; valid because `keys`
is optional.)

### 2.2 Profile rules (spec overview §Profile Structure, `source/schemas/profile.json`, `ucp.json`)

- The root has **exactly one required member `ucp`**; inside it `version`, `services`,
  `payment_handlers` are **required even when empty**; `capabilities` is optional. A top-level
  optional `keys[]` = **JWK Set RFC 7517** (public keys to verify HTTP Message Signatures /
  webhooks).
- Each entity (service/capability/handler) is an **array** of `{version, spec?, schema, extends?,
  requires?, config?, id?}`. `schema` is **required** for a capability; `spec` is just docs.
- **Authority binding**: the host of the `schema` URL, reversed, must be a label-wise prefix of the
  name (`dev.ucp.shopping.checkout` ⇐ `ucp.dev`; `dev.shopify.catalog` ⇐ `shopify.dev`). The
  platform **MUST** check before fetching; if wrong, treat the entity as non-existent. This is
  "governance without a registry": *own the domain, own the namespace*.
- `supported_versions`: a map of old version → **leaf** profile URL (no nested
  `supported_versions` allowed). The platform picks the highest version both sides have, fetches the
  right leaf, and **must check that the leaf's `ucp.version` = the key**.
- **Hosting**: HTTPS, **no 3xx redirects**, `Cache-Control: public, max-age ≥ 60`, `private`/
  `no-store`/`no-cache` **forbidden**, should have `ETag`/`Last-Modified`. A profile is a "stable
  identity" and holds no per-session configuration. Verifiers should block bodies > 128 KiB (real
  profiles are < 5 KiB).
- The platform profile (agent) has the same shape, is published at any URL, and is sent with each
  request through the header `UCP-Agent: profile="https://…"` (REST) or
  `params.arguments.meta["ucp-agent"].profile` (MCP).

### 2.3 From a domain to catalog/checkout

1. `GET https://<domain>/.well-known/ucp` (Shopify also publishes `Link: rel="ucp"` on this page
   itself; **could not be confirmed** whether Shopify publishes that header on ordinary HTML pages).
2. Pick the protocol version; read `services["dev.ucp.shopping"][]` → pick a `transport` (`rest` |
   `mcp` | `a2a` | `embedded`), take the `endpoint` (REST: base URL to join OpenAPI paths to; MCP:
   JSON-RPC URL; A2A: Agent Card).
3. Read `capabilities`; compute the **intersection** with the agent's own profile (names match →
   highest common version → prune orphan extensions, repeat until stable); fetch + compose JSON
   Schema (`allOf`) for validation.
4. Call tools; every response carries back `ucp.version` + the `ucp.capabilities` **active** for
   that call.

### 2.4 Published JSON Schema

Yes, complete, in `source/schemas/` (≈130 files): `profile.json`, `ucp.json`, `capability.json`,
`service.json`, `shopping/types/product.json`, `variant.json`, `common/types/pagination.json`,
`message_error.json`, `transports/mcp_tool_call.json`… and OpenRPC/OpenAPI for each service
(`services/shopping/mcp.openrpc.json`, `rest.openapi.json`). There is a dedicated validator
(`Universal-Commerce-Protocol/ucp-schema`) and a conformance suite.

## 3. (c) Catalog model

### 3.1 Schema (reading `product.json`, `variant.json`, `media.json`, `description.json`)

| Entity | Required | Optional |
|---|---|---|
| **Product** | `id` ("Global ID (GID)"), `title`, `description` (`{plain?, html?, markdown?}` — at least one), `price_range`, `variants[]` (≥1, first element = featured) | `handle` ("URL-safe slug… Use `id` for stable API references"), `url`, `categories[]`, `list_price_range`, `media[]` (first = featured), `options[]`, `rating`, `tags[]`, `metadata` (free-form object) |
| **Variant** | `id` (GID, "Used as `item.id` in checkout"), `title`, `description`, `price` (`{amount` minor units`, currency}`) | `sku`, `barcodes[]{type,value}`, `handle`, `url`, `categories`, `quantity_unit`, `list_price`, `unit_price`, `availability{available, status}`, `options[]`, `media[]`, `rating`, `tags`, `metadata`, `seller{name, links}` |
| **Media** | `type` (`image`/`video`/`model_3d`), `url` | `alt_text`, `width`, `height` |

- **ID**: an opaque string, the spec only says "Global ID (GID)" — **no format specified, no
  durability commitment**. Shopify uses `gid://shopify/Product/123` /
  `gid://shopify/ProductVariant/456` (Storefront Catalog docs). There is no `updated_at`,
  `created_at`, `etag`, `revision` **at any level** of product/variant — the UCP catalog has no
  notion of incremental sync.
- **Slug**: `handle` is a secondary attribute; `lookup_catalog` **MAY** accept handle/SKU/URL as a
  secondary identifier, and the result carries `inputs[]{id, match: exact|featured}` so the client
  knows which id produced which variant.
- **Locale/market**: **there is no locale field on the entity**. It is *request context*:
  `context.language` (BCP 47), `context.currency` (ISO 4217), `address_country/region`,
  `postal_code`, `location`, `intent`, `eligibility[]`, `payment[]` — "provisional buyer signals…
  not authoritative". The business decides the market and **may return another language** if it
  doesn't have it.
- **Pagination** (`pagination.json`): request `{cursor?, limit?}` — `limit` is the "requested page
  size, not a guaranteed result count", the default should be 10, the business **MAY** return
  fewer; response `{has_next_page` (required)`, cursor` (required when there are more pages)`,
  total_count?}`. The cursor is opaque, "MAY encode them as stateless keyset tokens". Only
  **search** paginates; lookup is batch.
- **Search** (`catalog_search.json`): `{query?, filters?{categories[] OR, price{min,max}}, context?,
  signals?, attribution?, pagination?}` — must have at least `query` or `filters` (no `query` =
  browse). Unknown filters: `additionalProperties`. Shopify adds `filters.available` (default
  `true`).
- **Lookup**: `{ids[]}` — must accept ≥10 ids per call, over the ceiling → `-32602`; dedupe; an id
  not found → return fewer + `messages[]{type:"info", code:"not_found"}`. **`get_product`** `{id,
  selected?[], preferences?[]}` — interactive option selection, the response has the effective
  `product.selected` and `options[].values[]{available, exists}`.
- **Size limits**: the spec sets **no** byte ceiling on responses; Shopify: `limit` 1–250
  (Storefront Catalog), `ids` ≤10.
- **Cache**: "Catalog responses… are not transactional commitments — checkout is authoritative.
  Responses can be session-specific and SHOULD NOT be reused across sessions without
  re-validation." No ETag/304 for tool results; caching is only discussed for the **profile**
  (§2.2).

### 3.2 Labels for each feature

- **[generic]**: discovery document; opaque `id` + secondary `handle`; the `search`/`lookup`/
  `get_*` tool set; multi-format `description`; `media` with `alt_text/width/height`; `messages[]`
  with `code` + `path` (JSONPath RFC 9535); opaque cursor + `has_next_page`; namespaced free-form
  `metadata`.
- **[commerce]**: `price`/`price_range`/`list_price`/`unit_price`; `variants[]`/`options[]`/
  `selected`; `availability`; `quantity_unit` (Rec20, `scale`, `increment`); `rating`;
  `categories` taxonomy; `context` = buyer signals (country, currency, eligibility, payment);
  `policies[]` (return/refund); `actions` (age verification…).
- **[CMS-only — UCP does not have it]**: `updated_at`/`revision` per record; locale **on** the
  entity and translation group; block/position in the page; slot/edit target;
  draft/scheduled/password; ACL by caller.

## 4. (d) Authentication and permissions

### 4.1 What the "agent profile URL" is

It is the **platform profile** (§2.2): a JSON `{ucp:{version, services, capabilities?,
payment_handlers}, keys?[]}` that the agent hosts itself at a stable HTTPS URL and sends with
**every** request. It does two jobs with one document: (1) **negotiation** — the business computes
the capability intersection; (2) **identity** — `keys[]` is where the verifier gets the public key
to verify **HTTP Message Signatures RFC 9421**.

Relation to Web Bot Auth (WBA, Cloudflare/IETF `draft-meunier-webbotauth-*`): UCP uses **the same
RFC 9421**, but key discovery defaults to the **`UCP-Agent`** header (reading the profile's
`keys[]`), not `Signature-Agent`. WBA is an **optional add-on layer**: a signer can publish a
"dual-audience" signature (`tag="web-bot-auth"`, `Signature-Agent:
sig1="…/.well-known/ucp";type=jwks_uri`, `keyid` = JWK thumbprint RFC 7638, `created`/`expires`,
should have `nonce`) that **both** UCP verifiers and WBA verifiers accept. Interop is **one-way**: a
minimal WBA signature (only `@authority`) **is rejected by UCP** because UCP demands coverage of
`@method @authority @path (@query) content-digest content-type ucp-agent signature-agent
idempotency-key`.

The ES256 (P-256) algorithm is the **required** verify baseline; Ed25519 is optional (common on the
WBA side). Replay protection is **not** at the signature layer but in `Idempotency-Key` (business
layer, §6).

### 4.2 How a merchant allows / refuses an agent

- Spec: "permissionless onboarding — any platform with a discoverable profile can interact with
  any business **without prior registration**", **but** "businesses retain full control over
  their access policies and MAY enforce additional rules". It recommends keeping a **registry of
  pre-approved platforms**; unknown agents go through "dynamic discovery" with a fixed budget (LRU
  cache, fetch rate limit, backoff, 503 + `Retry-After` to resolve in the background). Error codes
  available: `profile_not_trusted` (403), `invalid_profile_url` (400), `profile_unreachable` (424),
  `profile_malformed`/`version_unsupported` (422), `capabilities_incompatible` (200 +
  `ucp.status:"error"`).
- Four recognised auth mechanisms: API key, OAuth 2.0, mTLS, HTTP Message Signatures. For the first
  three, the verifier **MUST** check that the authenticated principal is allowed to act on behalf of
  the profile in `UCP-Agent` — "A's key, B's profile" must not be allowed.
- **Signatures for the catalog are OPTIONAL** ("Catalog queries (read-only)"); required only for
  webhooks; RECOMMENDED for payment/complete.
- Shopify implements it as **three "traffic tiers"** (`docs/agents/profiles/auth-and-rate-limiting`):

| Tier | How it authenticates | Catalog | Cart/Checkout build | `complete_checkout` | Order |
|---|---|---|---|---|---|
| **Anonymous** | no header at all — only the profile URL | yes (lowest rate limit) | yes | no | no |
| **Signed** | RFC 9421, ES256, key in the profile's `keys[]` | yes | yes | no | no |
| **Token** | JWT Bearer from the Dev Dashboard (`client_id/secret` → `api.shopify.com/auth/access_token`, expires in 60 minutes, payload has `scopes`, `limits`) | yes (+ personalisation if buyer-linked) | yes | when the token is granted permission | scope `read_global_api_orders`, only orders placed by this agent |

  "Rate limits scale with identification." Catalog: "Keyless catalog access doesn't support rate
  limit increases." **Could not be confirmed** whether Shopify merchants have a per-agent allow/deny
  table; there is only turning the Agentic channel on/off (help center, see the `products.json`
  document §10).

### 4.3 Is there a "scope"

Yes, in **identity linking**: `capabilities["dev.ucp.common.identity_linking"][].config.scopes`
declares the scopes that **gate** operations needing the user's identity (for example
`dev.ucp.shopping.order:read`, `:manage`); OAuth `scopes_supported` (RFC 8414) is the accepted
vocabulary; in effect an optional layer. Reading the catalog has **no** scope — it is
public-by-default by design (the purpose is selling to strangers).

Labels: **[generic]** profile = one document that both declares capabilities and publishes keys;
RFC 9421 + JWK Set; separating *identity* (who calls) from *permission* (what they may do) from
*replay* (idempotency); tiers by level of identification. **[commerce]**: anonymous read is the
default; scopes revolve around order/buyer.

## 5. (e) Transport

- **Four transports**, negotiated through `services`: REST (OpenAPI 3.x, **core**), MCP (OpenRPC),
  A2A (Agent Card), Embedded (OpenRPC, started with `continue_url`). A transport definition must be
  **"thin"**: only declare method names and reference the base schema, never define payloads
  inline.
- **MCP binding**: `tools/call`, `params.name` = tool name (`search_catalog`, `lookup_catalog`,
  `get_product`, `create_cart`, `get_cart`, `update_cart`, `create_checkout`, `update_checkout`,
  `complete_checkout`, `get_checkout`, `cancel_checkout`, `get_order`), `params.arguments` =
  `{meta:{"ucp-agent":{profile}, "idempotency-key"?}, <domain>:{…}}` — the payload is wrapped in a
  key per domain (`catalog`, `cart`, `checkout`). Response: **`result.structuredContent` is
  required** and holds the UCP envelope; `content[]` (JSON text) is only for compatibility; the
  server **SHOULD** declare an `outputSchema` pointing at the UCP JSON Schema. Streamable HTTP, no
  SSE.
- **Two-layer errors** — this is where it differs from plain MCP: (1) *transport* → JSON-RPC
  `error` (`-32000` auth/403/409/429/503, `-32001` discovery/version, `-32602` invalid params
  including batches over the ceiling, `-32603` server), the HTTP status is the **main signal**,
  `error.data{code, content, continue_url, retry_after}`; (2) *business outcome* → a successful
  JSON-RPC **result**, `ucp.status:"error"` + `messages[]{type: error|warning|info, code, path
  (JSONPath), content, content_type, severity}`. `severity` ∈ `recoverable | requires_buyer_input |
  requires_buyer_review | unrecoverable`. The UCP spec **does not use MCP's `isError`** (it appears
  neither in `mcp_tool_call.json` nor in the catalog binding); `get_product`'s "Product not found"
  is a successful result with `ucp.status:"error"`, while a lookup with a missing id is a
  **successful** result with a shorter `products` + a `not_found` info.
- **Pagination in tool results**: `structuredContent.pagination{cursor, has_next_page,
  total_count}` (measured on Shopify: all three present).
- **Output limits for LLMs**: the spec sets no bytes; the mechanism is *fewer records* (`limit`
  default 10; lookup returns **one** featured variant per product; `get_product` returns a
  **subset** of variants by `selected`), `description` with a chosen format, featured-first for
  `media`/`variants`. There is no "field mask"/projection.

Labels: **[generic]** two-layer errors, `messages[].path`, `structuredContent` + `outputSchema`,
tools named by verb + domain, payload wrapped by domain key, "thin transport". **[commerce]**: the
cart/checkout/order tool set, `severity` revolving around the buyer.

## 6. (f) Write doors: cart, checkout, order — and none for the catalog

- **Cart** (`dev.ucp.shopping.cart`): create/get/update (full replacement)/cancel; "no status
  lifecycle"; converting to checkout is **idempotent** (same cart → returns the existing checkout).
- **Checkout**: state machine `incomplete ⇄ requires_escalation → ready_for_complete →
  complete_in_progress → completed | canceled`. **Step that needs a person**: `requires_escalation`
  — the business **MUST** return a `continue_url` (absolute HTTPS) to hand the buyer over to the
  merchant's UI; `messages` with `requires_buyer_input` / `requires_buyer_review` push into this
  state; the platform **MUST NOT** hide `presentation: "disclosure"` warnings. Extension
  `buyer_consent`, AP2 mandate for autonomous.
- **Idempotency** (signatures.md §Replay Protection): every state-changing operation carries an
  `Idempotency-Key` (≥128 bits; stored ≥24 h; same key + same body SHA-256 → return cached; same
  key + different body → 409/`-32000`; storage error → fail closed 503). The key **is inside the
  signed part**. Complete Checkout loses its response: `get_checkout` with backoff first, and only
  if still blind retry with the **same** key.
- **Order**: webhook (business → platform, **MUST** be signed) + on-demand `get_order`.
- **Catalog: no write door.** All of `catalog_search.json`/`catalog_lookup.json` has only
  `search_request`, `lookup_request`, `get_product_request`; conformance lists only Search/Lookup;
  Shopify's tool list is three read tools. Editing the catalog on Shopify goes through the Admin
  API/Sidekick path — see [Shopify Admin API product editing](shopify-admin-api-product-edits-for-content-api-v2.md)
  and [Shopify agent tooling](shopify-agent-tooling-for-content-api-v2.md). **Confirmed: UCP has no
  door for an agent to edit the catalog.**

Labels: **[commerce — DO NOT copy]** all of cart/checkout/order/payment handler/AP2. **[generic]**
only two ideas: (1) *an idempotency key that is signed and compared against the body SHA-256*;
(2) *the "needs a person" state is a value in the state machine with a handover URL*, not an
error.

## 7. (g) Positioning against other protocols (short, only to place UCP correctly)

| Protocol | Whose · license | Role | Where it differs from UCP |
|---|---|---|---|
| **ACP — Agentic Commerce Protocol** | OpenAI + Stripe, Apache-2.0, repo 29/09/2025 | ChatGPT Instant Checkout: the merchant implements 5 REST endpoints `POST/GET /checkout_sessions…`; headers `Authorization` (API key), `Idempotency-Key`, `Request-Id`, `Signature` (HMAC of body), `API-Version` (`2025-09-12`), `Timestamp` | **Discovery through a product feed** (TSV/CSV/JSONL, upload/SFTP/URL) — ChatGPT does **not** query a live catalog; ids are "stable… never reuse", variants through `item_group_id`. No discovery document, no capability negotiation |
| **AP2 — Agent Payments Protocol** | Google, Apache-2.0, v0.2 | The **payment trust** layer: Checkout Mandate + Payment Mandate (Verifiable Credentials, SD-JWT), 5 roles; "compatible with UCP", enters UCP as the extension `dev.ucp.common.payment.ap2_mandate` | No catalog, no discovery — "catalog APIs… are outside the scope of AP2" |
| Visa Intelligent Commerce / Trusted Agent Protocol, Mastercard Agent Pay, PayPal + Perplexity Instant Buy (*secondary*) | card networks / PSP | tokenization + agent identity at the payment layer; PayPal-Perplexity is a closed integration | Defines no catalog |
| **Schema.org Product/Offer** | W3C community | markup vocabulary for crawlers | A *vocabulary*, not a *protocol*: no endpoint, no auth, no pagination. UCP defines its own `product`/`variant`, does not use schema.org |
| **MCP** (read version 2025-06-18; 2025-11-25 and 2026-07-28 exist, not compared) | Anthropic, open | Tools = **model-controlled** (`name, inputSchema, outputSchema, annotations readOnlyHint…`, `tools/call` → `content[] + structuredContent + isError`); Resources = **application-driven** (`uri, mimeType`, `resources/list|read|subscribe`, `notifications/resources/updated`) | UCP uses only **tools**, not resources; drops `isError` in favour of its own envelope. For Tracy: a page/content block with a stable URI and an "updated" notification is **the shape of a Resource** more than of a Tool |

## 8. (h) What is generic, what is commerce — and the PO's hypothesis

### 8.1 Separating the layers

| UCP layer | Content | Label |
|---|---|---|
| Discovery document | `/.well-known/…`, `version`, `services{transport, endpoint, schema}`, `capabilities{…}` by reverse-domain, `supported_versions`, hosting rules, authority binding | **[generic]** |
| Entity + lookup | durable opaque `id` + secondary `handle`; batch `lookup` with `inputs[].match`; singular `get_*` | **[generic]** |
| Search | `query` or `filters` (AND), cursor `has_next_page`, `limit` only a hint | **[generic]** |
| Versioning | date-based, exact-match capability version, extension `extends`/`requires`, `allOf` compose, response echoes the active capabilities | **[generic]** |
| Errors | two layers; `messages[]{code, path, severity}`; `continue_url` | **[generic]** (severity renamed) |
| Agent identity | profile = capabilities + `keys[]`; RFC 9421; tiers by level of identification; signed idempotency | **[generic]** |
| Price/variant/inventory/unit | `price_range`, `variants`, `options`, `availability`, `quantity_unit`, `unit_price`, `rating` | **[commerce — DO NOT copy]** |
| Cart/checkout/order/payment/AP2/identity linking | all of §6 | **[commerce — DO NOT copy]** |
| Public-by-default, buyer context | anonymous tier, `context` as buyer signals, `eligibility`, `policies` | **[commerce — DO NOT copy]** |

### 8.2 CMS properties that UCP **has no model for** [CMS-only]

1. **Blocks with a position in the page.** A UCP product is a flat entity + `variants[]`; there is
   no notion of the "occurrence" of a block at `position` N in a page, let alone "a footer shared
   across ten pages with only one source" (`sharedContentId`, ADR 0021 §3.3).
2. **`slotKey` pointing to the place to edit.** The UCP catalog is *read-only by design*; no field
   says "where this value can be edited, through which door, with what limits". Tracy v1 has
   `fields[]{slotKey, semanticKey}` and the write door `content.write`/apply sharing IDs.
3. **Presentation-lock / contract.** Tracy locks the layout by the released profile
   ([ADR 0016](../adr/0016-two-layer-source-contract.md)); UCP has no layer for "what can be changed,
   what is sealed" — because merchants edit their own store through Admin, and stranger agents do
   not edit.
4. **Translations sharing a `translationGroupId`.** UCP: locale is *request context*, the business
   "MAY return content in a different language"; there is no entity-per-locale, no `translation`
   relation. Tracy content: each translation has its own ID, grouped by a confirmed group, `locale`
   is an entity attribute.
5. **Draft / scheduled / password / ACL.** UCP only has `availability` (in stock or not) — there is
   no `publication{status, valueSource, scheduledAt}`, no "this person may read drafts".
6. **The editor is a seat, not a stranger.** UCP's whole trust model (anonymous tier,
   permissionless profiles, `context` as buyer signals) assumes *the caller is a passing customer of
   the merchant*. Tracy's Content API serves **the agent of the site's own owner**, with a seat and
   a policy (`contentPrincipal`/`contentScope` computed by the relay,
   [integration decision](content-api-integration-decision.md)).
7. **`updated_at` / `revision` / snapshot.** The UCP catalog has none; Tracy v1 has `revision` per
   content, `snapshot.revision`, a cursor tied to the snapshot, 409 when the source changes.

### 8.3 A straight assessment of the hypothesis "content and product have the same shape"

**True at the shell layer, false at the core.**

- *Alike* (both are a "catalog of entities"): an entity has a durable `id` + slug + title +
  description + media + tags + metadata; there are relations (category ↔ parent/child/related);
  list/search/lookup/get are needed; discovery + version + auth + coded errors are needed. At this
  layer, UCP gives a **mould already reviewed by many parties**, and Tracy v1 already went in the
  same direction without knowing it (envelope `schemaVersion`, opaque id, cursor, `links.self`,
  error `code`).
- *Different* (the core): a UCP product is **one entity + variants to buy**; Tracy content is **a
  page = a graph of occurrences** pointing to shared content, each field has an *edit target* and
  *edit limits*, there are multiple versions per locale, there is a publication state, and **the
  caller has a seat**. The seven items of §8.2 are seven places where UCP is empty. Modelling
  content as product/variant would mean stuffing blocks into `variants` or `metadata` — exactly the
  "invented data" trap that the repo's RULES #3 forbids.
- Conclusion for the PO: **organising "the way in" after UCP** (discovery, search/get tools,
  capabilities per adapter, version, agent identity) is sensible and cheap; **organising "the data
  shape" after UCP** is not — keep the `tracy-content` envelope with
  blocks/fields/slot/locale/publication.

## 9. Organising `content.json` v2 after UCP — proposal (does not decide on the PO's behalf)

Each bullet: **what UCP does → what Tracy v1 does → v2 option + trade-off**, labelled.

1. **[generic] Discovery document.** UCP: `/.well-known/ucp` declares `version`,
   `services{transport, endpoint, schema}`, `capabilities`, `supported_versions`; public hosting,
   cache ≥60 s, no redirects. → v1: `schemaVersion`/`provenance`/`completeness` sit **inside** each
   response, there is no standalone document. → v2: a **`GET /content.json?describe=1`** (or
   `/.well-known/tracy-content`) returning `{tracy:{version, adapter:{cms, version},
   capabilities:{…}, site:{locales, defaultLocale}, types:[…], schema:"<URL>"}}`. **Trade-off**:
   `/.well-known/` is public by convention and Joomla/WP may claim the route; `?describe=1` lives
   behind auth on the same endpoint but agents outside Tracy cannot "find it themselves". Since the
   caller is a seat (§8.2-6), `?describe=1` behind auth is enough; add `Link: rel="tracy-content"`
   if machine discovery is wanted.
2. **[generic] Capabilities per adapter, exact-version.** UCP: capability = reverse-domain name +
   date `version`, extensions `extends`/`requires`, responses echo the active capabilities. → v1:
   the adapter declares `unresolved`/501 *after* the call; whether `blocksCursor`/`itemsCursor`/slug
   lookup exist depends on the CMS, the agent has to try. → v2: `capabilities` in describe:
   `ai.tracy.content.list`, `…content.get`, `…content.lookup` (slug), `…content.blocks_cursor`,
   `…content.items_cursor`, `…content.public_view`, each `{version}`; the Joomla/WP/EmDash adapters
   declare **different** ones; every response echoes the active `tracy.capabilities`.
   **Trade-off**: one more surface to keep correct — it should be **generated from the adapter
   code** (like the `image-profile` gate), not by hand.
3. **[generic] Separate `search_content` / `get_content` / `lookup_content` instead of one
   multi-parameter endpoint.** UCP: three tools, one schema each, batch lookup has `inputs[].match`.
   → v1: one `GET /content.json` with `type/locale/limit/cursor/id/blockId/blocksCursor/
   itemsCursor`, 400 on wrong combinations. → v2: three explicit operations — `list` (filter +
   cursor), `get` (id + continuation), `lookup` (array of `ids|slugs` + `locale`, returning
   `inputs[].match`) — possibly still **one URL** but with `op=` separating the schemas, or three
   MCP tools in `tracy_site`. **Trade-off**: more schemas to maintain, but fewer 400s and fewer
   probing turns; matches how an LLM picks tools by name.
4. **[generic] Two-layer errors + `messages[].path`.** UCP: transport → JSON-RPC error; outcome →
   result + `messages[]{code, path, severity}`. → v1: HTTP status + `error{code, message,
   field{contentId, blockId, itemId, key}}`; `completeness.unresolved[]`. → v2: keep the
   `CONTENT_*` codes, add a **JSONPath `path`** to `unresolved[]`/413 so the agent knows *which
   part* of the envelope is affected; add info/warning `messages[]` for "filter not supported on
   this adapter yet" (lesson from `products.json` §12-12). **Trade-off**: UCP's `severity` is
   buyer-centric — Tracy should keep only `recoverable | requires_seat | unrecoverable`, not copy
   the four values.
5. **[generic] Agent identity = profile + signature, instead of a per-site PAT?** UCP: the agent
   hosts its own profile with `keys[]`, signs RFC 9421, the merchant verifies without registration;
   tiers Anonymous/Signed/Token. → v1: Tracy's relay holds a per-site service credential, computes
   `contentPrincipal`/`contentScope` from the seat, the Claude Cowork plugin does **not** accept
   authority from the agent. → v2: **keep the relay** (the caller is a seat, not permissionless);
   but the **relay could sign** requests to the Claude Cowork plugin with RFC 9421 using a key in a
   Tracy profile (`https://cowork.tracy.ai/.well-known/tracy-agent`) instead of a Bearer service
   token in the body — the Claude Cowork plugin verifies offline, no per-site shared secret, rotate
   through `keys[]`. **Trade-off**: the PHP Claude Cowork plugin must have an RFC 9421 verifier
   (one more lib), and Tracy still has to prove that "the relay's key + the principal in the body"
   are consistent (exactly UCP's *Identity Binding* rule).
6. **[generic] A signed idempotency key, compared against the body SHA-256 — for the existing write
   door.** UCP: `Idempotency-Key` among the signed components, same key different body → 409. → v1
   write: apply with `expected_revision`, no idempotency key. → v2 (only when touching the write
   path): add `Idempotency-Key` for `content.write`, stored 24 h. **Trade-off**: ADR 0021 §6 forbids
   building a new undo/journal — idempotency is **not** a journal, but this must be made clear to
   the PO before adding it.
7. **[commerce — DO NOT copy] Public/anonymous read by default.** UCP: the catalog is read without
   identity because the goal is selling to strangers. → v1: private, `no-store`, 401. → v2: **keep
   it private**; `public_view` is only an optional capability for sites without a password,
   published only (already discussed in `products.json` §12-2), not the default.
8. **[commerce — DO NOT copy] `context` is a buyer signal; locale is a hint.** → v2: `locale` is a
   **hard filter** on the entity + `translationGroupId`/`translation` relation (§8.2-4); do not copy
   `context.language` "MAY return a different language".
9. **[commerce — DO NOT copy] price/variant/availability/cart/checkout/payment/AP2/identity
   linking.** No equivalent in content; do not add.
10. **[CMS-only — add, UCP does not have it] `updated_at`/`revision` per record + ETag after
    auth.** UCP has none, the ACP feed also only has a "stable id". → v1: `revision`,
    `snapshot.revision`, signed cursor. → v2: `updatedAt`+`revision` required in the summary,
    `If-None-Match` after auth, `updatedSince=` (`products.json` §12-5). **Trade-off**: `updated_at`
    "jumps" because of plugins — needs a content-based `revision` proven by the adapter.
11. **[CMS-only — keep, do not force into product] blocks/fields/slotKey/sharedContentId/
    publication.** UCP has none of §8.2-1/2/3/5. → v2: keep the v1 envelope as is; if a "flat
    projection" is wanted it is derived and not writable (`products.json` §12-7). Do not model
    blocks as `variants`.
12. **[generic, from MCP rather than UCP] Consider Resources for pages/blocks.** MCP Resources have a
    stable `uri`, `lastModified`, `subscribe`/`updated`. → v1: everything is a tool. → v2: each
    content has a `uri` (`tracy://site/<siteId>/content/<id>`) and a `resources/list` + `updated`
    notification when the revision changes — true to the nature of "content that has an address and
    changes", while `search` stays a tool. **Trade-off**: dsh/the host must support resources; not
    measured yet.

In short: copy **the way in** (1–6), do **not** copy **the commerce core** (7–9), **add** the CMS
part that UCP lacks (10–12). The decision belongs to the PO.

## 10. Could not be confirmed

- An official commitment on the **durability** of `id` (GID) in the UCP spec — the spec only says
  "stable API references" in the `handle` description; there is no rule like Tracy v1's "deleted
  and recreated must be a new id".
- Shopify's **concrete rate-limit numbers** per tier; there is only "scale with identification".
- Whether Shopify merchants have **per-agent allow/deny**; there is only turning the Agentic
  channel on/off.
- Whether Shopify **actually fetches and verifies** the platform profile for the Anonymous tier on
  the catalog or only reads capabilities — the docs say "fetches and validates", not measured with
  a broken profile.
- Whether Shopify publishes `Link: rel="ucp"` on **ordinary HTML pages** (only measured on
  `/.well-known/ucp` itself).
- Google's platform profile `ucp.goog` still declares `signing_keys` (old name) at version
  `2026-04-08`; spec `2026-08-25` uses `keys[]` — unconfirmed whether Shopify's verifier accepts
  both.
- Differences between MCP spec 2025-06-18 (read) and 2025-11-25 / 2026-07-28 regarding
  `structuredContent`, `isError`, resources — not compared.
- Adoption figures beyond Shopify/Google (Etsy, Target, Walmart, Wayfair) — only a sentence in the
  Shopify blog, their endpoints not measured.

## 11. Sources

### Official (spec, schema, repo, vendor documentation)

- UCP spec (tag `v2026-08-25`, source markdown): `https://github.com/Universal-Commerce-Protocol/ucp/tree/v2026-08-25/docs/specification` — overview (`overview/index.md`), `signatures.md`, `shopping/catalog/{index,search,lookup,mcp,rest}.md`, `shopping/checkout/index.md`, `shopping/cart/index.md`, `shopping/order/index.md`, `common/identity-linking/index.md`; `docs/versioning.md`, `docs/documentation/{core-concepts,ucp-and-ap2,roadmap,announcements}.md`. Render: `https://ucp.dev/2026-08-25/specification/overview/`, `https://ucp.dev/2026-08-25/specification/shopping/catalog/`.
- UCP JSON Schema: `https://github.com/Universal-Commerce-Protocol/ucp/tree/v2026-08-25/source/schemas` — `profile.json`, `ucp.json`, `capability.json`, `service.json`, `shopping/types/product.json`, `shopping/types/variant.json`, `shopping/catalog_search.json`, `shopping/catalog_lookup.json`, `common/types/{pagination,context,media,description,message_error,error_code,error_response,reverse_domain_name}.json`, `transports/mcp_tool_call.json`; OpenRPC `https://ucp.dev/2026-08-25/services/shopping/mcp.openrpc.json`.
- UCP repo meta: `https://github.com/Universal-Commerce-Protocol/ucp` (README, LICENSE Apache-2.0, releases/tags), `https://github.com/Universal-Commerce-Protocol/.github/blob/main/GOVERNANCE.md`, `.../MAINTAINERS.md`, `.../CONTRIBUTING.md`; org: `https://github.com/orgs/Universal-Commerce-Protocol/repositories`.
- Shopify: `https://shopify.engineering/ucp` (11/01/2026), `https://shopify.dev/docs/agents`, `https://shopify.dev/docs/agents/profiles`, `https://shopify.dev/docs/agents/profiles/auth-and-rate-limiting`, `https://shopify.dev/docs/agents/get-started/profile`, `https://shopify.dev/docs/agents/get-started/authentication`, `https://shopify.dev/docs/agents/get-started/search-catalog`, `https://shopify.dev/docs/agents/catalog`, `https://shopify.dev/docs/agents/catalog/storefront-catalog`, `https://shopify.dev/ucp/schemas/2026-08-25/shopify_catalog.json`, `https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json`.
- Google: `https://developers.google.com/merchant/ucp/guides/ucp-profile`, `https://ucp.goog/.well-known/ucp.json`.
- OpenAI ACP: `https://developers.openai.com/commerce/specs/checkout`, `https://developers.openai.com/commerce/product-feeds/spec`, repo `https://github.com/agentic-commerce-protocol/agentic-commerce-protocol`.
- AP2: `https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md`, `https://ap2-protocol.org/`.
- MCP: `https://modelcontextprotocol.io/specification/2025-06-18/server/tools`, `https://modelcontextprotocol.io/specification/2025-06-18/server/resources`.
- IETF: RFC 9421 `https://www.rfc-editor.org/rfc/rfc9421`, `https://datatracker.ietf.org/doc/draft-meunier-webbotauth-httpsig-directory/00/`, `https://datatracker.ietf.org/doc/draft-meunier-webbotauth-httpsig-protocol/00/`.
- Measured directly 25/09/2026: `https://www.allbirds.com/.well-known/ucp`.

### Secondary (only for positioning in §7)

- `https://www.digitalcommerce360.com/2026/04/02/visa-mastercard-in-agentic-commerce/`
- `https://www.forrester.com/blogs/agentic-payments-in-b2c-commerce-where-we-are-now/`
- `https://eco.com/support/en/articles/14730449-visa-mastercard-agentic-ai-commerce`
- `https://dev.to/benjifisher/ucp-v2026-04-08-spec-update-39l2`
