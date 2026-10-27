# ADR 0015 — The feature pack is the unit the customer switches on and off, not the page

- **Date**: 2026-09-09
- **Status**: binding
- **Decided by**: Lee (session "6steps", 09/09/2026)
- **Related**: [ADR 0014](0014-one-dsh-per-host-commands-in-web-container.md) (the agent's commands
  run in the site's container) · [ADR 0001](0001-seat-door-and-enforcement-boundary.md) (every write
  to another site goes through the seat door)

## Context

The form asks the customer about seven pages: Home, Product, Service, Blog, About us, Pricing, Contact. The engine switches on and off
by exactly that list (`seed-plan.mjs`, function `want`), and thirteen page-building blocks are assembled
into the body of each page. That part works correctly.

But it can only answer the question *"which pages does the site have"*. The question customers really ask is *"what can
the site do"* — Lee, 09/09: *"the difference here (if it follows the customer's request) is usually
functionality, for example whether that page has a shopping cart or not, whether it has a social login module or not; Joomla
WP core login has no Google login, for instance"*.

Two reasons why that difference cannot be produced by rewriting content:

1. **The model can write words, it cannot write functionality.** A Hanoi bakery and a travel agency differ in
   words, and that is exactly the model's job — measured 09/09 on the five words *"A small bakery in Hanoi"*, the model on its own
   came up with bánh mì, egg coffee, lychee season. But a shopping cart is not a paragraph: it is an
   extension to install, a table in the database, a checkout page, a menu item, a module.
2. **The CMS core does not have it.** Neither WordPress nor Joomla has Google sign-in in the core. If no
   extension is installed, there is no way to "write" that feature.

The commercial quickstart read on 09/09 (`ja-voyara`, JoomlArt, Joomla 6.1) shows the same
conclusion from the opposite direction: 312 MB, of which 144 MB is travel photos and 249 articles about Patagonia — that
content Tracy does not need because the model can write it. What is worth taking is **the eight bundled extensions** and how a
page is assembled: a menu item picks a template style, the template style picks a layout, the layout picks module positions,
each module is a block with parameters. Their About page is just one line `{loadposition about-page}`.

## Decision

1. **The unit the customer switches on and off is the FEATURE PACK, not the page.** A pack gathers everything needed for a
   function to work: the extension to install, the pages it must have, menu items, modules, and configuration. The customer
   presses one switch; the engine does six things.

2. **Pages still switch on and off as before, and now have two sources.** Pages the customer picks directly in the form keep
   their current path. Pages a pack brings along — Shop, Cart, Checkout — exist only
   when that pack is on. `want` takes a second source, without changing its meaning.

3. **The pack list is DATA, not code.** Each pack is declared in a file, one record per pack,
   with all of the fields below. Reason: this list changes with the market and with licences, while
   the engine that reads it does not. Required fields:

   | Field | Meaning |
   |---|---|
   | `id` | machine name, for example `shop` |
   | `label` | the text the customer reads, one per language Tracy speaks |
   | `platforms` | whether this pack runs on WordPress, Joomla, or both |
   | `install` | what must be installed: an official repository slug (WordPress) or a zip URL (Joomla) |
   | `pages` | pages the pack brings, each with a body template |
   | `menu` | menu items to add |
   | `modules` | modules and their positions |
   | `settings` | configuration to set, as key-value pairs |
   | `manual` | the steps that CANNOT be automated, written out in words |

4. **The `manual` field is required, even when empty.** A pack that hides a manual step is a promise Tracy
   cannot keep. Measured 09/09: Google sign-in can be installed automatically on the Joomla side, but declaring the redirect
   address in Google Console **has no API that can do it instead** — each customer domain is one visit by a
   person who clicks. That pack is valid, as long as it says so.

5. **A pack with no automatic install path does NOT go into the form.** Survey 09/09: for booking there was no
   option that was free, publicly downloadable, and configurable without a browser all at once. Asking the customer about a
   feature Tracy cannot deliver is the cheapest way to lose trust on the very first build.

6. **Installing a pack goes through the existing door, without opening a new door.** The seat door already carries `extension.install`,
   `extension.enable`, `plugin.install`, `plugin.activate`, `content.update`, `media.upload`
   (`workers/seat-registry`, `APPLY_RULES`). A feature pack is a way of **chaining** those
   actions, not a new permission on the customer site.

7. **The list of page blocks that need text is computed from the packs that are on.** When the customer picks three pages, the engine today
   still pays the model to write all thirteen blocks, including the `styleguide` block used only for the internal
   showroom. The same computation that decides which pages are built also decides which blocks need text.

## Consequences

**The form gets one more question.** After language and tone comes a multiple-choice question about features. It is the
only question in the form that asks about *functionality*; the other five ask about *content*.

**The step list grows with the answers.** The mechanism has existed since 09/09: the task list in the session is computed
from the answers rather than six fixed lines. Turning on the selling pack adds a "Install the shop" line,
the same way the "Install the translation plugin" line appears when the customer picks a second language.

**A new step in the engine, not a new process.** Installing packs comes after `theme` and before
`style`: the extension must be present before the style is applied, and the pack's pages must exist before
the seeder pours in the text.

**A broken pack must not break the site.** Same rule as the translation plugin today: an extension that fails to install
is a warning line in the step's details, not a failed build. The customer still
gets the site, missing one feature, and knows it is missing.

**What this does NOT solve:** industry-specific sample content. A pack carries *functionality*, not
*words* — the words are still written by the model from what the customer said. If sample content is needed later, that is
a different decision, and the commercial quickstart shows its cost: one content set that serves
exactly one industry.
