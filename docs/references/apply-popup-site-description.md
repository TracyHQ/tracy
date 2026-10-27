---
description: '"Apply" in the "Tell Tracy about your site" popup — text and images following the customer''s words, made while the site is installing and written to the site as soon as it is up; its shape, the language / fact / image rules, the three engines WordPress · Joomla · EmDash, measurements against "I will do it later", and known limits.'
sources:
  - apps/tracy-web/src/sites/brief-build.js
  - apps/tracy-web/src/sites/brief-store.js
  - apps/tracy-web/src/sites/brief-normalize.js
  - apps/tracy-web/src/sites/brief-engines/shared.js
  - apps/tracy-web/src/sites/brief-engines/wordpress.js
  - apps/tracy-web/src/sites/brief-engines/joomla.js
  - apps/tracy-web/src/sites/brief-engines/joomla-languages.js
  - apps/tracy-web/src/sites/brief-engines/joomla-modules.js
  - apps/tracy-web/src/sites/brief-engines/joomla-tidy.js
  - apps/tracy-web/src/sites/brief-engines/wp-blocks.js
  - apps/tracy-web/src/sites/brief-engines/wp-forms.js
  - apps/tracy-web/src/sites/brief-engines/wp-leaves.js
  - apps/tracy-web/src/sites/brief-engines/wp-residue.js
  - apps/tracy-web/src/sites/brief-engines/emdash.js
  - apps/tracy-web/src/sites/brief-engines/emdash-menus.js
  - apps/tracy-web/src/sites/brief-engines/emdash-preload.mjs
  - apps/tracy-web/src/sites/brief-engines/pictures.js
  - apps/tracy-web/src/sites/brief-engines/guard.js
  - apps/tracy-web/src/lib/seed-model.js
  - apps/tracy-web/src/lib/seeder.js
  - apps/tracy-web/src/lib/emdash-tool.js
  - apps/tracy-web/src/lib/site-brief.js
  - apps/tracy-web/src/db/migrations/052-site-brief.sql
  - packages/site/tracy-add-site/src/client/questions-sheet.tsx
  - packages/cms/tracy-seeder/src/plan-joomla-contract.mjs
  - packages/cms/tracy-emdash-theme-business/tools/personalize.mjs
---

# Apply in the "Tell Tracy about your site" popup

> **Changed 07/10/2026 (#997, option C, decided by Akemi):** the popup and the two buttons *Apply* / *I will do it later*
> are gone. The questions live in the **"Customize your site"** card right in the Add site form (below template and
> address); clicking the card slides a sheet up over the panel (`questions-sheet.tsx`). Every question is optional; a
> question with the `required` flag just goes first with a *Recommended* label. **Create site** can always be clicked:
> with answers it sends exactly the body *Apply* used to send, without answers exactly the body of *I will do it later*.
> Below, "Apply" / "I will do it later" mean those two cases; the server-side mechanism is unchanged.

When the customer clicks **Create site**, the wizard shows a small popup in the middle of the screen. **Since 04/10/2026
the popup has no hard-coded question**: it draws exactly the questions of the **question set (Site questions) of the
template the customer chose** — the `tracy-questions` set the admin edits in `/ops` for each quickstart, fetched through
`GET /api/sites/questions` (the same door, the same set-selection order as the Build form: the quickstart's set → the
default set the admin chose for the CMS → the CMS standard set, which is only a few questions: name + description).
Before that the popup asked 3 hard-coded questions (a text box ≤300 characters with a "Rewrite with AI" button, "what do
visitors come to the site for", "what feeling should the site have"); those did not fit every template (a site with no
commerce where the customer picks "Buy products" has nothing to do with it), so they were dropped along with the AI
rewrite button — the question set has no such feature. The door `POST /api/sites/brief/rewrite` (and `lib/brief-rewrite.js`) **still exists** but the popup no longer calls it: it is part of public API v1 and has been in production since 03/10, so removing it means changing the API version (v2), a separate decision. Two buttons:

- **I will do it later** — creates the site exactly as before the popup existed: the same body sent, no DB row, no
  added step. This is the **baseline** for comparing time.
- **Apply** — creates the site and then writes its text and images following the customer's words. **Asks the customer nothing more.**

The two flows — *Add site* and *Design inspiration → Create with &lt;CMS&gt;* — enter **the same wizard, the same door**
`POST /api/sites`; they differ only in the `design` field (which template). So Apply is one mechanism for both flows
and all three CMSs.

Two different things carry the word "brief" in the repo: `apps/tracy-web/src/brief/` (the record of "what the customer
said", built by rules from question-set answers, messages and assets) and `apps/tracy-web/src/sites/brief-*.js` (this popup).
They do not call each other.

## 1. What Apply promises, and what it does not

**Promises:**

1. The site's text **and images** following the customer's words, **for every language the customer names** in the text
   box; if the customer names none, **one** default language (English — §5).
2. Asks the customer nothing more. Missing information takes a stated default; a failure delivers the site as it is
   (§4).
3. Time until the site is ready close to "I will do it later" (§9).

**Does not promise:**

- **No invented facts.** Phone numbers, emails, addresses, opening hours, prices, years, statistics, people's names,
  clients… appear only when the customer wrote them (CLAUDE.md §0.3: invented data is worse than empty data) — §6.
- **Writes only into templates with a contract** (a "sealed" profile declaring which text/image slots the agent may write): Tracy Business ·
  Tracy Base on WordPress and Joomla, JoomlArt templates with a profile on Joomla (`ja-kinetic`, `ja-spa`,
  `ja-space`, `ja-trip`, `ja-voyara`, `tracy-apple`, `tracy-airbnb`), Tracy Business / SaaS / Base on EmDash.
  Other templates (most JA cards in the gallery) **keep the template's text and images**, and the `site_brief.error` row
  says why. The popup knows this in advance: for a card Apply cannot write, the door `GET /api/templates` reports `apply: false` for that platform
  and the wizard creates the site right away, without asking (§11).
- **Images are limited.** WordPress and Joomla: at most 6 images (the hero, then demo images of the home page and other pages), only demo images are replaced, never
  logos / maps / portraits; EmDash: the template tool's own image set (~13 slots) (§7).

## 2. Shape: make the text while the site installs, write it when the site is up

Installing a CMS takes ~60–190 s of waiting on containers and downloads; writing text is waiting on a model. The two do
not need each other until the last minute, so they run **in parallel**:

```
click Apply ──┬─ host installs the site ─────────────────────────────┐
              └─ normalize → engine.prepare (model + images) ────────┤ both done?
                                                                     └─ engine.apply (a few seconds)
```

- `prepare` **does not need the site**: it builds the text plan from the contract this process already holds (each slot
  holding exactly the text the template ships), calls the model, checks facts, draws images.
- `apply` is just a short chain of writes through the Apply door, **under the authority of whoever clicked** (the same door the agent's tools use:
  seat, toolset, write lease, audit all see an ordinary person writing ordinarily).
- What the customer waits for on top of the "later" path is `max(0, prepare − install) + apply`. `prepare` is kept short by
  **calling the model in parallel with thinking off**, not by doing less.

**Early start.** When the host job's current step matches `building the site folder` (the CMS is up, only the site
folder is left to build) or the job is `done`, the runner pairs the content door itself (`pairSite`; the wizard will see it already paired) and `apply` starts right away,
without waiting for the `done` poll. `TRACY_BRIEF_EARLY_START=off` turns this off (wait for `done` before writing): on a machine where the host's
last step and the first writes compete for one disk, waiting can be faster (§9).

## 3. State and doors

The `site_brief` table (migration 052), one row per site created with a brief; **"I will do it later" writes no row**:

| Column | Meaning |
|---|---|
| `brief` | what the customer typed, cleaned: `{about, goal, style}`; `about` ≤ 300 characters, control characters removed |
| `normalized` | what Tracy read out of it: `{name, sector, tone, languages, contact, pictures, …}` |
| `state` | `queued → preparing → ready → applying → applied \| failed` |
| `stage` | one line the wizard shows while waiting: *writing your text and pictures* / *placing your text and pictures on the site* |
| `error` | notes joined with ` · ` — what did **not** happen (§4) |
| `timings` | milliseconds per phase, to compare with "later": `prepareMs`, `applyMs`, `afterUpMs`, `readyAt`, …; and `applyIds` / `reusedApplyIds`: the `apply_id`s the Apply run wrote under, its own / reused (see below the table) |

This row is the **source of truth**, not an in-memory variable: the tracy-web replica doing the work and the replica answering the wizard's
polls may differ, and a deploy can cut either one short (a row left silent beyond `staleMs` is treated as a
dead worker).

**Undoing a whole Apply run (05/10/2026, bug ledger L08).** One Apply run writes under several `apply_id`s: `dtrim-seed` (hiding demo posts),
`contract-…` (contract writes, possibly two), `residue-…` (WordPress cleanup), `tidy-…`/`tidy-consent-…` (Joomla cleanup),
`mlang-…` (hiding/adding languages), `facts-…` (the Joomla facts module), `media-brief-…` (each image). The WordPress and Joomla engines write through
`recordedDoor` (`shared.js`), so every id in a door call is reported to the runner and saved in `timings.applyIds` (in order
of first appearance, each id once, saved as soon as it is seen so a run dying midway still has its list; the door is unchanged). **Ids this run did not
create itself** — `dtrim-seed` (every demo hiding, including the install-time one, shares one fixed receipt) and the install-time language
receipts WordPress writes again under it (`mlang-…` via `onRecord`) — are saved separately in `timings.reusedApplyIds`: undoing them also undoes
install-time work. Every write to the final part
of the row goes in the same chain as those saves; when the run ends its signal (and `prepare`'s) fires, and any id the engine
still names late after that is **not** saved — if the customer clicks again, the row belongs to the new run and does not take the old run's ids. **Undo = one
`apply.revert` per id in `applyIds` (this list only), newest id first.** EmDash has no ids: the template's tool writes through the site's API. No column added:
`timings` is an existing jsonb.

The poll door `GET /api/sites/:key/jobs/:id`: when the host reports `done` while the brief is still running, the door returns `state: "running"` with `step` =
`stage`; on `applied` or `failed` it returns `done` as usual. When the host reports `failed` the brief is `abandon`ed; if the customer clicks
Create again (same address, reinstall), the `failed` row is **reset** and the text is made again along with the new install. A second click while
the first run is still going is the same job.

## 4. Four unchanging rules (🔒)

1. **The "later" path is untouched.** No brief → no row, no step, no code path of this module runs.
2. **Failures are soft and said out loud.** The model goes down, images do not arrive, the site refuses a write: the site **is still delivered** with
   the template's text, and `error` records what did not happen. Nobody is asked anything.
3. **The writer is whoever clicked.** Every write goes through the Apply door with the site owner's seat; the module touches neither the DB nor the webroot.
4. **Every model call has a ceiling.** `prepare` has a deadline (`prepareMs` 5 minutes); when the site is up and `prepare` is not done it gets
   90 s more **counted from when the site came up** (`prepareGraceMs`; before 05/10/2026 counted from the click, so a site up after a minute could still
   wait five more minutes — bug ledger L07), `apply` 3 minutes, the whole run 25 minutes; beyond that, a soft `failed`. The runner waits for the site **in parallel**
   with `prepare`; when the 90 s run out, `prepare`'s signal fires and the engine hands back what is done (a model call still pending leaves its slot
   with the template's text), with at most 10 s more (`prepareStopMs`); if nothing is handed back the site is delivered with the template's text and a
   note. `timings.wordsAfterUpMs` = how long the site was up while still waiting for text.

## 5. Languages

- **Since 04/10/2026, the question set's language question (kind `languages`, feed `site.languages`) decides.** Whatever the customer
  picks, the site has exactly those languages (at most 4, `languagesFrom: 'answer'`); a template that does not ask for languages (the standard set,
  or a single-language template such as `ja-kinetic`) has no such question, and what follows — reading languages from what the customer wrote
  — remains the fallback.
- The customer names languages in the text box ("in English and Vietnamese", "tiếng Việt và tiếng Anh") → **exactly those languages**,
  at most 4. None named → **one** language: **English**.
- The model reads the text box but **code decides** what it may change: phone numbers and emails must be **in the text box itself**; and
  a language the model names must be **backed by the wording itself** (measured 03/10 with a real model: "A French bakery in Paris" returned
  a French site). A language used *as a modifier of a noun* ("French bakery", "Italian pastries", "Vietnamese customers")
  is food or nationality, not a request; whereas "in French", "in English, French and German", "French version",
  "tiếng Pháp", "song ngữ Việt - Anh", "please add Korean and Russian versions", "should support Japanese, English" are.
  The rules also read the wording themselves, so a language the model missed is still found; without a model only the rules remain (stricter: they need
  *in / bằng / support*, a word *language / version / site*, or *bilingual / song ngữ* around the language name).
- The language the customer **types in** (`writtenIn`) does not become a site language by itself: a Vietnamese shop owner describing a bakery in Vietnamese
  has not asked for a Vietnamese site, and an extra language costs a whole round of text.
- **Decision 21: the source language (English) is always at `/`** on all three CMSs; other languages live under their own prefix
  (`/vi/`). "Vietnamese only" still gives an English `/` plus `/vi/`.

## 5b. How question-set answers enter the brief (04/10/2026)

The popup sends `brief = {answers: {<question id>: value}, questionnaire: <contentHash of the set shown>}`. The site-creation door
(`briefOfPress` in `sites/route.js`) scores the answers against **exactly the set the customer saw** (looking up `question_snapshot` by
hash; an unknown hash uses the site's current set), so an admin editing questions while the popup is open does not change the meaning of an
answer. `briefFromAnswers` (`lib/site-brief.js`) drops answers to questions not in the set, questions hidden by `showWhen`, and
choices the question does not allow; text is cut (200 characters for one line, 300 for the description) and control characters are filtered.
Each question is read **by its feed**, not by a hard-coded id: `site.name` is the name (exactly as typed, `nameFrom: 'answer'`),
`site.languages` the languages, `copy.tone` the tone, `copy.about` the description; the `sector` question gives the sector (the
choice's label). Every other question becomes a `Label: answer` line in `brief.said`; the description + those lines (`spokenOf`) are
**what the customer said**, from which the model reads facts and against which the invented-fact guard (§6) checks — so a phone number typed
into a question "Địa chỉ và hotline" ("Address and hotline") counts as provided by the customer. When the customer typed a description, those lines also reach **every text-writing
planner** under the separate `details` field of the site block (`normalized.details`, ≤ 1200 characters; not mixed into `about`, because some slots take
`about` verbatim); without a description they are `about` itself, not said twice. The judges (WordPress pages and menu labels, Joomla menus, EmDash menu
labels) read **all** of what the customer said up to `JUDGE_BRIEF_MAX` = 1200 characters (before 05/10/2026: the first 300 characters, so answers
after a long description did not reach the judges; bug ledger L06). The CMS standard set has only name + description, so those are
the two questions the popup asks when the quickstart has no set of its own. The old `{about, goal, style}` body is still read, for browsers still
holding an old plugin bundle. The `pages` question (feed `seed.pages`) besides the `Pages: …` line also decides which of the template's pages stay (§8.4,
05/10/2026).

## 6. Facts: no inventing

Measured 03/10/2026 on the stand, planning `tracy-business/j6` for a bakery with only a name and one sentence: the model wrote
"Hotline: +84 24 3555 0144", three street addresses with phone numbers, "Baking since 2010", a five-year timeline, "Prices as
at 2026" — specific, plausible and false. Two layers block this:

1. **`FACT_RULES`** appended to every planner instruction: forbids writing phone numbers, emails, addresses, opening hours, prices, years,
   dates, statistics, awards, certifications, testimonials, clients, projects, people's names **unless the brief says so**. A slot whose
   sample states a fact is **rewritten into a line with the same role that states no fact** ("Baked daily" instead of
   "380+ projects delivered", "Our bakers" instead of a named person); only a slot with no such line goes to `pending`.
2. **`guard.js`** re-checks what the model returns (phone, email, street address, price, year): a fact-bearing value that is
   **not** in the customer's words → not written, the slot stays as is (WordPress: asked again once; with no honest line the block
   is removed, §8.1). **A fact already in the slot's sample is not evidence** (decision 05/10/2026, bug ledger L09): before, a
   line rewritten around the demo company's hotline or mailbox ("Call our team on <demo hotline>") was let through because the slot's sample
   carried it, and the customer's site carried another company's contact details under the customer's words; now only the brief's facts count (the reason adds
   `: it is the template’s own`). Deliberately narrow, because only these
   patterns can be proven false by a string comparison with the customer's words. Soft statistics/claims ("family owned") belong to the model
   and are stated as a limit.

Joomla adds `inventions: 'never'` to the seeder's planner (see `plan-joomla-contract.mjs`): a slot the model itself marks
`invented` is dropped.

⚠ **Opposing decisions.** The seeder's default (Lee, 23/09) is *invent and flag*; Apply goes the *no inventing* way. The seeder's default
is **unchanged**; only the Apply path turns on `inventions: 'never'` and `FACT_RULES`.

## 7. Images

- **Draw** (no site needed): WordPress/Joomla draw at most `MAX_PICTURES = 6` image descriptions produced by the normalize step (one wide scene
  for the top of the page, five different close-ups: craft, other dishes, the place seen from inside with no recognisable people,
  working hands without faces, a top-down composition), through the OpenRouter door (the `seedImage` door set in `/ops`, or
  `OPENROUTER_API_KEY`). Demo images are grouped by **file** across every page (wherever a demo file appears it is replaced),
  home page first, top-of-page first within its group. EmDash lets the template's own tool draw its image set (6 page images + cards of the demo entries, ~13 calls) during
  the recording run, through OpenRouter only. No door at all → the template's images are kept with the note *no picture model is set*.
- **Place** (site up): for each demo image being replaced, read its **shape** from the first 64 KB of the file (HTTP Range through the site's address),
  crop the drawn image from the centre to that shape (`sharp`), upload **one at a time** (the site accepts one write at a time),
  then return the slot value for the contract write to finish. A sealed site refuses an image whose shape is off by more than 0.02, and **one refused
  value breaks the whole write** — which is why the shape is the site's, not ours.
- Never replace the logo (a drawn logo is an invented client), maps, portraits/avatars, icons, flags.
- A broken image loses only its own slot.
- **Images have no language**: an image placed in the source edition is placed in every edition the customer asked for too. WordPress does this with
  a second, small write (after the text write), so an edition where the site refuses the image only loses that image, not
  the text just written; Joomla derives from the site's state after the images; the EmDash tool writes images into every locale.

## 8. Three engines

| | WordPress | Joomla | EmDash |
|---|---|---|---|
| Template | `tracy-business/wp7`, `tracy-base/wp7` | `tracy-business/j6`, `tracy-base/j6`, JA with a profile | `tracy-business`, `tracy-saas`, `tracy-base` |
| `prepare` | the seeder's contract + planner, **35 slots per call, all at once** (`planConcurrently`), **each block with a duplicate name is its own slot**; slots still *pending* are asked again once (§8.1); draw images | as WordPress; translates first the languages that must be *derived* | runs **the template's own `personalize.mjs` tool** once on a **fake site** (`emdash-preload.mjs`), recording every answer the model gave |
| `apply` | [check the site → hide demo posts] ‖ [read and plan secondary languages] ‖ [crop and upload images] ‖ [the model judges which of the template's menu labels the customer does not need] → **one** contract write → **clean up leftovers** (§8.1) → hide editions nobody asked for | hide demo rows ‖ crop images → upload images → check the site → **one** contract write → hide editions nobody asked for → *derive* missing languages → hide again | re-runs **exactly that tool** on the real site, every model question answered from the recording, leaving only the writes |
| Secondary languages | Polylang edition `/vi/` read from the real page, then planned | the template ships `ru-RU`; other languages are *derived* through `multilingual.plan/package/apply/verify` | one entry per locale; locales nobody asked for are hidden with `--hide-chrome-only` |
| Remaining cost | write ~1 s, leftover cleanup ~3 s, hiding editions ~1 s | `multilingual.retire` ~24 s (the plugin scans every row on each call) and the add-language job ~65 s | the tool's writes ~9 s (single language) / ~15 s (two languages) |

### 8.1. WordPress: leftovers of the template's company (measured 03/10/2026)

The contract only writes the **slots**, and slots are not the whole site. Measured on a bakery site built from `tracy-business/wp7` 1.3.2 (241/253 slots
written): the mega menu at the top of **every** page still listed a Russian contractor's projects; the About page told the company's history (2004,
Domodedovo, steel plant) and ISO certificates; the Services page described steel structures; the footer advertised "Pre-engineered buildings"; twenty-odd
demo pages (email, forms, slides, style guide, Investors, Careers) could be opened; the Contact form demanded drawings attached under "Federal Law
152-FZ". None of these is a slot: they are raw HTML blocks, template parts, menus, Contact Form 7 forms, pages nobody navigates to. Someone else's wrong
figures on a customer's site are worse than nothing (CLAUDE.md §0.3), so Apply removes them through the same door that writes the text
(`content.get` / `content.update`, as the person who clicked Apply, one `apply_id` for the whole batch so one `apply.revert` undoes everything). Code:
`brief-engines/wp-blocks.js` (reading blocks), `wp-residue.js` (removal rules), `wp-duplicates.js`, `repair.js`, `wp-leaves.js`, `wp-forms.js`.

🔒 **ONLY HIDE PAGES THE CUSTOMER UNTICKED (decided by Akemi 08/10/2026, TCH #1013, the "7 default questions" round).** A page we cannot personalise
is **not hidden from the customer**; a page is hidden only when the customer **actively unticks** it in the Pages question. A page still holding the template's sample text stays
**public**, and **the customer is not told**. Consequences on all three CMSs:
- **WordPress** (`wp-residue.js` `sweepWordPress`): the hidden set is only `unwanted` (pages the customer unticked, with their translations and menu links).
  The showcase rule (`showcasePages`, added by David 03/10/2026, commit 3c0a5105f) **no longer hides**: a showcase page stays exactly as
  released, its text is not planned and its parts are not cut (cutting would be refused and noted on each page). The judge (`judgeSite`) **now only
  renames menu labels** and is not asked about pages; it once hid the Product page a bakery customer had ticked. Links to pages now stay
  and are **not redirected** to Contact.
- **Joomla** (`joomla-tidy.js` `judgeMenus`): the judge only renames labels and removes no menu item; the "no more than 80%" cap and the re-ask round were dropped.
  The only items removed are: pages the customer unticked (`unpickedMenuItems`) and items that only lead to disabled pages (aliases, dead links, items under
  a disabled heading) — those items already returned 404, so removing them removes dead links, not hiding readable pages. The plugin's demo trim
  (`demo-trim-map.json`, in the Claude Cowork repo) still removes the Projects/News menu items of Tracy Business j6; pages the customer ticked are turned back on
  (`tickedMenuItems`), pages not in the Pages list are **not yet** — see the open note in the journal. Buttons/links to pages the customer
  ticked that the trim had hidden **keep their target** (10/10/2026): the text is planned before Apply turns the pages back on, so `prepare` precomputes
  those items from the lock + trim map (`republishedByApply` → `republished` of `planJoomlaContract`), and `takeLinksOff` skips
  them too. Links to trim-hidden pages the customer did **not** tick (or that are not in the Pages list) **are removed like links to unticked pages**,
  no longer redirected to Contact (decided 10/10/2026): the planner leaves those slots as they are (`deadLinks`), `takeLinksOff` removes them via `empty_links` once
  the trim has run (`trim.status` "hidden"); the seeder CLI removes them within the text write itself (the plan's `emptyLinks`, slots marked `emptyLink`).
  The trim map itself (pages outside the Pages list are still hidden) remains the open point of #1013, in the Claude Cowork repo.
- **EmDash** (`personalize.mjs` `templateHideRules`): the template's `hide` rules **no longer apply** (the Business and SaaS maps are set to
  `hide: []`), empty listing pages (`emptied`) stay too; only `hidePages` (pages the customer unticked) are removed.
The paragraphs below describing the old rules (hiding showcases, the judge hiding pages, EmDash hiding Careers/kit) are **measurement history**, no longer true.

🔒 **LINKS TO UNTICKED PAGES ARE REMOVED, NOT REDIRECTED TO CONTACT; CHILDREN OF UNTICKED PAGES ARE HIDDEN WITH THEM (decided by Akemi 08/10/2026, TCH #1013).**
Before, buttons and links to hidden pages were pointed at the Contact page (WordPress's `linksMoved`, Joomla's `deadLinkRedirects`):
a button still said "Explore sample plans" but opened the contact form. Now:
- **WordPress** (`wp-unlink.js` `linksOff`, run on page bodies and template parts): a button (`core/button`) to such a page **is removed on its own**,
  its surroundings stay; a `core/buttons` group or list left empty is removed too. A paragraph / list item whose whole text is one link
  to that page is removed (Tracy Base's header links). A link **inside running text** has **its link tag dropped, its text kept** (the sentence loses no word);
  a raw HTML link with class `btn`/`button` has its whole button removed. A block with its own `url` pointing there (the theme's mega menu) is removed. A block a contract
  slot writes into (the **first** block with that name) **is not cut** — the plugin refuses every guided text edit that loses a slot's
  block — but is **hidden** with `metadata.blockVisibility: false` (WordPress 6.9+ does not render that block; read in
  `wp-includes/block-supports/block-visibility.php` of WP 7.1); a button group left with only hidden blocks is hidden too. Measured on release
  tracy-base wp7 1.1.2: unticking Pricing hides the Product page's hero button "Explore sample plans" (slot `hero.btn-1`), the "Talk
  about a project" button stays. Menu links (`core/navigation-link`) are still removed by `navWithout` as before.
- **WordPress, child pages:** pages whose address lies under an unticked page (`/company/` → `/company/team/`) are hidden with it, along with their translations and
  menu links; a child page the customer **ticked** stays, the home/contact pages are never hidden. When the unticked page is the site's **posts page**
  (`page_for_posts`, News of Tracy Business WP), **every published post** becomes a draft (same `apply_id`, so
  `apply.revert` brings them back), and links to posts are removed like links to pages. A blog page holding only a query block (Tracy Base's Blog, not
  `page_for_posts`) does not drag posts with it. `timings.postsHidden`, `timings.linksRemoved` (replacing `linksMoved`).
- **Joomla, articles:** when the menu item of an unticked page is a listing (`view=category`), every article of that category and its
  subcategories is **unpublished** (`state: 0`) in the same transaction as the menu item (`joomla-articles.js`); when the item is an article
  (`view=article`), that article likewise. An article **stays** when a live page still shows it: another menu item listing its category
  (or a parent category), an item pointing straight at it, or a live featured page where the article is featured. Already-disabled articles are not rewritten. When the site
  refuses to remove a menu item, its articles stay. `timings.articlesUnpicked`.
- **Joomla, buttons: REMOVED, never redirected to Contact** (since Claude Cowork for Joomla 0.24.4). A Joomla button's link is a contract
  slot; the component only allows emptying a link slot whose layout it **has approved** (`lib/link-layouts.json`, by the sha256 of the
  ACM file), and `inspect` marks that slot `emptyLink`: `hidden` (the button disappears) or `plain` (the text stays, the link goes). `takeLinksOff` in
  `joomla.js` sends the marked slots in the `empty_links` of a `content.contract apply` run; a slot **without** the mark (layout not approved,
  or a component older than 0.24.4) is **left as is** with one sentence saying so ("cannot be taken off on this site's layout"), no
  redirect. Approved: the layouts of Tracy Business j6 1.2.1; JA Phio (whose hero always prints `<a href="">`) not yet, its buttons stay.
  `timings.linksTakenOff`, `timings.linksLeft` (replacing `linksMoved`). `apply.revert` brings the links back.

**One rule for cutting, no per-template lists:** *a block the customer's words have not reached is cut, when it is only stored
text.*

- "not reached" = no line Apply just wrote lies inside one of its **named** blocks (`metadata.name`, the only kind a slot can name);
  a part with one written line belongs to the customer even if template text remains around it (left as is). Raw HTML blocks have no name, so they are never
  counted as "reached", even if one of their lines happens to match a written line ("What we offer", "Production").
- "only stored text" = no menu, query, form, search box or identity token (`{contact.phone}`) inside. A block with something live
  is entered: only multi-line static parts are cut (the "Marketing kit" and "Recent projects" columns of the mega menu; the "Services" column
  of the footer), while a lone heading beside a live block is its label and stays. A single line is not a block worth cutting: it is left for the
  "say it again" layer below (except raw HTML, where nobody can say it again).
- **Order: cut first, then say again.** A column heading the "say it again" layer had just rewritten once made a whole menu column count as the customer's and kept
  the list of demo projects in it (measured on run 5); so cutting runs on the contract text already written, and only then is the rest said again.
- ~~The template's own demo pages are hidden; the model also judges which business pages are not needed~~ (dropped 08/10/2026, see the box above): the template's own
  demo pages (named by no contract slot, holding text) **stay as they are**; the model only renames menu labels naming things the business
  does not do ("Book a site survey" → "Contact us"). Only pages the customer unticked are hidden (`draft`); links to them are removed from every
  menu, including translations. Pages of a secondary language edition are recognised by suffix (`about-vi`, `vi` for the home page) and cut according to the text written
  into that edition itself.
- A page that would lose ≥75% of its parts is **left as is with a note** (that is the site owner's business, not a bug to fix silently). A body that cannot be read
  is never edited; not one byte is rebuilt — only the block's span is cut (`wp-blocks.js` does not serialise).
- **Duplicate keys**: the contract uses 15 keys for several blocks (`about.text.heading` is the page title, "Where we work" and "Safety"), while the plugin
  only writes the first block. The planner sees one key per block (`about.text2.heading`…); the first block is written through the contract as before, the later blocks are written
  by name-and-order through the open door. Before, the first block received the answer of whichever batch spoke last.
- **Second chance**: a slot the first run left *pending* or that was blocked for an invented fact is asked again **once** ("write a line stating no
  fact, or say plainly that there is none") — lines that are only interface ("01", "View all →", "Contact") are not asked. A line the model still
  cannot write honestly gets **its block removed** (only when the block still holds exactly the template's text), instead of carrying another company's name. **At most 30** blocks
  are removed per Apply run (`MAX_DROPS`), in this order: lines naming the template's company (the sample of the name/`legalName` slot in the contract), then lines the
  model says need facts nobody gave (people, clients, certifications — someone else's), then lines that only repeat the template's own facts
  (§6), then the rest; lines beyond 30 keep the template's text with a note. Before 05/10/2026, over 30 meant **no block was removed**: with
  the new guard (§6, L09) a fact-heavy template would have kept everything.
- **Text no slot names** (a heading, the sidebar's newsletter promise, the text and placeholders of a Contact Form 7 form): each line of an ordinary
  block — unnamed, not raw HTML, not live — becomes a slot of a map built from the page itself (`wp-leaves.js` — what the
  plugin calls a derived contract, built on this side because the plugin only derives at import time), for **the seeder's planner** to write (batched, language-checked,
  fact rules, `guard.js`) and then written back into the very block holding that line, found by its text. Forms only change the text between tags and shortcodes and the text
  in `placeholder`; fields, field names and order do not change; a field that only that line had (the drawing-attachment box) goes with it, and the consent wording
  becomes a plain sentence citing no law. The theme's other parts (`sidebar-news`, `sidebar-article`, `sidebar-search`) go the same way
  as header and footer; writing a part that has no row in the database yet creates an override record.
- Soft errors: a refused write loses only that change (the note says so); if the model does not answer, nothing is removed.

Measured (stand, Tracy Business, bakery, 8 real Apply runs): compared with a "later" site on the same template, across the 6 pages the customer can open, the number of long lines
(≥18 characters) still exactly as in the template dropped from 9–10 per page to **0**, except two lines: the "Attaching drawings…" note inside the raw HTML of
the Contact page, and the News page title printed by the theme's **template** (the text-writing door cannot edit templates). The demo company's words
(Vorsino, Elektra, Lipetsk, Obninsk, Zavolzhye, Kaluga, Moscow, Northgate…) dropped from 9–18 times per page to 0 on every page. It adds
**3–5 s** after the site is up (9–15 blocks cut, 7–8 pages hidden, 6–27 lines said again).

### 8.2. Joomla: modules holding only another company's facts, and what was tried (measured 03/10/2026)

Joomla Tracy Business left 64–83 slots per site still holding demo text: ISO 9001:2015 and NAKS certificates, "built since 2004", five leaders
with titles, five client logos and names, three number strips ("380+", "1,240", "22 years"). They are all evidence-requiring slots
(`requiresEvidence`): the planner accepts a value for this kind of slot only when it is **a verbatim excerpt of the brief**, so the model got through
the gate by pasting the customer's whole description in (the "Safety" part and the About page's lead read "Golden Crust Bakery, 12 Hang Bac,
Hanoi. … Call 0912 345 678 … Open 6am-8pm every day"), while the figures stayed next to new labels ("380+ fresh bakes daily" — an invented
claim). A Joomla contract cannot empty a slot that already has text ("Content cannot remove an occupied slot").

- Three things done (`joomla.js`, `joomla-modules.js`): (1) an evidence-requiring slot's value longer than 90 characters is dropped — evidence is a phone
  number, a year, a name, not a whole description; (2) the six modules of `tracy-business/j6` in which **every** text line requires
  evidence (team, certificates, clients, the three number strips) are **unpublished** through the open door (`content.update {kind:'module', fields:{published:0}}`,
  ADR 0022) after the text is written, including the secondary-language copies (found by title), and none of their slots is written; one `apply_id`,
  so `apply.revert` brings them back. Only for designs whose demo is another company's facts (`FACT_MODULE_DESIGNS`): `tracy-base` is
  Tracy's own template, its evidence-requiring modules are whole sections of the page and are **never** removed (a test holds that);
  (3) Joomla's contract write is all-or-nothing: one slot the plugin refuses loses all the text (measured: two slots "Content cannot activate an
  empty slot", 500 lines not written). Now a refused slot is named, set aside, and the write is retried, at most 5 rounds; a slot the template leaves empty
  is never written.
- **Tried and dropped:** asking the model a second time for evidence-requiring slots (as in WordPress). Asked for the numbers too, the model returned `null` for 34/45 lines (people's
  names, certificates, figures — exactly the things with no honest replacement line), so it is not worth an extra call.
- Measured (bilingual run, full description): 12 modules removed (6 en + 6 vi copies), 5.1 s; the en and vi About pages no longer contain "Kulagin / ISO 9001 /
  380+ / NAKS / since 2004". Limit: the contact module's "office" row mixes written slots (the customer's address) with demo slots (Lipetsk, phone
  +7…), so the module is not removed and the demo row remains; removing one row requires editing the module's `params` JSON, not done yet.

### 8.3. What the customer typed must reach the site (measured 03/10/2026)

A full description (201 characters: name, street address and city, phone, email, opening hours, products, "English and Vietnamese") was
run on all three CMSs and each item checked on each page. Two places where it **did not arrive** were found and fixed:

- **The street address** was never read out (only phone and email): `normalizeBrief` now also reads `address` (the model reads it, and only when the answer
  appears verbatim in the customer's words), putting it in the `contact` line; WordPress places it in the `identity.contact.address` slot (through
  the seeder's `inputsFromSite`), Joomla and EmDash through the contact line as before.
- **Opening hours** are written by hand (WordPress, source edition, when the customer writes in English) or into the EmDash tool's new `hours` slot
  (`{hours}` instead of the delete rule; with no hours it still deletes, rather than leaving the demo's Moscow hours). In other editions the model says it in that language.
- A related EmDash bug: the house number "12" stuck to the phone number ("0912 345 678 12") because the tool read the phone as the longest run of digits and
  spaces; the address now comes first, separated by a semicolon, which no phone number contains.

Result after the fixes: name, address, phone, email, opening hours, products and city are present on every checked page on WordPress, Joomla
and EmDash, both `/` and `/vi/`. Not done: social-network links typed in the text (no slot accepts them on any of the three CMSs).

Details worth remembering:

- **The model's thinking is off** (`seed-model.js`): DeepSeek with default thinking poured all 8192 tokens into reasoning, took
  32 s and returned **an empty answer**, so the planner thought every slot was "pending" and the site kept the template's text; with
  `thinking: {type: "disabled"}` the same call took 2.6 s and returned valid JSON. Each provider is asked for no reasoning in
  its own way; a provider that rejects the parameter (400) is asked again without it.
- **Concurrency 8** (measured 03/10: 8 concurrent calls all answered; with 16 concurrent calls 4/16 batches were unusable). The level 8 is
  for **the whole process**, not per Apply run: many customers clicking Apply at once share one queue
  (`TRACY_SEED_MODEL_CONCURRENCY` raises/lowers it); the waiting falls within the site install, so the customer does not see it.
- **Joomla**: the plan is built from a static `content-map.json`, checked against the site once it is up: a slot the site no longer has, or a slot someone
  edited since shipping, **is left as is**.
- **WordPress**: the plugin accepts only **one writer at a time** (`writer_busy`), so images are uploaded *after* the demo cleanup, sequentially;
  `media.upload` does not change the revision.
- **EmDash**: the tool runs as a child process with **its own environment** (not one secret of this process leaks
  in), the site's agent token taken from the host (`/_host/agent-token`, written to a temporary 0600 file), talking to the site only over HTTP.
  The template only serves locales that have a published `site` entry, so `--hide-chrome-only` is enough to "hide" a locale nobody asked for.
  The three templates ship **the same** `personalize.mjs` byte for byte (`test/emdash-tool.test.mjs` keeps them equal; the gate
  `emdash-kit-sync` keeps the kit copy).

### 8.4. Further cleanup: form mail, social networks, menus, menu labels and many sites at once (measured 03/10/2026, after #780)

Three test sites run at once (WordPress, EmDash, Joomla Tracy Business; a 237-character description: name, street address, phone, email, opening hours,
products, Instagram and Facebook links), then a scan of **both text and HTML attributes** (`mailto:`, `placeholder`, form targets) and a read of every
record through the open door. §9's keyword count does not see the following, because they are not text shown on the page:

- **Form mail going to strangers.** WordPress: every Contact Form 7 form sends to `[_site_admin_email]`, which the host leaves as `admin@example.com`, so
  mail from visitors using the form reached nobody even though the customer had typed an email. Joomla: the contact record kept `email_to: sales@northgate-ind.ru` (the demo
  company's mailbox) and the phone `8 800 550-67-90`. EmDash was already right for the contact form (`notifyEmails`), but the **newsletter** form still sent to
  `sales@northgate-ind.ru`, and `tracy-saas`'s contact form to `hello@helix.dev`. Fix: WordPress writes the `_mail` `recipient` of **every
  published form** (`wp-forms.js` `mailTo`, a step in `sweepWordPress`; reads in parallel, writes sequentially because the plugin accepts one writer at a
  time); Joomla writes the contact record's `email_to` and `telephone` in the languages visitors see (`joomla-tidy.js` `contactSteps`); EmDash adds
  a `forms` rule for `newsletter` (business) and `contact` (saas). **Written only when the customer typed an email (or phone)**: otherwise nothing is
  touched, per the rule "only write what people actually said".
- **Social links typed in the text.** `socialLinksIn` (`brief-normalize.js`) only accepts links the customer typed (facebook, instagram, linkedin, tiktok,
  youtube, x/twitter, telegram, zalo), one link per network, never built from a name ("Instagram @goldencrust" creates no link).
  WordPress: the contract's `identity.social.<network>` slots (type `url`, source edition: identity belongs to the site, not to an edition); the
  Contact page and footer show linked cards. EmDash: the tool accepts `answers.social`; the identity rule `from: "social"` with `item` says which
  parts each list element has (business: `name/handle/url/text`; base: `platform` chosen among six networks + `url`, and
  `contact.social` is `label/url`; networks the field does not hold are dropped). With no link typed, the list is still **emptied** as before.
  **Joomla has no slot that accepts them**: the contact module's `social-url` slots are empty in the template and the contract does not allow turning on an empty slot.
- **Joomla: the template company's menus** (`joomla-tidy.js`). ⚠ Since 08/10/2026 the judge **removes no item** any more, it only renames (the box in §8.1); what
  follows is history. After the text was written, the top bar still advertised "Careers" and "Investors" on every page,
  "Investor relations" opened a page headed by a stock ticker, and the "Resources" menu led to the template's marketing kit (email templates, form
  library, slides, style guide, error pages). What was done: read the menus **after** the contract write (the footer labels are already the customer's), group by title,
  drop ordinary titles (home, about, services, contact, privacy…), ask the model once (`temperature` 0, asked again once if the answer
  is not JSON) and unpublish every item carrying such a title in the visible languages, **in one transaction** (`content.batch`, falling back to record by record
  if an old plugin lacks it), in the same run as the contact record. The judge has a second job: an item naming the template company's services (the
  footer's "Services" list, when the contract cannot rewrite it) is **renamed** from the customer's description (≤ 40 characters, no phone,
  email, price or year the customer did not give), not hidden. One measurement showed the model asking to hide **all 15 items** (including four service items still carrying demo names)
  and the "no more than 80%" cap refusing, so nothing was removed; now an overreaching answer is put back once with a note ("you hid N of M items…"), at most
  three rounds, and only if the last round still overreaches is the whole plan dropped and said out loud. Reading and asking the model run in parallel with the
  language-hiding step (the longest step), while the write comes **before** creating secondary languages so the derived edition copies the cleaned version. Only for
  `tracy-business/j6` (`FACT_MODULE_DESIGNS`): `tracy-base`'s menus are its own.
- **Joomla: the contact form's consent sentence** (`joomla-tidy.js` `findConsentPlugin`/`setConsentNote`). The line "I consent to the processing of personal data
  under Federal Law 152-FZ" is a **language string** (`PLG_CONTENT_CONFIRMCONSENT_FIELD_NOTE_DEFAULT` in the template's `language/overrides/en-GB.override.ini`)
  that no door can write; but the "Content - Confirm Consent" plugin reads its own parameter `consentbox_text` **before** that string, and
  plugin parameters can be written through the open door (`content.update {kind: 'extensionParams'}`). Apply sets this parameter to a sentence citing no law ("I agree to my
  details being used to reply to this message.") for `tracy-business/j6`, unless the site owner has already written their own text. **One English sentence for every
  language** (one parameter, not per language). At first this document wrongly said "no door can change it".
- **EmDash: menu labels and form text** (`emdash-menus.js`, `personalize.mjs`). The tool deletes menu items of pages it hides but has no renaming
  step: the footer still read "Industrial park infrastructure … Maintenance & retrofit". The engine asks the model one question **while the site installs**
  (the template's menus per language + the customer's description), receives a list `{menu, language, old label → new label}`, checks it (≤ 40 characters, no
  phone/email/price/year the customer did not give, only labels the model was shown, `FACT_RULES` attached) and renames through `PUT /_emdash/api/menus/:name/items/:id`
  after the tool runs. Forms: the call writing form text only received the business's **name**, so the model copied the demo's examples ("Ivan Petrov",
  "Construction quote", "Federal Law 152-FZ"); now the prompt carries the customer's description too, and the `forms` rule adds `name` (placeholder text "Your name") and
  `consent` (a simple consent sentence citing no law).
- **EmDash Tracy Business: the Careers page hidden** — ⚠ **superseded** by Akemi's decision of 08/10/2026 (the box in §8.1): the map's `hide` is now empty,
  Careers stays. History: (`seed/personalize.json` `hide`, David's decision of 03/10/2026 following recommendation B). The page the tool
  rewrote was still another company's recruitment page: "Open roles" (two positions the model wrote from `vacancies`), "What we offer" (benefits) and a hiring
  process ("Send your details → Trial shift → Decision"), all claims about a business that is hiring, which the customer never said. A `hide` rule
  like the Investors one unpublishes the page (not deletes) and every menu item pointing to `/careers` (top bar and footer), while links on other pages change to `/contact`;
  the 404 page's suggestions follow too. WordPress and Joomla already hid Careers (the judge), so this was consistent across the three CMSs. **Impact on Build:** the
  rule lives in the same file as the agent's Build, so Build no longer builds a Careers page by default either; the site owner asks the agent to add it back when there is a job to post.
  **A tool bug surfaced when adding this rule:** the `hide` step unpublishes the page, but the `copy`, `blocks` and image steps running afterwards wrote into the entry
  and **published it again** (Careers came back to life right after its menu was removed; Investors did not, because no write rule touched it). Now the set of hidden entries is built from the
  rules themselves (not from the report, since a repeated run sees the page already hidden and skips the removal step) and the other three steps skip them: no model call, no image, no write. Only `tracy-emdash-theme-business`; `base` is Tracy's own template.
- **EmDash: the `value` of form options** (`personalize.mjs`). The tool renamed option labels ("Cake order") but kept the demo's `value`
  ("Construction quote"): `value` is what the submission stores and mails, so a visitor choosing "Cake order" sent the site owner "Request type: Construction quote". Now
  `value` follows the label, and a list of 2–8 options is trusted even when the count differs from the demo's (before, a different count dropped the whole answer, so sometimes the form
  kept the demo text). Test: `personalize-apply.test.mjs` (the kit, copied into the three templates).
- **WordPress: page titles and subtitles** (`wordpress.js`, `wp-residue.js`). The News page title "News & engineering notes" is not in the
  template but in the **page meta** `tracy_page_heading` (the theme's `home.title` filler reads it before the title), and the sentence "Project updates, corporate
  disclosures…" is the **page excerpt** (`post_excerpt`); both can be written through the open door (`postmeta`, `post`). On every kept page these two are read,
  said again like other lines (in the same model run) and written back in place; hidden pages are skipped. Other pages' meta (About: "Building Russian
  industrial infrastructure since 2004") is not printed in the page body or `<title>`, but is rewritten too. At first this document wrongly said it could only be changed
  by a new theme version.
- **WordPress: a site that has not returned its page list yet** (`wordpress.js`). An empty page list means the site has not answered, not that it has nothing to
  judge: it is read again once after 1.5 s, and if still empty this is said ("the site listed no pages") instead of judging an empty list.
- **WordPress: sentences inside raw HTML** (`wp-leaves.js`, `wp-blocks.js` `htmlRuns`). The Contact page's hint line ("Attaching drawings lets us
  give you a far more accurate take-off") lives in a raw HTML block, which the line-restating step skips. Now a sentence in a raw block left after
  cutting (≥ 12 characters, with letters, no token, shortcode or interface label) is also a "line" and is said again in place: only the text between two
  tags is replaced (escaped), never deleted; a line with no replacement text is left as is. Remaining on one site's kept pages: 6 raw lines
  (Careers 3, Contact 3).
- **WordPress, Joomla: pages the customer did not choose** (`picked-pages.js`, the product owner's decision of 05/10/2026, bug ledger L04). The customer chose Home,
  Product, About, Contact while Services and News still opened. Now, once the customer has answered the `pages` question, a page whose **own address** (WordPress
  slug, Joomla menu-item alias) names **one** kind the customer did not choose is removed: every word of the address must point to the same kind
  (`services`, `our-services`, `about-us`, `news`/`blog`, `pricing`/`prices`, `products`/`shop`), so `company-news`, `products-and-services`
  or an alias in another language names no kind and **is left as is**; no guessing from the title or the template name. Words shared with
  other trades are not read (a restaurant's `menu`, `plans` as drawings). Home and Contact are never removed. **Products and services stand in for
  each other**: if the customer chose Product and the template only has Services (or the reverse), that page stays with no note. Another kind the customer chose
  that the template has no page for is **stated in a note** ("this template has no pricing page, so none was made") — **only when every page's
  kind could be read** (an `our-story` page may well be the About page; a guessed note is worse than none) — and not created. WordPress: those slugs go into the cleanup step's hidden set (`sweepWordPress` `unwanted`; the page becomes a draft, its translations follow, links in pages
  and menus are removed, see the 🔒 box at the start of §8.1), `timings.pagesUnpicked`; contract slots of a page that will be removed are **not planned** in
  `prepare` (fewer model calls), and that page is always removed whatever the page list says at cleanup time (its text was never written). Joomla
  does not skip like that yet: tying contract slots (articles, modules used on several pages) to menu items needs the presentation lock, which is neither cheap nor certain. Joomla: `component` menu items visible to visitors, and the items under them (unless
  a page the customer chose sits under them: left as is and said), **never in system menus** (`tb-system`, `mainmenu`, as with the judge) and **never
  the Home item**: `content.list` has no `home` column, so each item about to be removed is read in full (`content.get`); an item saying `home: 1` or
  one that cannot be read is left as is (along with its branch); a removed item is not renamed in the same run; an unreadable menu gets a note.
  Unpublished within the cleanup step's transaction; alias items leading only to them follow
  (`strandedMenuItems`), `timings.menuUnpicked`; runs also for designs without a judge (`tracy-base`).

**Many sites at once (before and after measurements).** Three sites at once, version #780: WordPress's judge step **hid no page and renamed no label**
(Careers, Investors, the project page "Elektra appliance plant, Lipetsk SEZ" and "Book a site survey" intact), `kept` 10 instead of 4, 20 blocks
dropped instead of 0, two lines refused by the plugin, and **no note** saying so. Run alone, the judge was always right (40/40 times, 0.8 s each; 14 times
at once also right), so it was not the model's fault; when WordPress came up, the shared queue was nearly empty (the EmDash tool calls the model directly, not
through the queue). **The exact cause was not found and could not be reproduced.** What was done is to block every remaining possible cause and make every failure speak up:

1. **A priority lane** (`seed-model.js`): calls made after a site is up (judge, text lines, secondary languages, Joomla menus) go ahead of calls still preparing
   for other sites (`model.urgent()`; the shared queue has two lanes).
2. **A sturdier judge** (`wp-residue.js` `judgeSite`, `shared.js` `jsonObjectIn`): `temperature` 0, extracting **the first complete JSON object**
   (not from the first `{` to the last `}`, which reads two objects or a note with brackets as one non-JSON thing), asking again once,
   and if it still cannot answer, **saying so** ("the template's own pages could not be judged") instead of staying silent; a broken judge no longer drags
   down the other text lines of the same run.
3. **Empty answers are asked again** (`seed-model.js`): an exhausted reasoning budget or a filtered answer returns empty `content`; now that is a retry (counted in
   `usage().empty`), and only when every attempt is empty is it an empty answer that the planner reads as "pending".
4. **`normalizeBrief`** reads the first JSON object instead of cutting from the first `{` to the last `}`.

After the fix, the same three-site scenario: the judge hid 3 pages and renamed 2 labels (`judgeHidden`, `judgeRelabelled` in `site_brief.timings`), `kept` 0,
0 blocks dropped, seven reachable pages and **0 demo words** on WordPress.

## 9. Measurements

**How measured.** The dev machine (Docker Desktop on a Mac: one host, one tracy-web, Postgres; a real DeepSeek text model; the image model a
**stub**, so images arrive instantly), 03/10/2026, **the final code**. Each run creates a site through the same door the wizard uses (`POST /api/sites`, then polling
`jobs/:id` until `done`), deletes the site, next run; `later` and `apply` **alternate**, the machine quiet (before measuring I deleted all my test sites: an
EmDash run was killed by Docker for lack of RAM with 45 containers still around, and Joomla numbers measured while tests ran in parallel were discarded). The last column is *when the poll said
`done` minus when the host reported done*: exactly the part Apply adds, less noisy than the total because the host's install time varies (±3 s WordPress, ±3 s
EmDash, ±1 s Joomla in this batch). Template: Tracy Business — the default card of Add site, and the card Design inspiration pushes into the wizard.
Text box: "Golden Crust Bakery is a family bakery in Hanoi selling fresh sourdough, croissants and made-to-order cakes." + goal
`sell` + style `friendly` (the same text as earlier measurements, to stay comparable).

**Tracy Business, text box naming no language (one language: English)**

| CMS | I will do it later (s) | Apply (s) | Difference | Added after the host reported done (s): later → Apply |
|---|---|---|---|---|
| WordPress | 47.8 · 50.9 · 49.8 → **49.5** | 54.8 · 52.7 · 56.8 → **54.8** | **+5.3 s (+11%)** | 0.6 → 6.5 |
| EmDash | 27.9 · 23.9 · 21.8 → **24.5** | 26.7 · 32.1 · 26.7 → **28.5** | **+4.0 s (+16%)** | 0.7 → 6.5 |
| Joomla | 136.0 · 136.9 → **136.5** | 159.8 · 157.8 → **158.8** | **+22.3 s (+16%)** | 0.6 → 23.0 |

**Tracy Business, text box asking for "English and Vietnamese"** (one run per CMS)

| CMS | later (mean above) | Apply (s) | Difference | Added after the host reported done (s) |
|---|---|---|---|---|
| WordPress | 49.5 | 60.8 | +11.3 s (+23%) | 10.0 |
| EmDash | 24.5 | 55.3 | +30.8 s (+126%) | 34.4 |
| Joomla | 136.5 | 190.4 | +53.9 s (+39%) | 49.7 |

**What Apply adds after the site is up** (mean, one language): WordPress 6.4 s, of which **leftover cleanup 2.9–3.0 s** (§8.1: reading pages,
parts, menus, forms; cutting, hiding, saying again; 9–15 blocks cut, 7–8 pages hidden, 6–27 lines said again); EmDash 4.0–4.3 s (the tool writing again with every model question
already answered); Joomla 33 s, of which ~15–18 s overlap the host's last step, **hiding the `ru-RU` edition ~18–24 s (the plugin's work)**,
removing fact modules 1.7–1.9 s (12 modules and 5.1 s with an extra language), demo cleanup 4–7 s, writing 3 s. "Prepare" (model, images; no site needed)
runs while the host installs, so it does not count as waiting unless it takes longer than the install: WordPress 3–5 s (8–9 calls, ~19k tokens), EmDash ~19 s
(~50 calls), Joomla 9–11 s (25–26 calls, ~150k tokens). **Bilingual:** EmDash prepare 46 s (84 calls) **is longer than the install (21 s)** so
it adds waiting; Joomla adds the `vi-VN` derive, ~21 s.

**Old figures, before the cleanup and the address/opening-hours recognition** (same day, a busier machine so a slower host): WordPress +1.9 s (+3%),
EmDash +3.4 s (+11%), Joomla +26.9 s (+14%). The WordPress cleanup adds ~3.5 s; the absolute figures are lower in this batch because the host was faster
(WordPress 49 s versus 61 s, Joomla 136 s versus 195 s) with the machine quiet and no leftover sites.

**Content comparison, apply versus no apply** (same template, same text; long lines ≥18 characters still exactly as in the template, counted on the pages
visitors can open): WordPress 9–10 lines per page (mega menu, project list, history, certificates, the footer's service list) → 0, except
the two lines in §11; demo pages that can be opened 20 → 7. Per-CMS results are in the PR's "comparison" table.

**Design inspiration with another template** (card `tracy` = Tracy Base, one run per box). Joomla: Apply wrote 254 slots in 2.1 s
(init 134.5 s versus later 158.3 s — the negative difference is install noise, not Apply). WordPress: **Apply could write
nothing**: the `tracy-base/wp7` 1.1.1 release runs Cowork plugin 0.17.1, which did not yet carry the 1.1.1 profile, so the site was not bound, the plugin returned
"No content contract is configured…", Apply failed softly and `error` then said *this site is not bound to its template’s
content contract (the Cowork plugin on it does not carry that template’s profile)* (init 47.8 s versus later 50.9 s).
Since L29 (05/10/2026) that sentence no longer names a cause: *this site is not bound to its template’s content contract, so it keeps
the template’s words*. The door's refusal only says the site is not bound, not why, and the measured causes are more than one —
on a `ja-kinetic/wp7` site, plugin 0.17.4 DID carry the profile but the bind returned empty. The cause is in the `!!` line of the
provision log (`tracy_wp_bind_contract`), which now includes curl's exit code and HTTP code.

**Early start** (Joomla, `TRACY_BRIEF_EARLY_START`). The "off" measurement was cut short because the Mac went to sleep, so there is no direct A/B figure;
these are the figures of the ON runs on a quiet machine. The write starts while the host is still in its last step `building the site folder` (run `a2`:
180 s → 198 s); from the early start until the host reports done takes 14.9 · 16.8 · 18.3 s, i.e. the host's last step is **not slowed down** (normally
16–19 s). Apply needs 37.5–39.1 s, so ~15–18 s overlap and 22–23 s remain after `done`; with it off, all 37–39 s
come after `done`. When the machine is busy (the first bilingual run, while I ran tests in parallel) the last step stretched 17 → 51 s and `demoTrim` from 4 s
to 50 s: overlapping on a busy disk may not pay, hence the off switch. It cannot start any earlier: the content door
only opens after the step `template Cowork pairing verified (sealed by …)`, just 1–2.5 s before the host's last step.

**Final check on the final image** (the machine was busy then, so not used as comparison figures): WordPress bilingual — `/` and `/vi/` have the same 3 freshly drawn images (the version running then drew 3 images; now 6),
the second write for the secondary languages' images 0.4 s, no error notes; EmDash bilingual — warm-up 42.6 s, writing 8.5 s, `/vi/` in correct
Vietnamese; Joomla single language — ~17.5 s added after the host reported done (hiding editions 17.9 s: the machine was faster then than in earlier runs).

**Not measured:** a real image model (latency and cost; the stub returns images in a few tens of ms), a Linux host (Docker Desktop on a Mac is slower
at Joomla's DB writes), many customers clicking Apply at the same time.

### 9.1. After the further cleanup (§8.4)

Same method, same one-sentence text, **alternating** `later` and `apply`, two runs per CMS, on a machine slower than in the morning (`later` WordPress 69.6 s instead of
49.5 s, Joomla 189.4 s instead of 136.5 s), so what is worth comparing is **what Apply adds**, not the total:

| CMS | I will do it later (s) | Apply (s) | Apply adds | After the host reported done (s): later → Apply |
|---|---|---|---|---|
| WordPress | 70.7 · 68.5 → **69.6** | 73.0 · 77.2 → **75.1** | **+5.6 s (+8%)** (before: +5.3) | 0.6 → 9.9 |
| EmDash | 36.7 · 31.4 → **34.0** | 36.4 · 38.6 → **37.5** | **+3.5 s (+10%)** (before: +4.0) | 0.8 → 7.9 |
| Joomla | 196.0 · 182.8 → **189.4** | 219.4 · 214.2 → **216.8** | **+27.4 s (+14%)** (before: +22.3) | 1.8 → 35.3 |

The added part changes little: the Joomla cleanup step writes in one transaction taking 0.4–0.5 s (`tidyMs`), the menu judge and contact-record read run in parallel with the language-hiding
step; the extra ~5 s on Joomla goes with a slower machine (the plugin's `multilingual.retire` step 25.7 s instead of 19.2 s). Three sites at once,
with the same information-rich text (address, phone, email, hours, Instagram and Facebook links): WordPress hid 3 pages, renamed 2 labels, 0 demo words, 7 reachable
pages; Joomla removed 17 menu items, 8 reachable pages, 0 demo words.

## 10. Decisions needed (from whoever assigned the work)

1. **Default language.** A customer naming no language → **English**, not the language the customer typed in. To "follow the language
   the customer typed in", edit `brief-normalize.js` (`writtenIn`) — one line, but it adds an edition for every customer typing in Vietnamese.
2. **No inventing** (the Apply path) versus *invent and flag* (the seeder's default, Lee 23/09). Apply currently chooses no inventing.
3. **Templates without a contract** (§11): turn the popup off for them, or hand the brief to the site's agent as its first message?
4. **Joomla languages that must be derived** cost ~34 s on the critical path (plus ~6 s to hide again): keep (the site has every language when delivered) or add after
   delivery (the site arrives on time but lacks languages for ~40 s, and the agent may start writing at the same time: `writer_busy`)?
5. **Early start** is ON by default (§9 has on/off figures). Turn it off with `TRACY_BRIEF_EARLY_START=off` if a real host shows
   its last step slowing down when writes overlap it.
6. **EmDash draws ~13 images** (the template tool's own image set), WordPress/Joomla 6: with a real image model, EmDash's warm-up may
   exceed the install time (29 s). It needs a measurement with a real image model before choosing: keep 6, limit to 3, or drop missing
   images once the site is up.

## 11. Known limits

- **Images are only checked with a stub** (`tracy-picture-stub`, 4 fixed JPEGs): the draw → crop → upload → write path has really run on all
  three CMSs, but **the latency and cost of a real image model are not measured** (production needs `OPENROUTER_API_KEY` or the `seedImage` door).
- **Leftovers outside the contract** (measured 03/10/2026, bakery description): removed on WordPress Tracy Business (§8.1, §8.4), on Joomla Tracy
  Business at the module and menu level (§8.2, §8.4) and on EmDash at the menu-label and form-text level (§8.4). What remains, known:
  **WordPress** — secondary language editions only get blocks cut and pages hidden, not yet their own duplicate keys, single lines, titles or page excerpts; the category chips of the News page ("Company / Disclosures / Engineering", with the demo's post counts) are printed by the theme from the taxonomy. **Joomla** — the contact form's consent sentence is one English sentence for every language (§8.4); the contact module's Lipetsk "office"
  row (the module mixes written and demo slots) seen in the morning run, not in the afternoon run. **EmDash** — 40 language routes
  return the same page; the paths of rewritten demo entries (`/projects/elektra-lipetsk`, `/news/…-kaluga`) still carry the demo's slugs (changing slugs
  breaks references); the `department` taxonomy, news categories and image captions
  ("Team / engineers photo") are still the demo's. **Joomla** — social links typed in the text have no slot to take them (WordPress and EmDash can place them, §8.4). **All three** — only 6 images are replaced (other demo images remain).
- **Templates without a contract** (24/30 Joomla releases, 6/8 WordPress releases) keep the demo text: the popup is hidden for them. Making Apply run there needs
  a general engine: either the plugin *derives* a contract when provisioning the site (currently `CONTRACT_OPERATION_PROVISION_ONLY`, only for imported sites),
  or a "bulk text replacement" version on the open surface (`content.list/get/update`; the text-replacement engine of `tracy-site-tools` already reads the rendered
  page and replaces exactly the stored value, but one pair per command). Both touch the host/plugin.
- **Tracy Base on WordPress (1.1.1)** cannot yet be bound with Cowork plugin 0.17.1 (the plugin only carries profiles 1.0.0 and 1.1.0), so
  Apply on the `tracy` card on WordPress fails softly. The site-creation door only knows "the repo has a profile", not whether the plugin on the site
  carries that profile.
- **`site_brief.error` notes are not shown to the customer yet**: they are only in the DB and logs.
- **Early start relies on the host's step label** (`building the site folder`): if the host changes the wording, only the optimisation is lost, not
  correctness (the `done` poll still starts the write).
- The copy of `personalize.mjs` in this repo has changed (the flags `--hide-chrome-only`, `--concurrency`, `noThinking`, the `hours` slot, and in §8.4 the function
  `socialFrom`, the identity rules `from`/`item`/`networks`, the form prompt carrying `about`): the matching PR to JoomlArt's template
  repo **is open: `JoomlArt-Products/tracy-emdash-template#15`** (not merged); until it lands on `main`, the next kit sync will still overwrite them. The `from` rule keeps `value: []` beside it: an old tool ignores `from` and still empties
  the list as before.

## 12. Running and checking

- Tests: `apps/tracy-web/test/brief-*.test.mjs` (`brief-joomla`, `brief-emdash` with menus, `brief-wp-leaves` with raw HTML…), `site-brief*.test.mjs`, `emdash-tool.test.mjs`, `seed-model.test.mjs`, plus `tests/personalize*.test.mjs` of the three EmDash themes
  (DB-backed: `TEST_DATABASE_URL=postgres://…`), plus `sites-route.test.mjs` for the create/poll door.
- A local fake of the image-model door: `~/tracy-bench-work/picture-stub` (see its README); `deploy/` needs no change.
- Measuring: create sites through the same door the wizard uses (`POST /api/sites`, then poll `jobs/:id` until `done`), compare `Apply` with `later`,
  **alternating** and repeated — the dev machine varies a lot between runs (EmDash "later" 34–55 s, Joomla 187–210 s).
- Three operational knobs, all read straight from tracy-web's environment: `TRACY_BRIEF_EARLY_START=off` (wait for `done` before writing, §2),
  `TRACY_SEED_MODEL_CONCURRENCY` (the whole process's concurrent model calls, default 8, §8) and
  `TRACY_EMDASH_CONCURRENCY` (concurrent requests of the EmDash write run, default 8; warm-up measured with 4/8/12 gave 36/39/43 s, so
  concurrency is not the bottleneck; the model provider's throughput is).
- The image must be rebuilt after changing anything in `packages/` that this module reads (it reads the copy in the image:
  `src/seeder/`, `src/emdash-tool/`, translations).
