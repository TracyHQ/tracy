---
description: Shopify products.json measured on real stores on 25/09/2026 — shape, permissions, pagination, IDs, cache, metafields, body_html and the agent direction (UCP/Catalog MCP) — compared with Tracy's Content API v1 to draw lessons for content.json v2; does not decide for the PO.
sources:
  - apps/tracy-web/src/lib/quickstart-capabilities.js
  - apps/tracy-web/src/lib/contracts.js
  - apps/tracy-web/src/sites/route.js
  - apps/tracy-web/src/brief/bindings.js
  - packages/tools/tracy-site-tools/src/host/site.mjs
  - docs/adr/0016-two-layer-source-contract.md
  - docs/adr/0017-github-release-is-quickstart-source-of-truth.md
---

# Shopify `products.json` — design basis for Content API v2 (`/content.json`)

Context: Lee (PO, 25/09/2026) wants Tracy's `content.json` to be "as good as what Shopify does with
`products.json`": an agent grasps the content map of every Joomla/WordPress/EmDash quickstart to understand and
edit quickly. This document answers *what Shopify actually does* — from directly measured endpoints and the
shopify.dev documentation — then compares it with Content API v1 ([ADR 0021](../adr/0021-one-content-api-for-three-cms.md),
[Content API v1](content-api-v1.md), [integration decision](content-api-integration-decision.md)).
It does **not** decide for the PO; §11 lays out the options and trade-offs.

## 0. How it was measured and confidence level

- **Measured directly** (primary source, strongest): `curl` against `www.allbirds.com` (a long-standing
  Shopify store), `www.kyliecosmetics.com` (a newer store), and a few password-protected `*.myshopify.com`
  stores (`demo-store`, `quickstart-demo`), on 25/09/2026. Commands and figures are recorded where they are used.
- **Official documentation**: shopify.dev, help.shopify.com, shopify.dev/changelog, ucp.dev.
- **Secondary** (marked *secondary* in place): the community.shopify.com / community.shopify.dev forums
  (including answers from Shopify staff, since a forum is not documentation), third-party blogs.
- Anything without a source found is marked **could not be confirmed** (§12), not guessed.

## 1. The Online Store's three public JSON doors, and what they are compared to the API

A Shopify store with an Online Store opens three JSON doors that **need no token**, on the same origin as the site:

| Door | Returns | Documented? |
|---|---|---|
| `GET /products.json?limit=&page=` | `{"products":[…]}` — a list, "storefront" shape (tags as an array, compact variants) | **No** dedicated documentation page on shopify.dev (searching `site:shopify.dev "products.json"` only turns up Admin REST `/admin/api/{version}/products.json` and the theme's `product.json` template) |
| `GET /products/<handle>.json` | `{"product":{…}}` — **Admin REST shape** (tags as a comma string, has `template_suffix`, `published_scope`, variants have `inventory_policy`, `fulfillment_service`, `tax_code`…) | No |
| `GET /products/<handle>.js` | The **Ajax API** product object (prices in cents, `price_min/max`, `available`, `media`, `selling_plan_groups`) | **Yes**: [Ajax API · Product](https://shopify.dev/docs/api/ajax/reference/product) |
| `GET /collections/<handle>/products.json`, `/collections.json`, `/collections/<handle>.json`, `/pages.json` | Same list/detail style | No (measurable; `/blogs.json`, `/blogs/<h>/articles.json`, `/products/count.json` → 404) |

Worth remembering: `/products.json` is **platform behaviour, not an API contract**. Shopify documents
the Ajax API (`.js`) and two versioned APIs (Storefront GraphQL, Admin GraphQL/REST); the public `.json`
door has existed for a long time and the whole app ecosystem relies on it, but it has no reference page,
no version, no changelog. All figures about it below are **measured**, not commitments.

The three doors, one product, three different shapes (measured on Allbirds' `free-returns-coverage`):

- list `.json`: 13 product keys, 17 variant keys, `tags: [..]`.
- detail `.json`: 16 product keys (adds `image`, `template_suffix`, `published_scope`), 28 variant
  keys (adds `barcode`, `price_currency`, `inventory_quantity`, `old_inventory_quantity`,
  `inventory_policy`, `inventory_management`, `fulfillment_service`, `tax_code`, `weight`,
  `weight_unit`, `quantity_rule`, `quantity_price_breaks`, `image_id`), `tags: "a, b"`.
- `.js`: 26 keys, prices as integer cents, has `media[]` with `preview_image`, `aspect_ratio`, `media_type`.

Relation to Liquid: a theme can emit JSON itself with the `| json` filter, and Shopify **removed**
`inventory_quantity`/`inventory_policy` from that filter for stores created after 05/12/2017 "to help
prevent bots and crawlers from retrieving inventory quantities" ([Liquid `json` filter](https://shopify.dev/docs/api/liquid/filters/json)).
The alternate template `?view=<suffix>` only changes the HTML template ([alternate templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/alternate-templates));
measured `?view=json` on Allbirds still returns `text/html`. There is no documented mechanism for a theme to serve
JSON instead of HTML.

## 2. (a) The full shape of a product in `/products.json`

Real example, shortened (Kylie Cosmetics, 25/09/2026, `?limit=1`):

```json
{"products":[{
  "id": 9135478341874,
  "title": "Cosmic Metallic Pink Tote Bag",
  "handle": "cosmic-metallic-pink-tote-bag",
  "body_html": null,
  "published_at": "2026-09-16T08:36:20-07:00",
  "created_at": "2026-06-08T12:15:07-07:00",
  "updated_at": "2026-09-25T12:00:55-07:00",
  "vendor": "kylie-samples",
  "product_type": "Sample",
  "tags": ["_free_sample", "_gift_eligible", "algolia-ignore"],
  "variants": [{
    "id": 49655136780530, "title": "Default Title",
    "option1": "Default Title", "option2": null, "option3": null,
    "sku": "KF158", "requires_shipping": true, "taxable": true,
    "featured_image": null, "available": true,
    "price": "25.00", "grams": 230, "compare_at_price": null,
    "position": 1, "product_id": 9135478341874,
    "created_at": "2026-06-08T12:15:07-07:00", "updated_at": "2026-09-25T12:00:55-07:00"
  }],
  "images": [{
    "id": 50598853411058, "position": 1, "product_id": 9135478341874,
    "created_at": "2026-06-22T10:35:06-07:00", "updated_at": "2026-06-22T10:35:08-07:00",
    "variant_ids": [], "alt": null,
    "src": "https://cdn.shopify.com/s/files/1/0662/4598/4498/files/KJF_COSMIC20_25_Tote2_Stylized.jpg?v=1782149708",
    "width": 5000, "height": 5000
  }],
  "options": [{"name": "Title", "position": 1, "values": ["Default Title"]}]
}]}
```

Notable features of the shape:

- **Flat and fixed**: 13 keys, no envelope (no `meta`, no `next`, no `total`),
  no `links`. Consumers count `products.length < limit` to know the pages have run out.
- **One record = the whole product**, with `variants[]`, `images[]`, `options[]` fully embedded.
  There is no summary mode; `?fields=` is **ignored** (measured: `fields=id,handle` still returns 13 keys).
- **Prices are strings** `"25.00"` in the list `.json`, **integer cents** `2500` in `.js`; the currency is not stated
  in the list (only the detail `.json` has `price_currency`). The Ajax API says prices are in the "customer's
  presentment currency" ([Ajax Product](https://shopify.dev/docs/api/ajax/reference/product)).
- `body_html` is raw HTML or `null`/`""`; there is no text version.
- ISO 8601 timestamps with the shop's time zone offset.
- `images[].src` is a CDN URL with `?v=<unix>` — the URL itself is already a cache-buster.

## 3. (b) Official status and deprecation

- **Public `/products.json`**: no reference page, no deprecation notice. No commitment by Shopify
  to keep or drop it could be confirmed (§12).
- **Ajax API `/products/<handle>.js`**: documented, "doesn't require access tokens or a client
  ID", "can only be used by themes that are hosted by Shopify", "no hard rate limits … still
  subject to Shopify's standard API abuse-prevention measures" ([Ajax API](https://shopify.dev/docs/api/ajax)).
- **Admin REST `/admin/api/{v}/products.json`** (same shape as the public detail `.json`): the REST Admin
  API "is a legacy API as of October 1, 2024"; "Starting April 1, 2025, all new public apps must be
  built exclusively with the GraphQL Admin API"; product/variant specifically were deprecated even earlier,
  "as of REST API 2024-04" ([REST Product](https://shopify.dev/docs/api/admin-rest/latest/resources/product)).
  At the same time GraphQL opened the new product model: up to 2,048 variants/product, `productSet` "Creates or
  updates entire product state. Replaces all data (not a merge)" ([new product model](https://shopify.dev/docs/apps/build/graphql/migrate/new-product-model)).
- **Storefront API** (GraphQL, versioned, `https://{store}.myshopify.com/api/2026-07/graphql.json`)
  is the official read path for headless; it has **tokenless access** for "Products and Collections,
  Selling Plans, Search, Pages, Blogs, and Articles, Cart (read/write)"; Product Tags,
  Metaobjects/Metafields, Menu, Customers need a token ([Storefront API](https://shopify.dev/docs/api/storefront)).

That is, Shopify does **not** build the future on `products.json`; they build it on versioned GraphQL and,
for agents, on UCP (§9). The `.json` door is a "beaten path" everyone takes because it is convenient, and Shopify leaves it alone.

## 4. (c) Permissions: what is public, what is hidden, can the merchant turn it off

**Public without a token** — measured:

- Anyone who sends a `GET` gets the entire catalogue published to the Online Store: `limit=250&page=N`
  up to `page*limit ≤ 25000`.
- `access-control-allow-origin: *` — callable from a browser on any origin.

**What is hidden / absent:**

- **Draft, archived, unpublished**: do not appear. `published_status=unpublished` is ignored
  (measured). The Storefront documentation states the general principle: "The Storefront API will automatically limit
  your query to products that are published in any applicable catalogs. Unpublished products will
  behave just like they were archived or deleted: they will be omitted from connections and not
  found when queried by handle or ID" ([Storefront `product`](https://shopify.dev/docs/api/storefront/latest/queries/product)).
  Same spirit for detail: an empty 404 (measured: `/products/khong-ton-tai.json` → 404, 0-byte body).
- **Inventory**: the list `.json` has **no** `inventory_quantity`. In the detail `.json` and `.js`:
  the old store (Allbirds) **still exposes** `inventory_quantity: -2`, `inventory_policy: "deny"`; the new store
  (Kylie) returns `null` for both. Matches the Liquid documentation: removed from 05/12/2017 to block bots
  ([Liquid `json`](https://shopify.dev/docs/api/liquid/filters/json)). An old store that wants to hide them must ask
  support to switch on a flag (*secondary*: [community 215038](https://community.shopify.com/t/how-can-older-shopify-stores-have-inventory-quantity-and-inventory-policy-json-properties-hidden/215038)).
  On the Storefront API, `quantityAvailable` is "Token access required" ([ProductVariant](https://shopify.dev/docs/api/storefront/latest/objects/ProductVariant)).
- **Prices per market**: `products.json` does not accept `currency=`/`country=` (measured: prices unchanged).
  The Storefront API uses `@inContext(country: XX)` to return per-market prices and "automatically
  filters out products that aren't published for the country" ([international pricing](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/markets/international-pricing)).
- **Metafields/metaobjects**: not in any `.json`/`.js` door (measured, and §8).
- **Customers, orders, B2B price lists**: absent.

**How a merchant turns it off/restricts it:**

- **Password page (Private mode)** blocks everything: `demo-store.myshopify.com/products.json` → **401**
  `text/html`, `cache-control: private, no-store`; `quickstart-demo.myshopify.com/products/x.json`
  → **302** to `/password` (measured). Help center: private mode "all of your online store's pages are
  hidden from visitors and search engines" ([password page](https://help.shopify.com/en/manual/online-store/themes/password-page)).
  Meaning public reads are tied to **the public state of the whole site**, with no separate switch.
- **There is no switch to turn off `products.json` on its own.** A Shopify staff member (Liam-Shopify, 05/03/2025,
  *secondary*) answered the question "Why are all products public?": "This is an experience that our internal
  teams are aware of and are working to improve", recommending moving sensitive data to metaobjects
  ([community.shopify.dev 10069](https://community.shopify.dev/t/why-are-all-products-public/10069)).
  A 2024 merchant forum thread (*secondary*) reaches a similar conclusion; redirects in the theme cannot block it
  ([community 369383](https://community.shopify.com/t/how-can-i-prevent-scraping-of-products-json-on-my-shopify-store/369383)).
- **`robots.txt`**: by default does **not** disallow `/products.json` or `*.json`; it only disallows
  `/recommendations/products`, `/collections/*+*`, `/collections/*sort_by*`, checkout, account…
  (measured `www.allbirds.com/robots.txt`; themes can edit it via `robots.txt.liquid`
  ([robots.txt.liquid](https://shopify.dev/docs/storefronts/themes/seo/robots-txt))). Robots is only a
  request to well-behaved crawlers, not a permission.
- **Rate limits**: no figure published for the `.json` door. The Ajax API has "no hard rate limits" but is subject to
  "abuse-prevention". Storefront API: "Buyer traffic isn't rate-limited at all"; limits by
  "request-per-minute … based on buyer IP", tokenless has a "query complexity limit of 1,000"
  ([API limits](https://shopify.dev/docs/api/usage/limits), [Storefront API](https://shopify.dev/docs/api/storefront)).
  Admin REST: 40 requests/minute/app/store, refilling 2/second, ×10 for Plus, 429 + `Retry-After`
  ([REST rate limits](https://shopify.dev/docs/api/admin-rest#rate_limits)). Admin GraphQL: 100/200/1000/2000
  points/second by plan, capped at 1,000 points/query ([GraphQL rate limits](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits)).
  Measured 60+ consecutive requests to Allbirds without hitting a 429.
- **The `shopify-complexity-score` header** appears on `products.json` responses (310 with `limit=1`)
  — a sign of internal cost accounting; its meaning **could not be confirmed**.

**Does Shopify consider this a leak?** There is no official statement. Indirect evidence: they
proactively removed inventory from the public door (2017), default metafields to `NONE` for the Storefront API
(§8), and staff acknowledged "aware … working to improve" (*secondary*). A reasonable reading: **published
catalogue data is public by design**; **inventory, custom data and per-customer prices are not**.

## 5. (d) Pagination, sorting, filtering

Measured on Allbirds:

| Parameter | Result |
|---|---|
| `limit` | default **30**; `limit=0` → 30; `limit=251` → **250** (silent cap) |
| `page` | 1-based; `page=0` ≡ `page=1`; `page=abc` → 400 `{"errors":"expected String to be a Integer: page"}`; `page=99999` → 400 `{"errors":"Page * Limit exceeds the 25000 limit."}` |
| Sorting | no parameter; the measured order is **`published_at` descending** over the first 250 records (undocumented) |
| `/collections/<handle>/products.json` | filters by collection, same `limit`/`page`; a non-existent collection → 200 `{"products":[]}` (not 404) |
| `sort_by`, `since_id`, `updated_at_min`, `published_status`, `fields`, `currency` | **silently ignored**, 200 as if absent |

The delta parameters (`since_id`, `updated_at_min/max`, `published_at_min/max`, `ids`,
`collection_id`, `fields`, `presentment_currencies`) exist only in **Admin REST** with a token
([REST Product](https://shopify.dev/docs/api/admin-rest/latest/resources/product)); there `page`
has been dropped, replaced by a `page_info` cursor in the `Link` header, "Once you include `page_info`, you
can't add any other parameters to the request, except for `limit`", the link is "temporary"
([REST pagination](https://shopify.dev/docs/api/usage/pagination-rest)). Storefront GraphQL uses
`first/after` + `sortKey/reverse` + `query:` with filters `updated_at`, `tag`, `product_type`,
`vendor`, `title`, `available_for_sale`, `created_at`, `variants.price`
([Storefront `products`](https://shopify.dev/docs/api/storefront/latest/queries/products)).
Platform caps: input arrays up to 250 elements, pagination up to 25,000 objects
([API limits](https://shopify.dev/docs/api/usage/limits)) — exactly the figure in the `Page * Limit` error.

## 6. (e) IDs: stable numeric, changeable handle, GID, the same ID for writing

- `id` is "An unsigned 64-bit integer that's used as a unique identifier for the product";
  `handle` is "A unique human-friendly string for the product" — merchants can change the handle
  ([REST Product](https://shopify.dev/docs/api/admin-rest/latest/resources/product)).
- **The public door only opens by handle**: `/products/<handle>.json` 200, `/products/<id>.json` **404**
  (measured). The list gives both `id` and `handle`, so consumers take the `id` from the list and keep it as the key.
- GID: "A global ID is an application-wide uniform resource identifier (URI) that uniquely
  identifies an object", of the form `gid://shopify/{object_name}/{id}`; the numeric part **matches** the REST numeric id;
  GraphQL has `legacyResourceId` = "The ID of the corresponding resource in the REST Admin
  API"; REST has `admin_graphql_api_id` ([Global IDs](https://shopify.dev/docs/api/usage/gids),
  [Admin `Product`](https://shopify.dev/docs/api/admin-graphql/latest/objects/Product)).
- So **"public read → authorized write" uses the same ID**: `variants[].id` from `products.json` is
  exactly the `gid://shopify/ProductVariant/<id>` that Admin GraphQL mutations accept, and also the `offer_id`
  in `/products/<handle>.oembed` (measured). UCP keeps the same principle: the variant `id` is "Used as item.id
  in checkout", "Use id for stable API references" ([UCP catalog](https://ucp.dev/2026-08-25/specification/shopping/catalog/)).
- The new Catalog MCP uses ids of the form `gid://shopify/p/7f3a2b8c1d9e` (more opaque than numeric) — see
  [About catalogs](https://shopify.dev/docs/agents/catalog).

## 7. (f) Cache, `updated_at`, webhooks

Headers measured on `www.allbirds.com/products.json?limit=1`:

```
cf-cache-status: DYNAMIC
cdn-cache-control: no-cache, no-store
etag: W/"page_cache:11044168:ProductListController:<hash>"
vary: Accept
access-control-allow-origin: *
(no Cache-Control, no Last-Modified)
```

- The CDN does **not** cache (`DYNAMIC`, `no-store` for the CDN), but there is a **weak ETag** and it returns **304** when
  `If-None-Match` is sent (measured). The ETag changes with the records (two calls a few minutes apart, different hash because
  one product's `updated_at` changed).
- **Per-record `updated_at`** on products, variants and images. That is the sync key Shopify recommends:
  webhooks "Shopify doesn't guarantee ordering within a topic", "Webhook delivery isn't always
  guaranteed", hence "reconciliation jobs" with "`updated_at` filter parameters", and ordering by
  `X-Shopify-Triggered-At` + `updated_at` ([webhooks](https://shopify.dev/docs/apps/build/webhooks)).
- Webhooks `products/create|update|delete` need the `read_products` scope; the payload is the **full** product
  (`id`, `title`, `handle`, `body_html`, `status`, `admin_graphql_api_id`, `variants[]` with
  `inventory_quantity`, `options`, `images`, `media`) ([webhook topics](https://shopify.dev/docs/api/webhooks?reference=toml)).
- A measured caveat: a product's `updated_at` **jumps every few seconds** on a large store (Allbirds:
  `12:00:55` → `12:01:23` → `12:01:26` → `12:02:18` within ~2 minutes for the same product) — any app/inventory
  touch changes it. `updated_at` says "something changed", not "the content changed".

## 8. (g) Metafields, options, variants, images, media — what lives where

| Data | `/products.json` | `/products/<h>.json` | `/products/<h>.js` | Storefront GraphQL | Admin |
|---|---|---|---|---|---|
| `options[]` | name/position/values | + `id`, `product_id` | name/position/values | `options{name optionValues}` | yes |
| `variants[]` | 17 keys, string prices | 28 keys, with inventory/tax/weight | 24 keys, prices in cents, `available` | yes, `quantityAvailable` needs token+scope | up to 2,048/product |
| `images[]` | id/src/width/height/alt/variant_ids | as in the list | `images[]` are URLs + `featured_image`, `media[]` with `media_type`, `preview_image` | `images`, `media` (image/video/3D) | yes |
| Metafields | **no** | **no** | **no** | yes, only when the definition has `access.storefront = PUBLIC_READ` (default `NONE`); Liquid always sees them ([access controls](https://shopify.dev/docs/apps/build/custom-data/metafields/definitions/use-access-controls-metafields)) | yes |
| Metaobjects | no | no | no | needs a token | yes |
| Selling plans | no | no | `selling_plan_groups` | yes | yes |
| `category` (taxonomy) | no | no | no | yes | yes |
| `seo{title,description}` | no | no | no | yes | yes |
| Inventory | no | old stores have it | old stores have it | token + `unauthenticated_read_product_inventory` | yes |

Takeaway: the public door carries a very detailed **sales structure** (variant/option/image) but
**no custom data**. Custom data is where Shopify puts an authorized door, closed by default.

## 9. (h) Raw `body_html` — Shopify does not split it into blocks

- `body_html`/`descriptionHtml` is "The description of the product, with HTML tags"
  ([Admin `Product`](https://shopify.dev/docs/api/admin-graphql/latest/objects/Product)); Storefront
  adds `description` "with HTML tags removed". No blocks, no fields inside the description.
- Structure lives **outside** the description: `variants`/`options`/`images` are tables with a schema, while the "page"
  (the description) is a blob. A merchant who wants structured content uses **metafields/metaobjects**
  (with a definition, type, access) — and those do not come out through the public door.
- Online Store pages (sections/blocks in JSON templates) are **not** in any public JSON
  door; Shopify does not expose a theme's "page map" for machines to read. `products.json` is a product
  catalogue, not the site's content map.

Compared with Tracy: v1 already chose `bodyHtml` (blob) **and** `blocks[].fields[]` (structure, with `slotKey`),
i.e. doing something Shopify has not done: exposing the page's content map. That is a product difference, not a
shortcoming of Shopify — but it is also where there is no precedent to copy.

## 10. (i) What AI agents use, and where Shopify is moving agents

**How `products.json` is used today** (*secondary*, dev.to/Apify): scrapers, price comparison, RAG feeds —
because it needs no key and gives 250 records/request. No Shopify documentation points agents at it.

**Shopify points agents down another path, and has closed the old one:**

- **Storefront MCP** (`https://{shop}/api/mcp`, tools `search_shop_catalog`, `get_product_details`,
  `get_cart`, `update_cart`, `search_shop_policies_and_faqs`) — "The catalog and cart tools on
  `https://{shop}/api/mcp` were removed"; only policies/FAQ remain ([Migrate from Storefront MCP](https://shopify.dev/docs/apps/build/storefront-mcp)).
  Changelog 24/06/2026: cart tools "maintained until August 31, 2026", replaced by UCP Cart MCP
  ([changelog](https://shopify.dev/changelog/storefront-mcp-cart-tools-are-being-deprecated-in-favour-of-ucp-cart-mcp)).
  Measured: `www.allbirds.com/api/mcp` → 404. The dates of the catalog move to UCP (22/04/2026) and shutdown (15/06/2026) are
  *secondary* (Weaverse), not found in the current `changelog.md`.
- **UCP — Universal Commerce Protocol** (`ucp.dev`, date-based version `2026-08-25`): the store publishes a
  profile at `/.well-known/ucp` — measured on Allbirds: header `link: </.well-known/ucp>; rel="ucp"`,
  the document lists `services.dev.ucp.shopping` with `transport: "mcp"`, `endpoint:
  https://weareallbirds.myshopify.com/api/ucp/mcp`, capabilities `catalog.search`, `catalog.lookup`,
  `cart`, `checkout`, `order`, `fulfillment`, `discount`, `identity_linking`, and the extension
  `dev.shopify.catalog` with schema `https://shopify.dev/ucp/schemas/2026-08-25/shopify_catalog.json`.
  Spec: "Businesses publish their profile at `/.well-known/ucp`", the platform sends a `UCP-Agent` header,
  the highest common version is chosen; transports REST/MCP/A2A/Embedded ([UCP overview](https://ucp.dev/2026-08-25/specification/overview/)).
  Catalog: "Catalog responses (pricing, availability, etc.) reflect the Business's current terms
  for the given request but are not transactional commitments — checkout is authoritative"
  ([UCP catalog](https://ucp.dev/2026-08-25/specification/shopping/catalog/)).
- **Storefront Catalog MCP** (`POST https://{store}/api/ucp/mcp`, tools `search_catalog`,
  `lookup_catalog`, `get_product`): "requires an agent profile — every request must include a
  `meta.ucp-agent.profile` URL"; "no API key needed" ([Storefront Catalog](https://shopify.dev/docs/agents/catalog/storefront-catalog),
  [About catalogs](https://shopify.dev/docs/agents/catalog)). The **Global Catalog** at
  `https://catalog.shopify.com/api/ucp/mcp` searches across all merchants. The product shape of
  `shopify_catalog.json`: `id`, `title`, `description` ("one or more formats"), `url`,
  `price_range`, `media[]`, `variants[]` (each variant has `checkout_url`, `requires`, `selling_plans`),
  filter `available` "Default true (only sale-ready items)".
- **Agentic storefronts** (help center): "active by default for eligible stores", the merchant must accept the
  "Shopify Agentic Storefronts Supplemental Terms of Service"; managed under Sales channels ›
  Agentic; products reach AI channels "through Shopify Catalog" ([agentic storefronts](https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts),
  [setup](https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts/setup),
  [requirements](https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts/requirements)).
  Channels: ChatGPT, Google AI Mode/Gemini, Microsoft Copilot, Meta; Checkout Kit/Universal Cart are
  platform-side components, outside Tracy's scope.
- **Dev MCP** (`@shopify/dev-mcp`): "runs locally and doesn't require authentication" — for writing
  code (docs, schema, validation), not runtime ([Dev MCP](https://shopify.dev/docs/apps/build/devmcp)).
- **Sidekick** (in the admin): "analyzing data, managing orders, or editing products", "presents
  changes for your review before applying them" ([Sidekick](https://help.shopify.com/en/manual/shopify-admin/productivity-tools/sidekick)).
  This is the model closest to Tracy: the agent reads the real store context, proposes edits, a person approves.

Three takeaways for Tracy: (1) Shopify does **not** have agents use `products.json`; it gives agents a
door **with an agent identity** (profile URL) but **no API key needed**, separate from public reads;
(2) the unit agents operate on is the **variant id** — the same id as the write door; (3) the agent door has a **discovery
document** (`/.well-known/ucp`) declaring version/capabilities/schema, so the agent knows how to talk
before calling.

## 11. Why Shopify chose that shape (reasoned inference, not a Shopify statement)

- The list `.json` shape **is the Admin REST shape with parts removed** (`admin_graphql_api_id`, `status`, inventory,
  `template_suffix`, `published_scope`); the detail `.json` is almost exactly Admin REST. Very likely
  the same serializer — which is why detail exposes more than list, and why old stores expose inventory. Not a
  separately designed "public API", but an admin door opened to the front and then gradually trimmed.
- `.js` (Ajax) is the shape for **theme JavaScript**: cents, `available`, `price_varies` — optimised
  for UI rendering, not for syncing.
- The variant/option/image structure is the **sales model** (SKU, price, per-variant images) — something
  every merchant needs in exactly the same way, so it can be standardised. Descriptions differ per merchant, so they are a blob.
- Flat `page`/`limit` because this is an extended HTML page cache (ETag `page_cache:…:ProductListController`),
  not a streaming API.

## 12. Lessons for `content.json` v2

Each bullet: **what Shopify does → what Tracy v1 does → the choice for v2 (trade-off)**. Does not decide for the PO.

1. **Public read and authenticated write are separate doors, but share IDs.** Shopify: `products.json`
   without a token, Admin mutations with a token, the same numeric id/GID. → v1: only a read path through the keyed
   relay (seat + toolset `code` + service credential), an opaque per-site HMAC id, "does not encode raw DB
   IDs, selectors or write targets". → v2: keep the opaque id **but guarantee that the same `id`/`blockId`/`fieldKey`
   is the target of the existing `content.write`/apply**, so the agent goes read → write without looking up a second table.
   Trade-off: the id must survive fork/restore (integration decision §1 already accepted the DB copy limitation).

2. **Is there a "published, no identity needed" mode or not?** Shopify: the published catalogue is
   public by design; drafts/inventory/custom data are not. Password page = all doors off. → v1: private,
   `no-store`, 401 when unauthenticated, "Out of scope: a default public feed". → v2 options:
   (A) stay fully private; (B) open a **`view: "public"`** for sites without a password, published
   only, no `fields` with a sensitive `semanticKey`, no `unresolved`/counts that reveal drafts — like
   `products.json`; (C) open it publicly but require an **agent profile URL** like UCP (identity, no key).
   Trade-off: (B) gets customers' content scraped en masse (Shopify suffers exactly that, §4), but lets
   agents outside Tracy use it; (C) is what Shopify chose for agents in 2026.

3. **Flat pagination first, signed cursors later.** Shopify public: `limit≤250` + `page`, capped at
   `page*limit ≤ 25000`, a clear 400 error; Admin: a temporary `page_info` cursor, only `limit` may be added. → v1:
   `limit≤100`, a 5-minute signed cursor bound to a snapshot, 409 when the source changes. → v2: consider for summary
   listings an **unsigned `page`/`offset`** when the `type` filter and sort are deterministic, keeping signed cursors only for
   detail continuation (`blocksCursor`, `itemsCursor`) — where a snapshot is really needed. Trade-off: flat pages
   can repeat/lose records when the source changes between two pages (Shopify accepts this; v1 §6 forbids it).

4. **A summary listing good enough for the agent to decide, without detail.** The Shopify list embeds the **whole** product
   (variants/images) — 250 products ≈ 1.6 MB (measured). → v1: the summary drops body/blocks/fields, 256 KiB. →
   v2: keep the summary light but add **counts and traces**: `blockCount`, `fieldCount`, `imageCount`,
   `bodyBytes`, `revision`, `updatedAt` — so the agent picks the right content without loading detail. Trade-off:
   counts may reveal the existence of hidden blocks — count only within the readable scope.

5. **Per-record `updated_at` is enough for incremental sync; a whole-site snapshot is for consistency, not
   for caching.** Shopify has no snapshot; it has `updated_at` at every level, ETag/304, and recommends
   reconciliation by `updated_at`, not trusting webhooks. → v1: `snapshot.revision` + `content.revision`,
   nullable `updatedAt`, forbids 304 before auth. → v2: (a) require `updatedAt` and `revision` **in the
   summary too**; (b) support **`If-None-Match`/304 after auth** with an ETag per (site, principal, scope,
   query); (c) consider an `updatedSince=` filter for syncing agents. Trade-off: `updated_at` "jumps" because
   plugins touch it (measured §7) → a content-based `revision` is better than a timestamp; adapters must prove it.

6. **Handle and id side by side; detail opens by both.** Shopify public: the list has `id`+`handle`,
   detail only by handle (id → 404). Storefront: `product(id:|handle:)`. → v1: `?id=` opaque
   only; `slug` is just an attribute. → v2: allow **`?slug=<slug>&type=page&locale=`** as a secondary
   lookup (agents often know the URL before the id), returning the same envelope; the id remains the durable key.
   Trade-off: slug changes → 404, and slugs shared across locales must also filter by `locale`.

7. **Blob + structure side by side, with plain names.** Shopify: raw `body_html` + `variants[]`/`options[]`
   with a schema; every key is a business name (`sku`, `price`, `compare_at_price`), there is no generic
   "field.key/type/value" layer. → v1: `bodyHtml` + `blocks[].fields[]{key,type,value,slotKey,semanticKey}`
   — general, but the agent must read two levels to learn "what is the hero's heading". → v2: keep `fields[]`
   as the source of truth, but add a **named flat projection** for common slots (`heading`,
   `subheading`, `image`, `cta`) or a standard `role` for blocks (`hero`, `footer`, `nav`) — Shopify
   can do it because sales models are alike; Tracy has 152 design systems + 3 CMSs, so it must be limited
   to the set of roles evidenced by contracts. Trade-off: two representations of one value can drift —
   the projection must be **derived**, not writable.

8. **Images with metadata and a cache-buster in the URL.** Shopify: `images[].src` CDN with `?v=<unix>`,
   `width/height/alt/variant_ids/position`. → v1: `images[]{id,src,alt,width,height,usages}`,
   unknown dimensions = null. → v2: keep; consider a fingerprinted `src` (hash or `?v=`) so the agent
   knows an image changed without reloading it, and keep `usages` as in v1 (Shopify only has `variant_ids`).

9. **Three shapes for three users is a burden, not a feature.** Shopify has the list `.json`,
   the detail `.json`, `.js`, GraphQL — four ways to represent one product, `tags` sometimes an array sometimes a string,
   prices sometimes strings sometimes cents; consumers must learn them all. → v1: one envelope, camelCase, one endpoint. →
   v2: **keep one shape**; if a "UI shape" is needed, it is a projection inside the same envelope, not a second
   door. This is where Tracy should **not** copy Shopify.

10. **A discovery document before calling.** UCP: `/.well-known/ucp` declares version, capabilities,
    schema URL, endpoint; the agent negotiates, then calls. Shopify's `products.json` has nothing like
    that (the agent has to "know"). → v1: `schemaVersion`, `provenance` (quickstart/contract), `completeness`
    live **inside** the response. → v2: consider **`GET /content.json?describe=1`** (or `/.well-known/tracy-content`)
    returning: version, `site.locales`, the list of available `type`s, the number of contents per type, `capabilities`
    (blocksCursor? itemsCursor? slug lookup? public view?), a schema link. The agent reads it once and skips
    many probing runs. Trade-off: one more surface to keep correct; it must be derived from the adapter, not hand-written.

11. **Do not leak data beyond its purpose through a "convenience" door.** Shopify's detail `.json` exposes
    `inventory_quantity`, `tax_code`, `fulfillment_service` for old stores because it shares the admin
    serializer; the fix took 6 years and still requires asking support. → v1: forbids user/token/filesystem/XPath/raw DB IDs
    in the envelope; `validateContent` checks it. → v2: keep as is, and add a test **"detail reveals no more about
    existence than summary"** together with a field deny-list (accounts, paths, plugin secrets) for every
    adapter — Shopify's most expensive lesson is **a serializer shared with the admin**.

12. **Limits must be stated as errors, not silent truncation — but don't let errors block the agent.** Shopify:
    `limit=251` → 250 silently, unknown filters silently ignored, `page` too high → a clear 400. → v1: unknown
    query 400, oversized field 413 + `links.firstBlock`. → v2: keep 400/413 (per the repo's RULES #3:
    "Say what you can't do"), but consider **`Warning`/`unresolved` for ignored parameters** instead
    of a hard 400 when the agent sends a filter this adapter does not support yet — because the three adapters will support things unevenly.
    Trade-off: too soft and the agent thinks the filter was applied (exactly Shopify's mistake).

## 13. Could not be confirmed

- Any official Shopify commitment about the future of public `/products.json` (keep, drop, version).
- A concrete rate limit figure for the public `.json` door; the meaning of the `shopify-complexity-score` header.
- Whether `products.json`'s default order is always `published_at desc` (only one store measured); whether the
  order in `/collections/<h>/products.json` follows the collection's sort.
- The dates the Storefront Catalog MCP moved to UCP (22/04/2026) and the old endpoint was shut down (15/06/2026) — only
  secondary sources; the current `changelog.md` only has the cart entry (24/06/2026).
- A Shopify statement that `products.json` is or is not a leak; there are only forum answers.

## 14. Sources

Measured directly (25/09/2026, `curl`): `https://www.allbirds.com/products.json`,
`/products/<handle>.json`, `/products/<handle>.js`, `/products/<handle>.oembed`, `/collections.json`,
`/collections/all/products.json`, `/pages.json`, `/robots.txt`, `/.well-known/ucp`, `/api/mcp`;
`https://www.kyliecosmetics.com/products.json` and `/products/<handle>.json`;
`https://demo-store.myshopify.com/products.json` (401); `https://quickstart-demo.myshopify.com/products/x.json` (302 `/password`).

Official:

- https://shopify.dev/docs/api/ajax — Ajax API (unauthenticated, no hard rate limits)
- https://shopify.dev/docs/api/ajax/reference/product — `/products/{handle}.js`
- https://shopify.dev/docs/api/admin-rest/latest/resources/product — REST Product, deprecation 2024-04, query params
- https://shopify.dev/docs/api/admin-rest#rate_limits — REST rate limits
- https://shopify.dev/docs/api/usage/pagination-rest — `page_info`, `since_id`, `page` removed
- https://shopify.dev/docs/api/usage/limits — leaky bucket, 250 input, 25,000 pagination
- https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits — points/second by plan
- https://shopify.dev/docs/api/usage/gids — GID, `legacyResourceId`, `admin_graphql_api_id`
- https://shopify.dev/docs/api/admin-graphql/latest/objects/Product — `descriptionHtml`, `status`, 2048 variants
- https://shopify.dev/docs/apps/build/graphql/migrate/new-product-model — `productSet`
- https://shopify.dev/docs/api/storefront — token types, tokenless access, rate limits
- https://shopify.dev/docs/api/storefront/latest/queries/products — filter/sort
- https://shopify.dev/docs/api/storefront/latest/queries/product — unpublished omitted
- https://shopify.dev/docs/api/storefront/latest/objects/Product — fields
- https://shopify.dev/docs/api/storefront/latest/objects/ProductVariant — `quantityAvailable` token
- https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/markets/international-pricing — `@inContext`
- https://shopify.dev/docs/apps/build/custom-data/metafields/definitions/use-access-controls-metafields — `NONE`/`PUBLIC_READ`
- https://shopify.dev/docs/api/liquid/filters/json — inventory removed from 05/12/2017
- https://shopify.dev/docs/storefronts/themes/architecture/templates/alternate-templates — `?view=`
- https://shopify.dev/docs/storefronts/themes/seo/robots-txt — `robots.txt.liquid`
- https://shopify.dev/docs/apps/build/webhooks — no ordering/delivery guarantee, reconcile by `updated_at`
- https://shopify.dev/docs/api/webhooks?reference=toml — topics `products/*`, payload
- https://shopify.dev/docs/apps/build/storefront-mcp — Storefront MCP removed → UCP
- https://shopify.dev/changelog/storefront-mcp-cart-tools-are-being-deprecated-in-favour-of-ucp-cart-mcp — 24/06/2026, sunset 31/08/2026
- https://shopify.dev/docs/agents — UCP, AI Toolkit
- https://shopify.dev/docs/agents/catalog — Storefront vs Global Catalog, agent profile
- https://shopify.dev/docs/agents/catalog/storefront-catalog — `/api/ucp/mcp`, tools
- https://shopify.dev/ucp/schemas/2026-08-25/shopify_catalog.json — product/variant schema
- https://shopify.dev/docs/apps/build/devmcp — Dev MCP
- https://ucp.dev/2026-08-25/specification/overview/ — discovery, negotiation, transports
- https://ucp.dev/2026-08-25/specification/shopping/catalog/ — id semantics, "checkout is authoritative"
- https://help.shopify.com/en/manual/online-store/themes/password-page — Private mode
- https://help.shopify.com/en/manual/shopify-admin/using-json — `.json` in the admin
- https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts — active by default, terms
- https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts/setup
- https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts/requirements
- https://help.shopify.com/en/manual/shopify-admin/productivity-tools/sidekick

Secondary:

- https://community.shopify.dev/t/why-are-all-products-public/10069 — Liam-Shopify, 05/03/2025
- https://community.shopify.com/t/how-can-i-prevent-scraping-of-products-json-on-my-shopify-store/369383 — 2024
- https://community.shopify.com/t/how-can-older-shopify-stores-have-inventory-quantity-and-inventory-policy-json-properties-hidden/215038 — 2023
- https://weaverse.io/blogs/shopify-storefront-catalog-mcp-ucp-migration-hydrogen-2026 — dates 22/04 · 15/06/2026
- https://dev.to/dentedlogic/the-shopify-productsjson-trick-scrape-any-store-25x-faster-with-python-4p95 — how scrapers use it
