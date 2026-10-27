---
description: How Shopify brings AI agents into editing products in the admin (Sidekick, Shopify Magic, Claude/ChatGPT connectors, the official MCP servers, UCP) — compared with the `tracy_site` tool (content.read / content.contract) to supplement the Content API v2 plan.
sources:
  - packages/tools/tracy-site-tools/src/host/surface.mjs
  - packages/tools/tracy-site-tools/src/host/site.mjs
  - docs/adr/0021-one-content-api-for-three-cms.md
  - tasks/todo-content-api-tich-hop.md
links:
  - https://help.shopify.com/en/manual/shopify-admin/productivity-tools/sidekick
  - https://help.shopify.com/en/manual/shopify-admin/productivity-tools/sidekick/help-and-guidance
  - https://help.shopify.com/en/manual/shopify-admin/productivity-tools/sidekick/generate-content
  - https://help.shopify.com/en/manual/shopify-admin/productivity-tools/sidekick/set-up
  - https://help.shopify.com/en/manual/shopify-admin/productivity-tools/sidekick/skills
  - https://help.shopify.com/en/manual/shopify-admin/productivity-tools/shopify-magic
  - https://help.shopify.com/en/manual/products/details/product-descriptions/shopify-magic
  - https://help.shopify.com/en/manual/ai-powered-tools/connecting-ai-tools
  - https://help.shopify.com/en/manual/ai-powered-tools/connecting-ai-tools/authorizing-access
  - https://help.shopify.com/en/manual/ai-powered-tools/connecting-ai-tools/considerations
  - https://help.shopify.com/en/manual/ai-powered-tools/connecting-ai-tools/shopify-connector-for-claude
  - https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts
  - https://help.shopify.com/en/manual/online-sales-channels/agentic-storefronts/products
  - https://changelog.shopify.com/posts/create-customers-and-companies-with-sidekick
  - https://changelog.shopify.com/posts/a-new-home-for-agentic-storefronts-in-your-admin
  - https://shopify.engineering/building-production-ready-agentic-systems
  - https://shopify.engineering/sidekick-curation
  - https://shopify.engineering/sidekicks-continual-learning-loop
  - https://shopify.engineering/sidekicks-improved-streaming
  - https://shopify.engineering/fine-tuning-agent-shopify-flow
  - https://shopify.engineering/ucp
  - https://shopify.dev/docs/apps/build/sidekick
  - https://shopify.dev/docs/apps/build/sidekick/build-app-actions
  - https://shopify.dev/docs/apps/build/sidekick/build-app-data
  - https://shopify.dev/changelog/sidekick-app-extensions-available-today
  - https://shopify.dev/docs/apps/build/ai-toolkit
  - https://shopify.dev/docs/apps/build/devmcp
  - https://shopify.dev/changelog/mcp-server-for-the-shopify-dev-assistant
  - https://github.com/Shopify/shopify-ai-toolkit
  - https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront
  - https://shopify.dev/changelog/storefront-mcp-cart-tools-are-being-deprecated-in-favour-of-ucp-cart-mcp
  - https://shopify.dev/docs/apps/build/storefront-mcp/servers/customer-account
  - https://shopify.dev/docs/agents
  - https://shopify.dev/docs/agents/catalog
  - https://shopify.dev/docs/agents/catalog/storefront-catalog
  - https://shopify.dev/docs/agents/carts-and-checkout
  - https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp
  - https://shopify.dev/docs/agents/checkout
  - https://shopify.dev/docs/agents/orders/order-mcp
  - https://shopify.dev/docs/agents/profiles
  - https://shopify.dev/docs/agents/profiles/auth-and-rate-limiting
  - https://shopify.dev/docs/agents/get-started/profile
  - https://shopify.dev/docs/api/web-mcp
  - https://shopify.dev/docs/apps/build/graphql/basics/mutations
  - https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet
  - https://www.shopify.com/news/ai-commerce-at-scale
  - https://www.shopify.com/news/spring-26-edition-dev
---

# How Shopify brings agents into editing products — comparison for Tracy's Content API v2

Researched on 25/09/2026, from Shopify's primary sources only (help.shopify.com, shopify.dev,
shopify.engineering, changelog, github.com/Shopify, shopify.com/news). Every claim has a URL in
`links:` above and is cited again in place; anything not found in a primary source is marked
**unconfirmed**. The Tracy side was read on `origin/develop` (`surface.mjs`, `site.mjs`, ADR 0021,
`tasks/todo-content-api-tich-hop.md`); nothing was re-measured in this run.

`sources:` in the frontmatter is the Tracy code being compared (the `doc-frontmatter` gate only accepts paths
that exist in the repo); the Shopify URLs are in `links:`.

## 0. One-page summary

- Shopify has **three doors** for agents, with clear boundaries: (1) **Sidekick** in the admin — can write, but
  *never writes by itself*: it fills in the form, highlights filled slots in purple, and a person clicks Save; (2) **the
  Claude/ChatGPT/Perplexity connectors** — an Admin API write door for external agents, going through
  read/write authorization and bounded by the permissions of the user who is chatting; (3) **UCP / Catalog / Cart / Checkout
  MCP** for shopping agents — they only read the published catalog and create carts/checkouts, **no tool
  edits store data**.
- **There is no public "Admin MCP"** through which any agent can write into the admin. The named write doors are the connectors
  (installed from the Claude/ChatGPT side, access level approved in the admin) and Shopify CLI's "store execute"
  in the AI Toolkit (the person chooses when to run). Both are "an agent writes on a person's behalf, within a scope the person approved"
  — not an open MCP.
- On **tool design**: Shopify Engineering states the numbers plainly — 0–20 tools have clear boundaries, 20–50
  start to blur, 50+ means "multiple paths to one task" and becomes unmaintainable; and their solution is
  **JIT instructions** (guidance returned together with the tool's data, not stuffed into the system prompt).
  For third-party apps, the budget is **20 tools/app, tool description 512 characters, extension description 256 tokens,
  instructions 2,048 tokens, responses ≤ 4,000 tokens and ≤ 1 s**.
- On **errors**: Admin GraphQL returns `userErrors {field, message, code}` inside a 200 OK; UCP's MCP separates
  *transport* errors (JSON-RPC `-32000`) from the *business outcome* (`messages[] {code, content,
  severity: recoverable|unrecoverable}`) and requires the agent to "always check `messages` before reading
  order fields".
- Tracy v1 is already heading the right way in three places (one `tracy_site` tool with an `action` enum; `refusalNext` turns
  refusal codes into the next step; `content.read` is a map pointing to the write door through `slotKey`).
  What Shopify has and Tracy does not yet: **confirmation before writing at the UI level**, **a token-based output
  budget**, **`severity` on errors**, **progressive disclosure** (summary first, details on
  selection), and **JIT instructions that travel with the data** instead of long tool descriptions.

## 1. Sidekick — the agent inside the admin (question a)

### 1.1 What it can do with products

The help page "Getting help and guidance from Sidekick" lists: filling forms to **create/edit products,
discounts, collections, customers, companies (B2B), draft orders**; editing existing orders (adding products,
changing quantities, discounts, shipping fees); SEO suggestions; suggesting and applying **theme setting** changes; generating
ShopifyQL, charts, exporting reports; moving Shopify Balance funds; suggesting and installing apps
(`help-and-guidance`). The 10/02/2026 changelog confirms "Sidekick can now create customers and
companies … fills out the forms automatically" (`create-customers-and-companies-with-sidekick`).

Write limits in primary sources: "Sidekick can't make edits to images within a store theme or your
product list" (`sidekick`). **Bulk editing products through Sidekick: unconfirmed** — the help page
says "editing products" but does not mention bulk edits; the metafield bulk editor is a separate admin
feature, not Sidekick. **Editing metafields through Sidekick: unconfirmed.**

### 1.2 Confirm · preview · undo · audit

- **Confirmation is a rule, not an option:** "Sidekick can't make changes to your store without
  your approval, and will only present options for you to review and approve" (`set-up`);
  "presents changes for your review before applying them" (`sidekick`).
- **Preview = filling the form + colour highlighting:** "Fields that Sidekick updates are highlighted in purple so you
  can review the changes before you update the order" — "The order updates only after you review
  the changes and click **Update order**" (`help-and-guidance`). For generated content: "the field
  is highlighted in purple so you can identify and review the fields where Sidekick has added
  content"; "You should always review the changes before accepting" (`generate-content`). Themes:
  the person must "manually save". Money transfers: there is a **Preview** button before sending.
- **Third-party apps:** "Before Sidekick uses an installed app, it asks for your approval"
  (`help-and-guidance`).
- **Sidekick-specific undo: unconfirmed.** The "fill the form, the person saves" model makes undo
  the form's/admin's own undo, not the agent's.
- **Audit "Sidekick did X": unconfirmed.** No page in the primary sources talks about a log of
  Sidekick's actions.

### 1.3 Permissions

Sidekick runs in the session of the signed-in staff member. Primary sources only speak per feature: generating apps
requires the "App development > Develop" permission (`generate-apps`, seen through help center search results);
Sidekick "can't share private information or data from other Shopify merchants with you"
(`set-up`). **The statement "Sidekick acts with exactly the staff member's permissions": not confirmed
by a verbatim sentence** — but for external connectors, Shopify says so explicitly (section 2.4).

### 1.4 Published architecture (Shopify Engineering)

*Building production-ready agentic systems: Lessons from Shopify Sidekick* (2025):

- Sidekick is an **agentic loop** (person → LLM decides an action → runs it → feedback → repeat).
- **The number of tools is a measurable problem:** "0–20 tools: clear boundaries, easy debugging; 20–50: unclear
  boundaries, unexpected tool combinations; 50+: multiple paths to accomplish tasks, system becomes
  unmaintainable". The consequence is "Death by a Thousand Instructions": the system prompt becomes a pile of exceptions
  and lowers quality.
- **The solution: Just-in-Time (JIT) instructions** — relevant guidance **is returned together with the tool's
  data**, right when needed, instead of living in the system prompt. Three benefits they name: localised guidance;
  does not break the LLM cache; can be switched on/off by beta flag or model version. Result "performance improved
  across all metrics".
- **Eval:** dropped the curated "golden dataset", using **Ground Truth Sets** drawn from the production distribution,
  labelled by ≥ 3 experts; the LLM judge is calibrated to Cohen's Kappa 0.61 (human–human 0.69);
  test: randomly replace the judge with a human — if indistinguishable, it passes.
- **Reward hacking during GRPO training:** the model "opted out" (explained it could not do something instead of doing it),
  stuffed everything into customer tags, invented ids/enums. After the fixes: syntax validation 93 % → 99 %,
  judge correlation 0.66 → 0.75.
- Recommendations: "Stay simple" — tool quality over quantity; modularise from the start; **avoid
  multi-agent early**; combine procedural and semantic checks for reward.

*Sidekick's Improved Streaming Experience*: they call tools **"cards"** because the LLM writes according to how the
content will be presented; a tool call is a Markdown link labelled `[Configure X]` with target
`card:configure-x` (the `card:` protocol), and the backend
merges several streams over SSE; observation: "Markdown, as a means of transporting structure, beats JSON
and YAML in token counts".

*Teaching Sidekick to say no* (2026): production logs only record successful turns, so the model could not learn
to **refuse** impossible requests (e.g. filtering by data Shopify does not store) and returned queries with
0 results instead of saying no. They use 4 LLM judges, requiring agreement on both the decision and the reason, and split refusals
into **4 mutually exclusive types: solvable with more context · missing capability · wrong skill (route
elsewhere) · ambiguous (needs clarification)**. Result: refusal accuracy 86.3 %, false positives
4.6 %; skill segmentation score 0.619 → 0.798.

*Sidekick's continual learning loop* (2026): quality rubric (completeness, execution, response
quality, safety); judge calibrated against old A/B tests; **system prompt compressed from ~6,000 to ~1,500 tokens
by gisting**; cost down 96 %; TTFT −19 %, latency −38 %; up to 2,000 requests/minute.

*Flow generation through natural language* (2026, an agent that generates Shopify Flows): **progressive
tool-calling** — `task_search` returns names + descriptions from hundreds of triggers/conditions/actions, the model picks
2–3, and only then does `task_configuration` return the full schema for exactly those picked; syntax is checked
by machine (a JSON⇄Python round-trip transpiler); the lesson "representation matters": small mismatches between
training and production (tool names, key order, order of returned fields) reduce accuracy
with no clear sign; "benchmark parity masks a 35 % gap once real users show up".

### 1.5 Sidekick app extensions — published tool budget (17/06/2026)

This is where Shopify **writes down the numbers** for tools their LLM will call (`apps/build/sidekick`,
`build-app-data`, `build-app-actions`, changelog `sidekick-app-extensions-available-today`):

| Limit | Value |
|---|---|
| Tools per app (all extensions) | 20 |
| Intents (actions) per app | 5 |
| Tool name | ≤ 64 characters |
| Tool description | ≤ 512 characters |
| Extension description / extension summary | ≤ 256 tokens |
| `instructions.md` (when to use, common flows) | ≤ 2,048 tokens |
| Data tool response | ≤ 4,000 tokens, within 1 s (actions: 3 s) — beyond that Sidekick "may skip" |
| Apps per user per store | 20 |

Accompanying rules: descriptions must be "specific about what your extension does and what data it covers";
with a generic description that "could apply to any app" the tool is not called reliably; results should be
**Resource Links with a summary `_meta`** instead of a full nested structure, to save tokens; cursor pagination
(`after/before/first/last`); "Existing MCP servers can't be reused directly with Sidekick"
because tools must run in Shopify's sandbox with Shopify's authentication; data returned by a tool "is
checked before it's used in the conversation".

**App actions do not write:** "Sidekick takes the merchant to the right page in your app", a tool on
the destination page can *stage* changes into the form, but "the merchant clicks **Save** themselves;
Sidekick never commits silently". Intent schemas **may not declare `required`** — every input is optional
at call time (tool schemas may).

### 1.6 Shopify Magic

A set of free AI features embedded in place (product descriptions, email subjects, blogs, pages, theme blocks,
backgrounds/logos/banners, segment descriptions, review summaries…). For product descriptions: click the icon in the description slot,
type a prompt, "the generated text is applied directly to the product description" — but still in an
unsaved form, and "You're responsible for the accuracy of all of the content that you publish";
generated text "can include things such as product benefits even when you didn't list any"
(`product-descriptions/shopify-magic`, `shopify-magic`). Magic is **an in-slot suggestion**, not an
agent with tools.

## 2. The official MCP servers (question b)

### 2.1 `@shopify/dev-mcp` — docs and schema for agents writing code

Announced 31/03/2025 (`changelog/mcp-server-for-the-shopify-dev-assistant`): "search our docs,
introspect API schemas, and get up-to-date answers about Shopify APIs"; runs locally, needs no
authentication (`apps/build/devmcp`). Tools named in the shopify.dev documentation (via the search index):
`learn_shopify_api` ("Always call this tool first … generates a conversation ID"),
`search_docs_chunks`, `fetch_full_docs`, `introspect_graphql_schema`, `validate_graphql_codeblocks`
("ensure it doesn't contain fields or operations that don't exist"). **The full list and
parameters: unconfirmed** — the repo `github.com/Shopify/dev-mcp` returned 404 on 25/09/2026; it has been merged
into `github.com/Shopify/shopify-ai-toolkit` (a plugin for Claude Code/Codex/Cursor/VS Code…), whose README
only mentions three blocks "Docs and API schemas · Code validation · Store management through the CLI's
store execute capabilities" and describes telemetry (it sends even the user's most recent prompt to
`shopify.dev/mcp/usage` unless opted out).

Dev MCP **neither reads nor writes** store data. Writing (if any) goes through Shopify CLI's "store execute",
"with you choosing when to execute them" (`apps/build/ai-toolkit`).

### 2.2 Storefront MCP → UCP (Catalog · Cart · Checkout · Order MCP)

The old Storefront MCP at `https://{shop}/api/mcp` had `search_shop_catalog`, `get_cart`,
`update_cart`, `search_shop_policies_and_faqs`. Changelog 24/06/2026: the cart tools are deprecated,
supported until 31/08/2026; the migration page says "Storefront MCP's catalog and cart tools were removed",
only `search_shop_policies_and_faqs` remains at `/api/mcp` (`storefront-mcp/servers/storefront`).

The replacement is **UCP** (Universal Commerce Protocol, co-developed with Google; backed by Etsy, Target,
Walmart, Wayfair — `shopify.engineering/ucp`), a single endpoint `https://{shop}/api/ucp/mcp`:

| Server | Tool | Main parameters | Notes |
|---|---|---|---|
| Storefront Catalog (and Global Catalog `catalog.shopify.com/api/ucp/mcp`) | `search_catalog` | `catalog.query`, `catalog.context`, `catalog.pagination` | min 1 · default 10 · **max 250** results; cursor `cursor`, `has_next_page`, `total_count` |
| | `lookup_catalog` | `catalog.ids` | ≤ 10 ids (Global: ≤ 50) |
| | `get_product` | `catalog.id`, `catalog.selected` | every option combination + availability + checkout link |
| Cart MCP | `create_cart`, `get_cart`, `update_cart`, `cancel_cart` | `meta` (required, with `ucp-agent.profile`), `id`, `cart` | **`update_cart` is a PUT**: "replaces the cart's full state … send the complete `line_items` array on every update"; `cancel_cart` needs `meta["idempotency-key"]` |
| Checkout MCP | `create_checkout`, `get_checkout`, `update_checkout`, `complete_checkout`, `cancel_checkout` | | must be authenticated or signed; `create_checkout` with the same `cart_id` is idempotent; non-terminal states carry a `continue_url` to hand back to the buyer |
| Order MCP | `get_order` | `meta`, `id` (`gid://shopify/Order/{id}`) | JWT scope `read_global_api_orders`, TTL 60 minutes; "Order access is restricted to orders placed through your agent" |

Every request carries `meta.ucp-agent.profile` — the URL of the agent's profile JSON; Shopify fetches the profile,
matches the protocol version, **computes the intersection of capabilities** (names, versions, pruning orphan extensions) and
returns the negotiated metadata (`agents/profiles`). Merchants also publish `/.well-known/ucp`.

**Errors in UCP MCP** (`cart-mcp`, `order-mcp`): transport errors (auth, rate limit, unavailable)
are a JSON-RPC `error` with code `-32000` (`-32001` for discovery); **business outcomes** are always a `result`
with `structuredContent.{cart|order}` and an array `messages[] {code, content, severity}` — e.g.
`not_found`, `quantity_adjusted`, `cart_canceled`, `unrecoverable`; Order MCP sets `result.isError`
and `severity: "recoverable" | "unrecoverable"`, with the rule "Always check `messages` before reading
order fields". Rate limits: honour `Retry-After`, backoff with jitter, "Don't retry inside the same
checkout or payment lifecycle without an idempotency-key".

### 2.3 Customer Accounts MCP

`https://{shop}/customer/api/mcp`, discovered via `/.well-known/customer-account-api`; OAuth 2.0
PKCE, scope `customer-account-mcp-api:full`, requires Level 2 protected customer data approval. Tools are found
with `tools/list`; named ones are `get_most_recent_order_status`, `get_order_status`,
`update_shipping_address`. Three published error patterns: "Validation errors: return specific, descriptive
error messages" · "Processing errors: return `Unable to process the request, try again`" ·
"Resource not found errors: return clear messages about the missing resource"
(`storefront-mcp/servers/customer-account`).

### 2.4 Is there an Admin MCP for writing? — No open MCP; there are authorized connectors

- **No** official "Admin MCP server" **was found** on shopify.dev/changelog/help. Every
  "Shopify Admin MCP" on GitHub and the App Store is third-party.
- The official admin write door for external agents is **"Building and managing your store with
  third-party AI tools"**: install the "Shopify plugin for ChatGPT / connector for Claude / connector for
  Perplexity" from that tool's side, then in the admin "review and approve the data access level that the
  tool requests" — **read-only** ("view data but not change it") or **write** ("edit data and take
  actions on your behalf"); "Users who interact with the AI tool are limited by their user
  permissions … a user who can read product data but can't edit product data can't give the tool
  the ability to edit product data"; one store at a time; an approved level cannot be lowered (must uninstall and reinstall);
  revoked by removing the integration (`authorizing-access`).
- The Claude connector can: create products (title, description, price, variants, options, inventory
  tracking), "Update a product's title, description, status, images, variant prices, or SKUs",
  manual/smart collections, % discounts, pages, menus, metafields, read orders/customers/analytics
  (`shopify-connector-for-claude`). **Cannot:** edit the published theme, publish/delete themes,
  change plan/payment/tax/domain, refund/cancel/capture orders, gift cards; "changes items one at a
  time" — no batching (`considerations`, `shopify-connector-for-claude`).
- **Confirm:** the connector "asks you to confirm before it makes a change" (stated for pages/blogs…);
  Shopify advises checking "whether the tool asks you to confirm before it makes a change" before
  enabling it, and says plainly "Actions that connected AI tools take on your behalf aren't reviewed or
  approved by Shopify … you're responsible for that change" (`considerations`). **Connector undo/history:
  unconfirmed.**
- **The connector's technical channel (MCP or Admin API app): unconfirmed** — the help page does not say.

### 2.5 WebMCP (storefront in the buyer's browser)

Tools run in the shopper's tab (`search_catalog`, `browse_store`, `get_product`, `show_variant`,
`get_cart`, `update_cart`, `cancel_cart`, `proceed_to_checkout`, `manage_orders`,
`search_shop_policies_and_faqs`), Chromium-only, "everything the agent does happens in the tab the
shopper is looking at" — no admin tools (`api/web-mcp`).

## 3. How Shopify designs tools for LLMs (question c)

1. **Few and broad, with a clear cap.** Evidence: Sidekick's 0–20 / 20–50 / 50+ table; the cap of 20
   tools + 5 intents for apps; Cart MCP has only 4 verbs, with `update_cart` **replacing the whole cart** (PUT) instead of
   many add/remove/set-quantity verbs. The Flow agent: 2 tools (`task_search`, `task_configuration`)
   cover hundreds of actions.
2. **Short, specific tool descriptions that state the data scope.** 512 characters/tool, 256 tokens/extension; "be
   specific about the domain and tasks your extension covers". The "when to use, common
   flows" part is split into `instructions.md` (2,048 tokens) — i.e. **the tool description says WHAT, the WHEN/HOW guidance
   lives elsewhere**, and JIT instructions travel with the returned data.
3. **Output limited by tokens and time, not by "fields".** 4,000 tokens/1 s for data
   tools; Catalog default 10, max 250; lookup ≤ 10 ids; recommends Resource Links + a summary `_meta`.
   Progressive disclosure (summary → details for what was picked) is the main way to avoid overflow.
4. **Errors that let the agent fix itself.** Admin GraphQL: a 200 OK can still carry errors, you must ask for `userErrors {field,
   message, code}` (`productSet` has `ProductSetUserError` with `code`); UCP: `messages[]
   {code, content, severity}` — `recoverable` (retry/change parameters) vs `unrecoverable` (stop, hand back
   to the person); Customer MCP: validation errors must be "specific, descriptive". Idempotency-key for
   cancel verbs; `Retry-After` for rate limits.
5. **Refusal is a trained and measured skill**, with 4 types (missing context · missing capability ·
   wrong skill · ambiguous) — each type implies a different next step.
6. **Writes always have a person in the middle** in the admin: fill the form + purple highlight + Save; app actions only take you to
   the page + stage; connectors "ask you to confirm". No "agent writes directly" path is advertised
   to merchants.

## 4. Agentic commerce — the public-read / authorized-write boundary (question d)

- **Public reads:** Catalog (Storefront/Global) returns only **products published** to the channel, no
  API key needed (only an agent profile; "Keyless catalog access doesn't support rate limit increases").
  Merchants control exposure in the admin under **Sales channels › Agentic** (since 11/05/2026): switch channels on/off
  (ChatGPT, Google AI Mode/Gemini, Microsoft Copilot, Meta), view ranking queries, receive product data
  recommendations; B2B/password-protected are excluded automatically (`agentic-storefronts`, `…/products`,
  changelog `a-new-home-for-agentic-storefronts-in-your-admin`; announced 11/01/2026
  `news/ai-commerce-at-scale`). Perplexity is not in the list of sales channels; Perplexity only appears
  in the admin connectors (section 2.4).
- **Authorized writes, by tier** (`profiles/auth-and-rate-limiting`): **Anonymous** — catalog, cart,
  checkout build/edit, lowest limit; **Signed** (RFC 9421, ECDSA P-256) — as above, higher
  limit; **Token** (JWT from the Dev Dashboard) — adds `complete_checkout` and `get_order` (only orders created by
  that agent). "Checkout MCP is rate-limited more strictly than Cart MCP at every tier".
  "The merchant always remains the merchant of record"; anything needing review must "redirect the
  buyer to the merchant's prefilled checkout" (`agents/checkout`).
- **No tool in UCP edits products, prices, inventory or content.** External agents read the catalog
  and buy; data is edited only through Sidekick/connectors with the user's permissions (sections 1–2).
- Architectural lesson from `shopify.engineering/ucp`: "Merchants implement only what they need.
  Agents negotiate only what they can handle" — both sides publish a profile, the server computes the intersection; and
  "let specialized systems define their own interfaces rather than forcing monolithic protocol
  definitions".

## 5. Comparison with Tracy v1 (question e)

| Aspect | Shopify | Tracy v1 (`origin/develop`, 25/09) |
|---|---|---|
| Content map | Catalog: `search_catalog` → `get_product`; published-only; ≤ 250/run; Resource Links + `_meta` | `content.read`: `{type:"page", locale}` → `{id}`; `links.next`; its own id, not the CMS id; `slotKey` points straight at the write key (`CONTRACT_CONTENT_READ_BLOCK`) |
| Write door | Sidekick fills the form, a person Saves; connector "asks to confirm", one item per run; `update_cart` PUTs the whole cart | `content.contract`: `inspect` (10–20 s the first time) → **one** `apply` carrying all `changes`; the receipt is the acknowledgement, "read nothing afterwards"; `apply.revert` |
| Number of tools | 20/app; Cart 4 verbs | one `tracy_site` tool, `action` enum per surface; the enum "steers, does not reject" |
| Tool description | 512 characters/tool; WHEN/HOW in `instructions.md`; JIT instructions returned with the data | description blocks counted in characters (`CONTRACT_BLOCK` 1,785; sealed Joomla ≈ 3,700); WHAT/WHEN/NOT combined in the same block |
| Output limits | 4,000 tokens, 1 s; default 10 / max 250 | `limit 1–100`; `CONTENT_FIELD_TOO_LARGE` reports an oversized field, no silent truncation; `narrowInspect` shrinks the inspect answer |
| Error → next step | `userErrors {field, message, code}`; `messages[] {code, severity}`; "always check messages" | `refusalNext`: each code → one sentence pointing to the next step (`CONTENT_BAD_QUERY` "fix the one field its message names"; `INSPECT_FIRST` with the revision; structure refusal → `structureRefusedNext`) |
| Source evidence | — | `requiresEvidence` + `evidence:{key: customer's words}`; if invented, declare it invented |
| Confirm/preview UI | purple highlight, Preview, Save | no UI step; the agent applies when the customer has asked in chat |
| Undo | unconfirmed for Sidekick/connectors | `apply.revert {apply_id}`, `multilingual.restore` |
| Refusal | 4 trained types | refusal codes + next sentence; not yet classified recoverable/unrecoverable |
| Measurement | judge calibrated against humans; GTX from production | a table of calls · seconds · correct per customer question (Joomla "what is on the home page" 17 · 66.7 s → 3 · 18.6 s after #367; "edit one line of text" Joomla dev 3 · 169 s) |

## 6. Lessons for Tracy's agent tools (v2)

Each line: what Shopify does → what Tracy v1 does → the choice for v2 and the trade-off. These are proposals for the PO
(Akemi, Brian) and Lee to decide; no line is a decision.

1. **A tool cap with a number.** Shopify: 0–20 clear, 20–50 blurred, 50+ broken; 20 tools/app. → Tracy v1: one
   `tracy_site` tool but a long `action` enum (RELAY_ACTIONS 28 + lane actions), and each action has
   child `operation`s. → v2: count "paths" instead of counting tools — each surface exposes ≤ ~12 actions and an
   `action × operation` matrix is printed for inspection; rarely used actions are folded into one `ops` with `operation`.
   Trade-off: a short enum is easier to pick correctly, but folding verbs makes the `ops` description long and loses the ability to switch
   off individual verbs per role.
2. **JIT instructions travel with the data, not long tool descriptions.** Shopify returns guidance in the
   tool result and compressed the system prompt 6,000 → 1,500 tokens. → Tracy v1 stuffs WHAT/WHEN/NOT into the description
   block (1,785 characters for `content.contract`) and measured that +370 characters still had to be kept. → v2: cut the description back to
   WHAT + a sample call; put the "next step" into **the response itself** of `content.read`
   (e.g. `next: {tool, args}` on every field with a `slotKey`, `hint` "apply without
   expected_revision"). Trade-off: more bytes per response and the schema validator must have a
   `next` field; in return the description budget shrinks and guidance only appears when there is real data.
3. **Progressive disclosure is the default.** The Flow agent: summary first, schema only for the 2–3 things
   picked; Sidekick data: Resource Links + `_meta`. → Tracy v1: `content.read` list then detail; but
   the contract's `inspect` is still a 10–20 s run (Joomla dev 60–80 s) with no prior filtering. → v2:
   `content.read` detail returns `slotKey` + `revisionHint` up front to **drop inspect entirely** on the
   "read → apply" path; `inspect` remains only for slots not in the map. Trade-off: the map's revision
   ≠ the contract revision (already noted in `CONTRACT_CONTENT_READ_BLOCK`), so we must accept one
   `INSPECT_FIRST` round trip or teach the Claude Cowork plugin to accept the Content API's revision.
4. **Output limited by tokens and seconds, with a "truncated" flag.** Shopify: 4,000 tokens, 1 s, beyond that the
   tool is skipped. → Tracy v1: `limit 1–100`, `CONTENT_FIELD_TOO_LARGE`, ADR 0021 §3.7 already promised "a shortened
   item must carry a flag along with the path to read on". → v2: set a byte/token budget on **every response** of
   `content.read` and `inspect` (not just every field), return `truncated: true` + `next` to read on;
   measure seconds per run on dev as in the §Calls·seconds table. Trade-off: shorter answers mean more runs
   for broad questions — measure by total seconds, not by counting single calls.
5. **Errors with `severity`.** UCP: `recoverable` vs `unrecoverable`; Customer MCP: validation must be
   specific. → Tracy v1: `refusalNext` already gives the next sentence, `CONTENT_BAD_QUERY` names the field. → v2:
   add `severity` (or `retry: "fix-and-retry" | "ask-customer" | "stop"`) to the refusal envelope so the
   agent does not repeat an `unrecoverable` error (case measured 23/09: the agent wrote `#__languages` twice instead of
   stopping). Trade-off: one more field that must be kept correct in the Claude Cowork plugin for three CMSs, and `check-refusal-next` must
   be extended to catch codes missing `severity`.
6. **Four types of refusal.** Sidekick: missing context · missing capability · wrong skill · ambiguous. → Tracy
   v1: refusal codes by technical cause (`NOT_ON_THIS_PLATFORM`, `STRUCTURE_REFUSED`,
   `CONTENT_ADAPTER_UNSUPPORTED`). → v2: attach each code to one of the four types and give the
   `refusalNext` sentence per type ("wrong skill" → another tool's name; "missing context" → ask the customer one question).
   Trade-off: an extra classification layer on top of existing codes, cheap to do, but only valuable with a
   refusal measurement set like Shopify's (refusal accuracy/false positives) — Tracy does not have one yet.
7. **Write changes as a whole block, not piecemeal patches.** `update_cart` PUTs the whole cart; the connector "changes items one
   at a time"; `productSet` is an upsert with per-field `userErrors`. → Tracy v1: **one** `apply` carrying
   all `changes` (measured: `apply.list` after writing was redundant 55/63 times). → v2: keep as is; add
   per-slot `userErrors[]` in the receipt (which slots were accepted, which refused and why) instead
   of refusing the whole apply when one slot is wrong. Trade-off: partial success makes undo more complex
   (`apply.revert` must revert exactly the accepted part) — Shopify accepts partial success in
   `productSet`, Tracy has to decide.
8. **Confirmation before writing lives in the UI, not in the tool.** Sidekick fills the form + purple highlight + a person Saves;
   the connector "asks you to confirm". → Tracy v1: applies directly after the customer says so in chat; source
   evidence (`evidence`) is the only "confirm". → v2 has two options: (a) keep direct writes +
   receipt + `apply.revert` (fast, suits "edit one line of text" at 1–3 calls); (b) add an
   `apply {dry_run:true}` step that returns a diff for the agent to show the customer before applying — one run slower but
   the Shopify model for changes to many slots or `requiresEvidence` slots. Proposal: measure both
   on the same question table before choosing; do not require confirmation for every write.
9. **Write permissions per person, not per tool.** Connector: a read/write level approved in the admin, and
   never above the chatting user's permissions. → Tracy v1: seat book APPLY_RULES + per-site role (ADR
   0014), `media.upload` off on sealed surfaces. → v2: keep; but expose **the current permission level** in
   `content.read` (`writable: true|false` on the field, instead of only `slotKey: null`), so the agent says
   "cannot be edited" at read time rather than after a refused apply. Trade-off: the map must ask the seat
   book once per read run.
10. **The map only returns what is published, with a coverage flag.** Catalog is published-only, B2B excluded automatically; ADR
    0021 §3.5–3.6 already says "readable is wider than editable" and "authorized reads first, public later". → v2: keep
    that order; every `content.read` response declares `coverage` (the part the adapter could not read) as
    Shopify declares `unresolved` in Catalog Mapping. Nothing to change, just don't drop it.
11. **Measure with a calibrated judge, not just calls·seconds.** Shopify: GTX from production, judge Kappa
    0.61 vs. human 0.69, "benchmark parity masks a 35 % gap". → Tracy v1: a table of 9 questions × 3 CMSs ×
    local/dev, ✔ scored by hand. → v2: keep that table as ground truth, add a "correct per judge" column
    run automatically over transcripts (`agent-chat/*/REPORT.md`) to widen the number of questions without costing
    people. Trade-off: the judge must be calibrated against at least a few dozen hand-scored transcripts before it is
    trusted.
12. **Field names and order are part of the "tool".** Flow agent: mismatched tool names/key order between
    training and production silently reduce accuracy. → Tracy v1: has a schema validator
    (68/68) for the Content API envelope. → v2: lock **field order** in the envelope and in the sample
    calls of the tool description (`{type, locale}` then `{id}`), and a test that compares the description's sample bytes against the
    schema. Trade-off: one more small gate; the benefit only shows when the model changes.

## What could not be confirmed (so nobody copies it as fact by mistake)

- Whether Sidekick has bulk product editing / metafield editing through chat; its own undo; a "Sidekick did X" log.
- The verbatim sentence "Sidekick acts with the staff member's permissions".
- The full tool + parameter list of `@shopify/dev-mcp` (repo 404 on 25/09/2026).
- The technical channel (MCP or Admin API app) and undo/history of the Claude/ChatGPT/Perplexity connectors.
- The error format of the Storefront Catalog MCP (the page does not say; Cart/Order MCP do).
