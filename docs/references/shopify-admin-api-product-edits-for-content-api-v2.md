---
description: How Shopify lets an app/agent edit a product through the GraphQL Admin API (mutations, permissions, concurrency, history, the data/presentation boundary, validation), compared with Tracy Content API's v1 write path to supplement the v2 plan.
sources:
  - apps/tracy-web/src/sites/route.js
  - packages/tools/tracy-site-tools/src/host/site.mjs
  - packages/tools/tracy-site-tools/src/host/normalize.mjs
  - docs/adr/0021-one-content-api-for-three-cms.md
  - docs/references/content-api-v1.md
  - docs/references/content-api-integration-decision.md
---

# Shopify Admin API product edits — compared with the Content API v2 write path

Surveyed on 25/09/2026, from primary sources only (shopify.dev, help.shopify.com, changelog). Every
claim has a URL; where the original page could not be loaded or the documentation is unclear, it is marked **unconfirmed**.
The API version referenced on shopify.dev at the time of reading is `2026-07` (`latest`).

This is a comparison document to supplement the v2 plan of [ADR 0021](../adr/0021-one-content-api-for-three-cms.md);
it does not decide on behalf of the PO. The ADR's §6 decision (build no new undo/journal; acceptance = read →
write through a native door with permissions/revision → read again) is the comparison frame throughout.

## 0. Tracy's v1 write path — summary for comparison

- The agent calls `tracy_site content.contract {operation:"apply", expected_revision, changes:{"<slot key>":"<text>"}}`
  (`packages/tools/tracy-site-tools/src/host/site.mjs:1218`). `changes` accepts 1–1,500 slot →
  string pairs (`site.mjs:1505`); the key is the `slotKey` that `content.read`/inspect returns.
- Tracy-web receives `POST /api/sites/:key/apply`, checks seat/policy against the action → policy table
  (`apps/tracy-web/src/sites/route.js:237-311`; whether `content.contract` is a read or a write depends on
  `params.operation`), then relays to the Joomla/WordPress Claude Cowork plugin — where the presentation-lock
  and the transaction live.
- `request_id = r-<sha256([changes, evidence, expected_revision])[:16]>` is deterministic
  (`packages/tools/tracy-site-tools/src/host/normalize.mjs:341`): resending the same apply makes the component
  return the already-written result, not apply twice.
- A refusal returns a code + message; `refusalNext` (`site.mjs`) translates each message into a next
  step for the agent, e.g. "Content changed; inspect again" → inspect again then apply with the new revision
  (`site.mjs:1507`); "Content too long" → shorten or split into sibling slots (`site.mjs:1519`).
- No editorial permission yet: `content.read` keeps the `code` policy, editors get 403
  ([integration decision §2](content-api-integration-decision.md)).

## (a) Current product mutations of the GraphQL Admin API

### Mutation map

| Mutation | Job | Notes per the docs |
|---|---|---|
| `productSet` | Declares the whole product state (create or update) | Argument `identifier` (`id` / `handle` / `customId`), `input: ProductSetInput!`, `synchronous: Boolean` (default `true`). For **options and variants**: "creates, updates, or removes options and variants as needed to make Shopify's product data match exactly what you provide"; for other fields (description, tags…): "omitted fields remain unchanged while included fields are updated to match your input, even if you provide an empty value" ([sync-data](https://shopify.dev/docs/apps/build/product-merchandising/products-and-collections/sync-data)). Default 2,048 variants/product. |
| `productUpdate` | Edits product fields | New argument `product: ProductUpdateInput` (+ `identifier`, `media`); `input: ProductInput` is **Deprecated**. "The `productUpdate` mutation doesn't support updating product variants" — variants go through `productVariantsBulkUpdate`, options through `productSet`. |
| `productCreate` | Creates a product | "As of API version 2024-04, `productCreate` generates only a single default variant"; multiple variants → `productVariantsBulkCreate`. After 50,000 variants/shop, a limit of 1,000 new variants/day. |
| `productVariantsBulkUpdate` | Edits many variants of one product | `productId`, `variants: [ProductVariantsBulkInput!]!`, `allowPartialUpdates` (default `false`: one bad variant rejects the whole batch). SKU goes through `inventoryItem.sku`. |
| `productOptionsCreate` | Adds an option (Size, Color…) | `variantStrategy: LEAVE_AS_IS` (default) or `CREATE` (generates every variant combination). |
| `metafieldsSet` | Upserts metafields by `ownerId + namespace + key` | At most 25 per run; **atomic**: "no changes are persisted if an error is encountered"; has `compareDigest` (see §c). |
| `productChangeStatus` | Changes ACTIVE/ARCHIVED/DRAFT | The docs page says "Deprecated. Use productUpdate instead." (`status` is in `ProductUpdateInput`). |
| `publishablePublish` | Puts a product/collection on a publication (sales channel, e.g. Online Store) | Scope `write_publications`; `publishDate` only for Online Store; the product must be `ACTIVE` to show. |

### REST product endpoint: legacy since when, and why

- The REST Product page says verbatim: "The REST Admin API is a legacy API as of October 1, 2024.
  Starting April 1, 2025, all new public apps must be built exclusively with the GraphQL Admin API."
  and "Listing, creating, updating, and deleting products is deprecated as of REST API 2024-04."
  ([REST Product](https://shopify.dev/docs/api/admin-rest/latest/resources/product)). The REST
  Product Variant page says the same for variants, and adds: the REST endpoint is limited to 3 options / 100 variants
  and **does not process** requests over the threshold ([REST Product Variant](https://shopify.dev/docs/api/admin-rest/latest/resources/product-variant)).
- Reason: the new product model (2024-04) separates variant/option operations from the product and raises the ceiling to
  2,048 variants; REST is fixed at 100 so it cannot scale ([migration guide](https://shopify.dev/docs/api/admin/migrate/new-product-model);
  changelog 15/10/2025: "apps that are not using the in-support GraphQL product APIs may have a
  downgraded or broken experience when creating or viewing products with more than 100 variants"
  ([changelog](https://shopify.dev/changelog/the-product-variant-limit-is-now-2048-for-all-merchants))).
- **Unconfirmed from the original page:** the two changelog posts "New GraphQL product APIs … 2024-04" and
  "Breaking changes in several ProductVariant related mutations in version 2024-10" are in shopify.dev's search
  index but returned 404 when loaded on 25/09/2026; the `productVariantUpdate` page on
  `latest` also 404s (the mutation was removed from the new version). The conclusion "singular variant mutations were
  deprecated in 2024-10, replaced by `productVariantsBulk*`" rests only on the index snippet.

### Shape and short examples

```graphql
mutation upsertByHandle($input: ProductSetInput!, $sync: Boolean!) {
  productSet(identifier: { handle: "cool-socks" }, input: $input, synchronous: $sync) {
    product { id handle title updatedAt }
    productSetOperation { id status userErrors { code field message } }
    userErrors { code field message }
  }
}
```

`ProductSetInput` contains: `category, claimOwnership, collections, combinedListingRole, descriptionHtml,
files, giftCard, giftCardTemplateSuffix, handle, metafields, productOptions, productType,
redirectNewHandle, requiresSellingPlan, seo, status, tags, templateSuffix, title, variants, vendor`
(`id` deprecated — use `identifier`). "Updating `tags` overwrites any existing tags"
([ProductSetInput](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/ProductSetInput)).

```graphql
mutation updateDescription($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product { id title handle }
    userErrors { field message }
  }
}
# variables: { "product": { "id": "gid://shopify/Product/632910392",
#   "descriptionHtml": "<p>New copy</p>", "handle": "new-handle", "redirectNewHandle": true } }
```

### `userErrors`

- The base `UserError` only has `field: [String!]` ("The path to the input field that caused the
  error") and `message: String!` ([UserError](https://shopify.dev/docs/api/admin-graphql/latest/objects/UserError));
  `productUpdate`/`productCreate` return this type — **no `code`**.
- Newer mutations return a named error type with a `code` enum: `ProductSetUserError`
  (36 codes, e.g. `HANDLE_NOT_UNIQUE`, `NOT_FOUND`, `INPUT_MISMATCH`, `VARIANTS_OVER_LIMIT`,
  `JOB_ERROR`, `PRODUCT_SUSPENDED`), `ProductVariantsBulkUpdateUserError` (28 codes),
  `MetafieldsSetUserError` (15 codes), `ProductOptionsCreateUserError` (`OPTION_ALREADY_EXISTS`,
  `OPTIONS_OVER_LIMIT`).
- Two error tiers: `userErrors` are business errors inside the mutation payload; system errors live in
  top-level `errors[n].extensions.code` and HTTP is still `200 OK` ("the GraphQL API can return a
  `200 OK` response code in cases that would typically produce 4xx or 5xx errors in REST")
  ([Admin API reference](https://shopify.dev/docs/api/admin-graphql/latest)).

### Idempotency

- `productSet` with `identifier.handle` or `identifier.customId` (a metafield with a unique
  value) is an **upsert**: a match updates, otherwise creates ([ProductSetIdentifiers](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/ProductSetIdentifiers)).
  Resending the same input for the same handle is effectively idempotent because it declares the target state;
  the docs do **not** state "safe to retry" for `productSet`.
- The official idempotency key mechanism (`@idempotent(key:)`, keeps the key 24 hours,
  `IDEMPOTENCY_CONCURRENT_REQUEST` on a duplicate while processing) currently applies to 17 listed mutations
  (inventory, location, refund…); `productSet`/`productUpdate`/`metafieldsSet` are **not** in
  the list ([idempotent-requests](https://shopify.dev/docs/api/usage/idempotent-requests),
  [implementing-idempotency](https://shopify.dev/docs/api/usage/implementing-idempotency)).

### Synchronous vs job

- `synchronous: false` → returns `ProductSetOperation {id, status: CREATED|ACTIVE|COMPLETE, product,
  userErrors}`; poll with `productOperation(id:)`. Docs: "Setting `synchronous: false` may be
  desirable depending on the input complexity/size, and should be used if you are experiencing
  timeouts" ([ProductSetOperation](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductSetOperation)).
  Errors in the job appear in `productSetOperation.userErrors` with code `JOB_ERROR`.

## (b) Permissions

- **Access scope** per resource type: `read_products` / `write_products` open `Product,
  ProductVariant, Collection, ResourceFeedback`; "Any scope that writes a resource also grants read
  access to it". The app declares `scopes` in `[access_scopes]` of `shopify.app.toml`; "Merchants approve
  the scopes when they install it"; changing scopes requires the merchant to approve again; optional scopes are requested after
  install ([access-scopes](https://shopify.dev/docs/api/usage/access-scopes)).
- **No per-product scope.** Scopes exist only at the resource-type level. The staff side is the same:
  "store permissions apply at the store level… you can't restrict permissions to individual orders,
  products, or customers" ([store-permissions](https://help.shopify.com/en/manual/your-account/users/roles/permissions/store-permissions)).
- **Staff permissions for Products** are split very finely by *action*, not by *record*: View ·
  View cost · Create and edit ("create, edit, import, publish, share, and archive products and
  collections", excluding cost/price) · Edit cost · Edit price · Export · Delete. True read-only
  exists at the staff level (View only).
- **Token**: *offline* (default, lives until the app is uninstalled, used for webhooks/background jobs; an expiring version of 1 hour
  + a 90-day refresh token); *online* (tied to one staff member, expires in 24 hours; `associated_user_scope` =
  "the intersection of your app's scopes and that user's permissions"; missing permission → `ACCESS_DENIED`,
  expired → `401`); *delegate* (derived from offline with narrower permissions for a subsystem)
  ([access-tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens)).
  Every product mutation page states two conditions: scope `write_products` **and** "user must also
  have permission to update products" — i.e. an action through an online token is the intersection of both the app scope
  and the staff permission.
- For themes: `write_themes`, and since Admin API 2023-04 an app distributed through the App Store that wants to write theme files
  needs a **protected access scope exemption** ([REST Asset](https://shopify.dev/docs/api/admin-rest/latest/resources/asset);
  the `themeFilesUpsert` page also says "exemption from Shopify required").

## (c) Concurrency and conflict

- **Products have no optimistic lock.** `Product` has `updatedAt`, `createdAt`, no
  version/ETag/lock field ([Product](https://shopify.dev/docs/api/admin-graphql/latest/objects/Product));
  `ProductUpdateInput`/`ProductSetInput` accept neither `updatedAt` nor `expectedVersion`. Last write
  wins. No conditional header (`If-Match`/`If-Unmodified-Since`) found in REST Product.
- **The only exception: metafields.** `Metafield.compareDigest` ("The data stored in the resource,
  represented as a digest") is passed into `MetafieldsSetInput.compareDigest` (since 2024-07): the write only
  succeeds if the stored value matches the digest; a new metafield sets `null`. Errors `STALE_OBJECT` ("The metafield
  has been modified since it was loaded") and `INVALID_COMPARE_DIGEST`
  ([metafieldsSet](https://shopify.dev/docs/api/admin-graphql/latest/mutations/metafieldsSet),
  [MetafieldsSetUserErrorCode](https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldsSetUserErrorCode)).
  This is compare-and-set per **slot**, not per product.
- **Cost-based rate limit**: 100 points/second Standard, 200 Advanced, 1,000 Plus, 2,000 Commerce
  Components (figures on the page on 25/09/2026); leaky bucket; mutation = 10 points; one query at most
  1,000 points (`MAX_COST_EXCEEDED`); the response carries `extensions.cost { requestedQueryCost,
  actualQueryCost, throttleStatus { maximumAvailable, currentlyAvailable, restoreRate } }`; exceeded →
  `THROTTLED` in `errors[n].extensions.code` with HTTP 200
  ([rate-limits](https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits),
  [Admin API reference](https://shopify.dev/docs/api/admin-graphql/latest)). REST: a bucket of 40
  requests/app/store, leaking 2/second (Plus ×10), header `X-Shopify-Shop-Api-Call-Limit: 32/40`, 429 +
  `Retry-After` ([REST rate limits](https://shopify.dev/docs/api/admin-rest/usage/rate-limits)).
- **Large writes**: `bulkOperationRunMutation` accepts any mutation (except the two bulk mutations, to
  avoid recursion) limited to one connection field, variables passed through a JSONL file (uploaded via
  `stagedUploadsCreate`, at most 100 MB), must finish within 24 hours; since `2026-01` an app can run 5
  bulk mutations/shop at once (previously 1); the result is JSONL with a separate `userErrors` per line; tracked
  via the `bulk_operations/finish` webhook or by polling ([bulk imports](https://shopify.dev/docs/api/usage/bulk-operations/imports)).

## (d) Undo and history

- **No version history / undo for products.** The `events` query (`BasicEvent`/`CommentEvent`)
  returns `message`, `action`, `subjectType`, `createdAt`, `attributeToApp`/`attributeToUser`, kept 1 year;
  it is an append-only human-readable journal, **without** old/new values, no diff, no revert
  ([events](https://shopify.dev/docs/api/admin-graphql/latest/queries/events)). `Product.events` is
  a connection of the same kind.
- In the admin: **Timeline** exists only for "orders, draft orders, customers, and transfers", not
  for products ([Timeline](https://help.shopify.com/en/manual/shopify-admin/productivity-tools/timeline));
  the **Store activity log** records which person/app did what, "view-only", at most 250 rows, not stating whether before/after
  values are shown ([activity logs](https://help.shopify.com/en/manual/shopify-admin/activity-logs)).
- **Shopify Flow** has a "Product status updated" trigger (when a user or app changes the status)
  ([Flow trigger](https://help.shopify.com/en/manual/shopify-flow/reference/triggers/product-status-updated));
  **unconfirmed** whether there is a general "Product updated" trigger — only community discussions saying there is not.
- **Webhook `products/update`**: "Shopify doesn't guarantee ordering within a topic, or across
  different topics for the same resource… it's possible that a `products/update` webhook might be
  delivered before a `products/create` webhook"; recommends ordering by `X-Shopify-Triggered-At` or
  `updated_at` in the payload; "Webhook delivery isn't always guaranteed"
  ([about webhooks](https://shopify.dev/docs/apps/build/webhooks)). That is, the consumer builds its own history
  by storing payloads; Shopify does not keep it for them.
- **Compared with ADR 0021 §6:** a platform with millions of merchants also does not build undo for products; it
  provides (1) mutations that declare the target state so that writing the old version back is one way to "undo", (2) events
  + webhooks for outsiders to store things themselves. The PO's decision "build no new undo/journal, keep the native mechanism"
  stands on the same side as Shopify. The difference: Tracy has native revisions/receipts in the Joomla/WP Claude Cowork plugin, which
  Shopify does not; §6 says keep them and only regression-check them.

## (e) The read/write boundary on the same ID

- `Product.id` is `gid://shopify/Product/<number>`; `legacyResourceId` is "The ID of the corresponding
  resource in the REST Admin API"; REST returns both the numeric `id` and `admin_graphql_api_id`
  (`"gid://shopify/Product/632910392"`). Variants likewise: `gid://shopify/ProductVariant/<number>` +
  `legacyResourceId` ([Product](https://shopify.dev/docs/api/admin-graphql/latest/objects/Product),
  [ProductVariant](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductVariant),
  [REST Product](https://shopify.dev/docs/api/admin-rest/latest/resources/product)).
- Public read door: the Ajax API `GET /{locale}/products/{handle}.js` needs no token, returns the numeric `id` and
  numeric `variants[].id`, at most 250 variants in the array ([Ajax Product](https://shopify.dev/docs/api/ajax/reference/product)).
  This numeric `id` is exactly `legacyResourceId`, so public read → Admin API write use the **same identity**,
  differing only in the wrapping (`gid://…/<id>`). **Unconfirmed on shopify.dev**: the `/products.json` endpoint
  listing the whole shop (used by many) has no official documentation page found; only Ajax
  `/products/<handle>.js` and Storefront GraphQL have docs.
- `handle` can change ("A unique, human-readable string that's used to identify the product in
  URLs"); `id` cannot. `redirectNewHandle: true` → "the old handle is redirected to the new one
  automatically" ([ProductUpdateInput](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/ProductUpdateInput)).
  The Help Center warns "don't edit it too often or the product might not display in search engine
  results" ([add-update-products](https://help.shopify.com/en/manual/products/add-update-products)).
- **Metafield `namespace.key` is a named slot**: read with `metafield(namespace:, key:)`, written with
  `metafieldsSet {ownerId, namespace, key, type, value}`; `value` is "Always stored as a string,
  regardless of the metafield's type" ([Metafield](https://shopify.dev/docs/api/admin-graphql/latest/objects/Metafield)).
  This is the model closest to Tracy's `slotKey`: read key = write key, and (unlike Tracy v1) each slot
  carries its own digest for CAS.
- `productSet.identifier.customId` allows upserting by a unique-value metafield (the external ID
  of the source system) — Shopify treats the external system as the "authoritative external database" and itself as
  downstream ([sync-data](https://shopify.dev/docs/apps/build/product-merchandising/products-and-collections/sync-data)).

## (f) Content structure when writing — data vs presentation

- **Product data (Admin API) is flat.** `descriptionHtml` of type `HTML`: "The description of the
  product, with HTML tags. For example, the description might include bold `<strong></strong>` and
  italic `<i></i>` text" — there is no block-level write; whoever wants structure puts content into
  a metafield of type `rich_text_field` (JSON root/paragraph/text), `json`, `single_line_text_field`,
  `multi_line_text_field` ([data types](https://shopify.dev/docs/apps/build/custom-data/metafields/list-of-data-types)).
  The product keeps only one presentation pointer: `templateSuffix` ("The theme template that's used when
  customers view the product").
- **Presentation (theme) is schema-backed JSON.** Online Store 2.0: `templates/product.json` contains
  `sections` (each section: `type`, `disabled`, `settings`, `blocks`, `block_order`) + `order` +
  `layout`; "JSON templates can render up to 25 sections, and each section can have up to 50
  blocks"; "Merchants can add, remove, and reorder these sections using the theme editor"
  ([json-templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates)).
  `config/settings_data.json` holds `current` (the values saved in the theme editor) and `presets`, at
  most 1.5 MB ([settings_data.json](https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json)).
- **The presentation write door is files**: `themeFilesUpsert(themeId, files:[{filename, body:{type:
  TEXT|BASE64|URL, value}}])`, at most 50 files per run, returns `upsertedThemeFiles`, `job`, `userErrors`;
  needs `write_themes` and an exemption for public apps ([themeFilesUpsert](https://shopify.dev/docs/api/admin-graphql/latest/mutations/themeFilesUpsert)).
  This overwrites the whole JSON file; there is **no** "edit one setting of one section" mutation. Shopify pushes
  apps toward **theme app extensions** ("don't edit theme code, which decreases the risk of introducing
  breaking changes") ([theme-app-extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions)).
- **Comparison:** Shopify separates *product data* (an API with scopes, per-field `userErrors`,
  metafield CAS) from *presentation* (theme files, separate permissions, needs an exemption, no lock). Tracy
  separates *content slots* (apply via the Claude Cowork plugin, revision, character limits, markup forbidden) from the
  *presentation-lock* (template sealed, the agent may not touch it). Same shape, but Tracy puts
  section/block settings on **the locked side** (presentation-lock), whereas Shopify lets merchants edit them
  freely in the theme editor and only blocks *public apps*. Tracy v1 currently only allows writing *text scalars* into
  slots ("Markup and control characters are not content", `site.mjs:1513`) — narrower than
  `descriptionHtml` but equivalent to a `single_line_text_field`/`multi_line_text_field`.

## (g) Server-side validation

| Shopify refuses | How it reports | Source |
|---|---|---|
| Duplicate handle | `ProductSetUserError.code = HANDLE_NOT_UNIQUE`, "Handle already in use. Please provide a new handle." | [ProductSetUserErrorCode](https://shopify.dev/docs/api/admin-graphql/latest/enums/ProductSetUserErrorCode) |
| Negative price | `NEGATIVE_PRICE_VALUE` "Price cannot take a negative value." / `GREATER_THAN_OR_EQUAL_TO` | [ProductVariantsBulkUpdateUserErrorCode](https://shopify.dev/docs/api/admin-graphql/latest/enums/ProductVariantsBulkUpdateUserErrorCode) |
| Too long/short | `TOO_LONG`, `TOO_SHORT`, `OPTION_VALUE_NAME_TOO_LONG` (variant) · `TOO_LONG` (metafield) | the same two enums above and MetafieldsSetUserErrorCode |
| Over a ceiling | `VARIANTS_OVER_LIMIT`, `OPTIONS_OVER_LIMIT`, `OPTION_VALUES_OVER_LIMIT`, `INVENTORY_QUANTITIES_LIMIT_EXCEEDED` (50,000) | ProductSetUserErrorCode |
| Identifier mismatches input | `INPUT_MISMATCH` "The identifier value does not match…", `ID_NOT_ALLOWED`, `MISSING_FIELD_REQUIRED` | ProductSetUserErrorCode |
| Does not exist | `NOT_FOUND`, `PRODUCT_DOES_NOT_EXIST`, `PRODUCT_VARIANT_DOES_NOT_EXIST`, `OPTION_DOES_NOT_EXIST` | ProductSetUserErrorCode |
| Editing while suspended | `PRODUCT_SUSPENDED` | ProductSetUserErrorCode |
| Stale metafield / wrong type | `STALE_OBJECT`, `INVALID_COMPARE_DIGEST`, `INVALID_TYPE`, `INVALID_VALUE`, `CAPABILITY_VIOLATION` | MetafieldsSetUserErrorCode |
| Blank title (REST) | `{"errors":{"title":["can't be blank"]}}` | [REST Product](https://shopify.dev/docs/api/admin-rest/latest/resources/product) |

- Limits with stated numbers: 250 tags/product, each tag ≤ 255 characters; ≤ 3 options, each option value ≤ 255
  characters; 2,048 variants/product (default). **No** docs found stating length ceilings for `title`,
  `descriptionHtml`, `vendor`, `productType`; the Help Center only says SEO truncates after 70 characters of title / 320
  characters of description ([add-update-products](https://help.shopify.com/en/manual/products/add-update-products)).
- **Duplicate SKUs are NOT refused**: only a warning shows in Inventory ("If a duplicate SKU is
  detected, then a warning message displays…"); only SFN requires uniqueness
  ([SKU](https://help.shopify.com/en/manual/products/details/sku)).
- Per-field errors: `userErrors[].field` is a path into the input (e.g. `["input","variants","0",
  "price"]`), so a batch with many elements still points to which element is wrong. With `productSet` and
  `metafieldsSet`, one error means the whole batch is not written; `productVariantsBulkUpdate` has the
  `allowPartialUpdates` switch.
- **Compared with Tracy:** Tracy's Claude Cowork plugin returns text messages (e.g. "Content too long", "Unknown content
  slot or non-string value", "Content cannot remove an occupied slot") and `refusalNext` **regexes the
  message** to generate the next step (`site.mjs:1497-1533`); stable machine codes exist only at the
  tracy-web level (`ACTION_NOT_ALLOWED`, `SITE_BUSY`, `IDEMPOTENCY_CONFLICT`, `NO_SEAT`,
  `TOOLSET_NOT_GRANTED`… in `route.js`), not at the slot level. Shopify has a documented `code` enum
  **and** a `field` pointing at exactly the input element; Tracy has `next` (a guidance sentence), which Shopify does not.

## Lessons for Tracy's v2 write path

Each line: what Shopify does → what Tracy v1 does → the option for v2 with its trade-off. Does not decide on behalf of the PO.

1. **Read key = write key, named.** Shopify: metafield `namespace.key` is a slot read and written under the same name;
   the product `gid` is durable, `handle` can change. → v1: the `slotKey` from `content.read`/inspect is exactly the key
   of `changes`; the opaque ID is durable across slug changes (ADR 0021 §3.4). → v2: keep; add the guarantee "every
   non-null `fields[].slotKey` in the read envelope can be applied with the key as-is" as a shared conformance
   test. Trade-off: an adapter without a write target yet must return `slotKey: null` instead of a "plausible-looking"
   key — in the spirit of §3.4, but WordPress/EmDash will expose more nulls.

2. **Compare-and-set per slot instead of per site.** Shopify: `compareDigest` per metafield;
   products have no lock. → v1: one `expected_revision` for the whole apply; a change anywhere means "Content
   changed; inspect again" (`site.mjs:1507`). → v2: could add a `revision` **per content/slot**
   (the read envelope already has `contents[].revision`) and let apply send a per-content `expected_revision`;
   an agent editing the footer is not blocked because someone just edited another page. Trade-off: the Claude Cowork plugin must compute
   per-entity fingerprints (Joomla P2 already has a broad fingerprint), and the guarantee "one apply = one
   whole-site snapshot" that the presentation-lock relies on is lost — the PO needs to choose.

3. **Declare the target state, not a "diff".** Shopify: `productSet` is a "complete product
   state declaration"; list fields are replaced entirely, omitted scalars are kept. → v1: `changes` is a map of
   scalars, unmentioned slots are kept; no list semantics. → v2 for repeaters (`items[]`): choose
   one of two clearly — *declarative* (send the whole list, missing = delete, like Shopify) or *op-based*
   (add/remove/move by `itemId`). Declarative is easy to reason about and idempotent but the agent must read the full
   list first; op-based uses fewer bytes but needs durable item keys (P2 says repeaters are still unresolved).

4. **Idempotency with its own name, time-limited.** Shopify: `@idempotent(key:)` for 17 mutations,
   kept 24 hours, `IDEMPOTENCY_CONCURRENT_REQUEST`; `productSet` does not have it yet. → v1: `request_id` is a
   deterministic hash of `[changes, evidence, expected_revision]` (`normalize.mjs:341`), the component returns
   the old result. → v2: keep, but **write into the spec** the Claude Cowork plugin's `request_id` retention window and the code for
   a duplicate while running (currently `SITE_BUSY`/`IDEMPOTENCY_CONFLICT` in tracy-web). Trade-off: declaring a TTL is
   a commitment the Claude Cowork plugin must keep; without it, an agent retrying after a few hours may apply a second time.

5. **Enum error codes + a `field` pointing at the element, separate from system errors.** Shopify: `userErrors {field,
   message, code}` in the payload, `errors[].extensions.code` for THROTTLED/ACCESS_DENIED. → v1: machine
   codes only in tracy-web; slot errors are text, `refusalNext` regexes the message. → v2: propose that the Claude Cowork plugin
   return `{code, field: {contentId, blockId, itemId, key}, message}` for slot errors (same shape as
   the 413's `error.field` in the read spec) and `refusalNext` switches on `code`; keep
   `next` as the strength Tracy has and Shopify does not. Trade-off: changes the Claude Cowork plugin contract for three CMSes (upstream
   owner, ADR 0021 §3.8) and the old regex must be kept for old Claude Cowork plugins during the transition.

6. **One batch, one atomic decision — with a partial switch.** Shopify: `metafieldsSet` and
   `productSet` are all-or-nothing; `productVariantsBulkUpdate` has `allowPartialUpdates`. → v1: 1–1,500
   slots in one apply, a transaction in the Claude Cowork plugin (all-or-nothing). → v2: keep atomic as the default; if
   partial is added it must return **the list of slots written** so the agent re-reads the right part. Trade-off:
   partial makes "read → write → read again" harder to accept (half already changed revision).

7. **Large writes take the job path, not the request path.** Shopify: `synchronous:false` + poll
   `productOperation`; `bulkOperationRunMutation` + JSONL, 5 parallel jobs/shop since 2026-01. → v1:
   synchronous apply; `SITE_BUSY` on a duplicate. → v2: if the Content API must write hundreds of contents (translating a whole
   site), consider `apply` returning an `operationId` + `apply.list`/poll instead of holding HTTP open. Trade-off:
   adds job state to the Claude Cowork plugin, and the ADR's §7 I/O measurement must add the cost of polling.

8. **Do not build undo — provide events for outsiders to store themselves.** Shopify: no product version history;
   `events` 1 year append-only without diff; the `products/update` webhook does not guarantee order,
   dedupe by `updated_at`. → v1/§6: the PO decided to build no new undo/journal; keep native revert, only
   regression-check. → v2: keep §6 as is. What Shopify suggests that Tracy does not have yet: a "content
   changed" event with `updatedAt`/`revision` so consumers (e.g. the Content API cache §3.1) invalidate themselves.
   Trade-off: it is a notification hook, not a journal; no ordering promise, like Shopify.

9. **Permissions per action, not per record; write ⊇ read.** Shopify: scopes per resource
   type; staff have View/Create-and-edit/Edit price/Delete; online token = the intersection of the app scope and
   staff permission; nothing per-product. → v1: the `code` policy per seat (owner/admin/developer),
   editors get 403 even for reads, no editorial. → v2: when the PO opens editorial, a "seat × action" model
   (read published / read draft / write content / write presentation) matches Shopify better than permissions
   by content ID. Trade-off: simple for the relay and the cursor, but does not meet a "may only edit
   page X" request if a customer asks — Shopify does not meet it either.

10. **Data and presentation are two doors, two permissions, two lifecycles.** Shopify: `descriptionHtml`
    is flat through the Admin API; section/block settings live in `templates/*.json` written with
    `themeFilesUpsert`, needing `write_themes` + an exemption. → v1: text slots through the Claude Cowork plugin;
    the presentation-lock seals the template. → v2: continue **not** opening a presentation write door in the
    Content API; if "reorder sections" is needed later, that is another door with other permissions, as Shopify
    separates themes from products. Trade-off: the agent must say "can't do it" (principle 3 of CLAUDE.md)
    instead of working around it.

11. **A changeable handle must come with a redirect in the same write.** Shopify: `redirectNewHandle:
    true` creates a redirect automatically. → v1: changing the slug keeps the ID (ADR §7) but the spec says nothing about redirects.
    → v2: if `slug` becomes a writable slot, apply should accept `redirectOldSlug` (default `true`) and the
    Claude Cowork plugin creates a native redirect (Joomla/WP both have the mechanism). Trade-off: adds a side effect outside the slot,
    which must be checked when reading again.

12. **Limits must be documented numbers, errors must state the threshold.** Shopify: 25 metafields per run, 50
    files per run, 2,048 variants, 255 characters/tag, 100 MB JSONL; but no ceiling stated for `title`. → v1:
    1–1,500 slots/apply, `maxCharacters` per slot read via inspect, "Content too long" states no number.
    → v2: every refusal due to a limit carries `limit` and `actual` in the error (as the read spec already does with 413).
    Trade-off: small; the Claude Cowork plugin only needs to put the numbers it already has into the payload.

## Unconfirmed points (so readers do not cite them by mistake)

- The verbatim content of the two changelogs 2024-04 / 2024-10 about the product model (pages 404 when loaded).
- Whether a public `/products.json` endpoint listing the whole shop exists in the official documentation.
- Whether Flow has a general "Product updated" trigger (only "Product status updated" found).
- Length ceilings for `title`/`descriptionHtml` — the docs state no numbers.
- The "at-least-once" semantics of webhooks — the about-webhooks page only says "delivery isn't always
  guaranteed" and ordering is not guaranteed.

## Shopify sources (primary sources only, read 25/09/2026)

- <https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet>
- <https://shopify.dev/docs/api/admin-graphql/latest/input-objects/ProductSetInput>
- <https://shopify.dev/docs/api/admin-graphql/latest/input-objects/ProductSetIdentifiers>
- <https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductSetOperation>
- <https://shopify.dev/docs/api/admin-graphql/latest/queries/productOperation>
- <https://shopify.dev/docs/api/admin-graphql/latest/enums/ProductSetUserErrorCode>
- <https://shopify.dev/docs/api/admin-graphql/latest/mutations/productUpdate>
- <https://shopify.dev/docs/api/admin-graphql/latest/input-objects/ProductUpdateInput>
- <https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate>
- <https://shopify.dev/docs/api/admin-graphql/latest/mutations/productVariantsBulkUpdate>
- <https://shopify.dev/docs/api/admin-graphql/latest/enums/ProductVariantsBulkUpdateUserErrorCode>
- <https://shopify.dev/docs/api/admin-graphql/latest/mutations/productOptionsCreate>
- <https://shopify.dev/docs/api/admin-graphql/latest/mutations/metafieldsSet>
- <https://shopify.dev/docs/api/admin-graphql/latest/enums/MetafieldsSetUserErrorCode>
- <https://shopify.dev/docs/api/admin-graphql/latest/objects/Metafield>
- <https://shopify.dev/docs/api/admin-graphql/latest/mutations/productChangeStatus>
- <https://shopify.dev/docs/api/admin-graphql/latest/mutations/publishablePublish>
- <https://shopify.dev/docs/api/admin-graphql/latest/objects/UserError>
- <https://shopify.dev/docs/api/admin-graphql/latest/objects/Product>
- <https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductVariant>
- <https://shopify.dev/docs/api/admin-graphql/latest/queries/events>
- <https://shopify.dev/docs/api/admin-graphql/latest>
- <https://shopify.dev/docs/api/admin-rest/latest/resources/product>
- <https://shopify.dev/docs/api/admin-rest/latest/resources/product-variant>
- <https://shopify.dev/docs/api/admin-rest/latest/resources/asset>
- <https://shopify.dev/docs/api/admin-rest/usage/rate-limits>
- <https://shopify.dev/docs/api/admin/migrate/new-product-model>
- <https://shopify.dev/docs/apps/build/product-merchandising/products-and-collections/sync-data>
- <https://shopify.dev/docs/api/usage/access-scopes>
- <https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens>
- <https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits>
- <https://shopify.dev/docs/api/usage/bulk-operations/imports>
- <https://shopify.dev/docs/api/usage/idempotent-requests>
- <https://shopify.dev/docs/api/usage/implementing-idempotency>
- <https://shopify.dev/docs/apps/build/webhooks>
- <https://shopify.dev/docs/api/admin-graphql/latest/mutations/themeFilesUpsert>
- <https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates>
- <https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json>
- <https://shopify.dev/docs/apps/build/online-store/theme-app-extensions>
- <https://shopify.dev/docs/apps/build/custom-data/metafields/list-of-data-types>
- <https://shopify.dev/docs/api/ajax/reference/product>
- <https://shopify.dev/changelog/the-product-variant-limit-is-now-2048-for-all-merchants>
- <https://help.shopify.com/en/manual/your-account/users/roles/permissions/store-permissions>
- <https://help.shopify.com/en/manual/products/details/sku>
- <https://help.shopify.com/en/manual/products/add-update-products>
- <https://help.shopify.com/en/manual/shopify-admin/activity-logs>
- <https://help.shopify.com/en/manual/shopify-admin/productivity-tools/timeline>
- <https://help.shopify.com/en/manual/shopify-flow/reference/triggers/product-status-updated>
