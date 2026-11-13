---
description: Building a whole site from one business's data in one click (Build from my business and Website Opportunities demos) — which steps the customer goes through, what the agent does, how to run and score it locally, how to read the check results, and the traps that really bit.
sources:
  - packages/site/tracy-add-site/src/client/from-business.tsx
  - packages/site/tracy-add-site/src/client/from-business-flow.mjs
  - packages/ui/tracy-chat-input/src/client/index.tsx
  - apps/tracy-web/src/opportunities-build/own-site.js
  - apps/tracy-web/src/opportunities-build/agent-demo.js
  - apps/tracy-web/src/opportunities-build/client-demo.js
  - apps/tracy-web/src/lib/wo-revision-choice.js
  - apps/tracy-web/src/sites/agent-demo-inventory.js
  - apps/tracy-web/src/sites/turns.js
  - apps/tracy-host/src/demo-qa.js
  - packages/tools/tracy-site-tools/src/host/site-context.mjs
  - packages/site/tracy-site-tabs/src/host/turn-record.mjs
  - packages/wo/website-opportunities/src/business-reading.js
  - packages/wo/website-opportunities/domain/owner-statement.mjs
---

# Building a whole site from a business

One click: Tracy reads what is public about the business (website, photos, reviews), suggests a template, then the site's
agent builds **the whole site** on that template — name, contact, opening hours, real photos, reviews, menu/services — and checks itself
until it passes. Two entry points share one machine:

| Entry point | Who clicks | Where |
|---|---|---|
| **Build from my business** | the customer, for their own site | `/new/` (the card on the welcome screen) or Add site › step 1 |
| **A Website Opportunities demo** | someone doing outreach, for a place without a website | the Website Opportunities tab › Build demo |

The switch: `site-from-business` (`/ops` › User Interface). Off → neither the card nor the door exists.

## 1. Which steps the customer goes through

1. **The welcome screen `/new/`** — the card *Build it from my business* (shown only when the switch is on).
2. **Find your business** — type the name + city and *Search* (needs the deployment's Google Places key), or paste a
   website/Google Maps link and *Build from this link*.
3. **Research** (usually 1–10 minutes) — under the sentence "Tracy is reading what is public about…" it shows the source being read, the number of photos
   saved, the minutes. Closing the tab or reloading the page and opening `/new/` again returns to the very business being built (remembered in the browser
   for 24 hours, `keptBusiness`).
4. **Tracy suggests a template** — the template name, CMS, why it fits, an image + a description sentence + a demo link if the catalogue has one. The sector
   is taken from Google → the website's schema.org → the business name → the description (`tradeOfWords`); an unclear sector gets the generic
   template (`tracy-business`), never a template made for another sector. *Use this template* or *Choose another
   template*.
5. **The site's chat opens** — the customer's message is just an ordinary sentence; the agent works in that chat (20–40 minutes for
   a site), and the customer watches the site change in the right-hand frame.
6. **Handoff** — the agent ends with a paragraph saying what it did and what remains. The first turn cannot be undone (the card says so plainly: this turn
   built the site; to redo it, delete the site in My sites, and it can be rebuilt right away).

## 2. What the agent does (so you read the log correctly)

`tracy_demo read` (catalogue + `instructions`) → `provision.start/wait` (installing the quickstart) → `plan.read` /
`structure.read` (the frozen inventory) → `plan.save` (the line-by-line plan) → `media.import` (images cropped to fit the slots) →
writing content with `tracy_site` / `tracy_emdash` → `tracy_demo check` (at most **8** times) → fix → check again.

The rules that keep the agent going all the way (all with tests):

- The loop's reminder does not tell a build to "make the smallest change"; importing images, saving the plan and checking count as working
  (`buildsSite`).
- A failed check says how many tries remain and what to fix (`checkAgainNext`); a check with nothing written since the last one does not run
  and costs no try (`changedSinceCheck`).
- A step steered after the turn has closed (the visual check step, the todo reminder) reopens the turn (`turn-record.mjs`
  `reopen`, `openTurn`); a build's turn only becomes stale after 2 hours (`BUILD_STALE_AFTER_MS`). Without these two, every
  write gets `AGENT_DEMO_TURN_NOT_BOUND`.
- A WordPress post's featured image is the postmeta `_thumbnail_id`, not a field of the post.
- A build that stops **without having checked once** is also steered to check (`checkFirstNext`); the visual check step for a small edit
  skips builds (`isBuild`) — the whole site is what a build asks for. A turn closed less than 2 minutes ago is not yet the end
  (`STEER_GRACE_MS`), because a steer at turn-stopping reopens it.
- Image-plan crops: a frame running outside is pulled back into the source image, a one-pixel rounding drift still counts as the right shape; other errors give their
  own reasons.
- No invented prices, dates or numbers the research lacks; with no reviews, the testimonial area carries the facts collected. The site speaks
  in the business's voice, never using the brief's words (collected, research, sample…).
- **Research photos have no captions**: the agent looks at them before placing them through `tracy_demo {operation:"media.look"}` (12 images
  per sheet, numbered with ids), so the croissant photo goes on the croissant item rather than a photo of tables and chairs.
- **A block the page uses twice** (the same pattern, duplicate slot names) is only reachable the first time through the contract; the later one is written by
  position (`content.get … outline:true` → `content.update … blocks`).
- **The EmDash contact form** changes its text through `tracy_emdash form_list` → `form_words` (labels, hints, choices of the same count, the submit
  button). The form must still submit: never replaced with text or code. WordPress (Contact Form 7) and Joomla (Joomla's contact
  form) need no separate door.

## 3. The checks and what they mean

| Check | A failure means |
|---|---|
| `no-demo-pictures` | template images remain (decorative images, small icons, PNG backgrounds do not count) |
| `no-demo-words` | template text passages remain, or the template's category/tag names |
| `facts-from-brief` | a figure/hour/phone number contradicts the research |
| `cta-real` | a dead button, a button leading outside or to the demo's table-booking service |
| `collected-used` | a collected name/phone/address/hours/review/photo is missing |
| `native-structure` | record counts, ids, publishing, paths, relations differ from the frozen inventory (changing text, links, images, showcase page names is allowed) |
| `looks-finished` | the AI eye sees visible faults in desktop/phone screenshots |

All passing → `needs-review` (a person reviews it). Still failing after 8 tries → `failed` `QA_NEEDS_REVIEW`; the site remains, and the customer
can keep messaging in the chat.

## 4. Trying it locally

Stand: [`running-tracy-locally.md`](running-tracy-locally.md). In addition, for this:

1. Turn on the `site-from-business` switch (`/ops/ui`).
2. Rebuild the images from the branch under test: `bash scripts/rebuild-local.sh --build-only web host`, then
   `docker compose … up -d --no-deps --force-recreate tracy-web tracy-host`. When dsh plugins change (`lib/` of site-tools,
   site-tabs, add-site, chat-input, locales), copy `lib/` into `tracy-dsh` and `docker restart tracy-dsh` — no need to
   build the 5 GB dsh image.
3. Locally there is no Google Places key: searching by name says *Search is not available here* — paste a website link.
4. Each time you rebuild the same place: delete the old site first (`DELETE /api/sites/:key` or My sites); that site's open build
   ends with it (`DEMO_SITE_DELETED`).
5. Two builds at once is the limit: the Docker VM has 7.6 GB of RAM and a 58 GB disk.

**How to score it correctly:** look at screenshots of every page at 1440 and 390 px, do not count passing checks. 10/10 = no template text, image,
logo, category or contact left; every button goes somewhere real; real photos in the right places, not repeated while other photos remain;
showcase pages turned into the business's own; the phone layout does not break.

## 5. Traps that really bit

- **A full Mac disk → the Docker virtual disk turns read-only** (`read-only file system`), and Docker cannot restart because an old process
  still hangs: free up the Mac disk, quit Docker, stop `com.docker.backend` entirely, reopen; `docker start` the stand's containers
  again. Run `docker builder prune -af` after every few web image builds.
- **The research spinner never moves on to the template step**: `api` was created anew on every render by default, and the effect's cleanup
  cancelled the tracking (fixed: one `api` for the page's lifetime). A bench going through the API cannot catch it — it has to be tried in the UI.
- **`409 RESEARCH_NOT_DONE`**: a build is only accepted when the latest research is `completed`.
- **`DEMO_BUILD_ACTIVE`**: the place already has an open build — clicking again opens that very build; deleting the site closes it.
- **The WordPress template JA Restaurant** is the hardest template: the `features-intro.img-icon` block is an image in the page body,
  and text in the theme's PHP patterns goes through the plugin's render-time text layer (Claude Cowork for WordPress 0.18.26+).
- **Research has an address/email in the page text but the profile's slot is empty** → `collected-used` used to fail every page
  showing them (`COLLECTED_UNSOURCED`); now `collected.sourced` (the research's text) counts as collected.
- **The EmDash `tracy-business` sample form mails notifications to the sample's recipient** (`sales@northgate-ind.ru`): the form door does not
  change the recipient; that is the sample's job.
- **The template's showcase menus** (sign-in, typography, colour switcher…) are dropped from the menu right at install (#1674); the pages
  remain and the agent turns them into pages the business needs.
- **One "white text" CSS rule for every strip with the same class** (Levain, run 23): the agent made `.jr-f-hp-info` white so the dark strip would
  read, and the light-grey style-3 strip became white on grey (1.11) at the very last check; it also set `max-width` on the brand
  image so the image shrank into the frame's corner. The brief and fix prompts now require each rule to target a single section (id/anchor), never resizing
  images or moving badges; the visual checker treats a badge overlapping a box edge as design (`look/3`).

## 6. The owner's statement in the business reading (decision D46)

What the customer types about their business in the build chat is a **source**: its facts are true, the reading may use
them, and no sentence of it is ever copied into the site. The caller reads it with the same call the place executor uses,
adding two parameters:

```js
const input = readingInputOf({
  profile, // what the sources say (`mergeProfile`), as before
  google, // Google's place facts, or null, as before
  collected, // the collected source rows, as before
  ownerStatement: description, // what the owner typed in the build chat (string; blank or absent = no change)
  withheld // the research's `withheld` ({name?: true, people?: string[], names?: string[]}), or null
})
const reading = await readBusiness({ ...input, trade, door, held, charge, fetchImpl, now, log })
```

What comes back:

- `input.ownerStatement` is present only when the statement holds words; `input.heldTexts` (every held text but the
  business name), `input.heldPeople` (the held people among them) and `input.nameHeld: true` (the business name is
  held) only when something is held. With neither, the input, the prompt bytes and the reading are exactly what they
  were.
- No held text reaches the model, in any passage and either call (the reading and its USP retry,
  `reading-held-passages.mjs`). In the statement every sentence a held person or the held business name overlaps is
  taken out, both halves of a name split over two sentences. In every other passage (bio, posts, reviews, website
  pages, Google's types and social categories) a held person's sentences are taken out and a review they wrote (its
  author field) goes whole, while the held business name is masked with the stand-in `[business-name-held]`, which is
  also how the message's header names the business. The stand-in is a token no real copy writes ("Business name
  registration" is a service and stays); it is a template placeholder, so no quote holding it stands, and copy that
  writes it, with or without its brackets, is dropped (`reading.standInDropped`: `{group, field, why}`, never the text).
- The reading reads the statement as one passage `{ref: 'owner', kind: 'owner-statement'}`, first, capped at 1500
  characters like every passage. The model's system message gains one rule (`owner-statement-prompt.mjs`, a draft
  awaiting approval in #600): facts true, wording never copy, and an item read from it named in words of its own.
- `reading.ownerStatement`: `{read: true, heldOut, cut}` (sentences held back, whether the cap cut it), or
  `{read: false, reason: 'held'}` when every sentence named something held. Absent when no statement was given. When
  the statement was the only text and all of it was held, `readBusiness` returns null and `ownerStatementRecordOf`
  gives the caller that same record.
- Items read from it carry `source: {kind: 'owner-statement', ref: 'owner'}`. Their label is a rewrite, not words taken
  from the quote (`owner-echo.mjs ownerLabelGrounded`): at least half its words are words of the quote, and every
  number and capitalised word of it is in the quote. The rules reading (no model) never reads the statement at all
  (`reading.ownerStatementSkipped`), since rules can only copy.
- The echo guard (`owner-echo.mjs`): a copy text copies the owner when it shares a run of four words in a row with the
  statement (a script written without spaces counts characters: 8 Han or Hiragana characters, 16 Katakana, Thai, Lao,
  Khmer or Myanmar characters; a character is classed by its script extensions, so the long vowel mark `ー` weighs as
  Katakana), or holds in order at least 60% of one of its sentences of five words or more. Case, accents, width,
  punctuation, quote marks, emoji and spacing are folded first, and runs cross sentence ends, bullets and semicolons. A
  copy text of up to three words only names a thing and passes. A run of four a public quote the item stands on holds
  in a row is that text's wording and passes; for the 60% rule only runs of three words or more that the copy, the
  owner's sentence and one public text all hold in a row are excused, and the rest of the copy is then held against
  the rest of the sentence by the same 60% (common words a long review shares, scattered, excuse nothing). Korean is cut
  at spaces: a particle changed on a word breaks a run, which is accepted (the 60% rule still holds a reworded
  sentence).
- The place profile files them under the source of kind `owner-statement` (ref `chat`); a story or audience item becomes
  a quote of kind `owner-statement`, the brief's field `ownerStatement`, never a story or post quote. The brief names it
  as the source "owner's chat statement (facts only, never copy)", and routes its field `fact.ownerStatement` as never
  shown (`brief-item-routes.mjs`).
- The needs profile research (`researchOf`) reads that evidence as the source id `owner-statement` of origin `answer`,
  which the plan shows as "Your answer". The needs profile drops a `quote` item from it, a summary the echo guard calls a
  copy, and never takes its phrases as the business's own words (`voice.ownWords`). Its language never decides the
  site's (`siteLanguageOf`): the owner types in the app's language. With the statement as the only source the profile
  has no language and the plan states its English default as an assumption.
- Trust order: `website`, `answer`, `google`, `social`. An answer the customer gives to a plan question is applied after
  the merge (`plan-answers.mjs`, source `customer-answer`), so it always wins over the chat statement.


### 6.1 Where a held text is found (`held-text-match.mjs`)

Every text is folded once, whatever the number of held texts: compatibility forms, accents and other marks, zero width
characters and case aside (the kana voicing marks stay: `ガ` is not `カ`). Then:

| Form | Rule | Found | Not found |
|---|---|---|---|
| Prose | the held text's words in order, at least one character that is no letter or digit between two words, whole words at both ends | `Brannoch` line break `Vey`, `Ask for Brannoch. Vey runs` | `Fed leeks` for `Ed Lee`, `Normal maps` for `Al Ma` |
| Script without spaces | a side in Han, Hiragana, Katakana, Thai, Lao, Khmer or Myanmar (the name's or its neighbour's) needs no boundary and no separator; a Hangul name may carry a Hangul particle | `講師は山田花子です`, `ครูสมชายสอน`, `김민지가` | |
| Glued | inside one run without spaces (a slug, a file name, a handle, an address), the words written together match whole tokens (a token is a run of letters or of digits) | `brannochvey`, `pellam-orrick2.jpg`, `ed-lee.jpg` | `banana-boat.jpg` for `Ana Bo`, `used-leek.jpg` for `Ed Lee` |
| Common word name (the reading only) | a one word held text that is also a common English given name word (`Will`, `May`, `Rose`; the list is in `held-name-context.mjs`) is held in prose only with a capital: mid sentence always; at a sentence start only next to a title (`Chef`), a role word (`florist`, `is our head baker`), a possessive (`Will's`) or another capitalised name part (`Rose Tan`). In a slug and in an author field it is always held | `Ask Rose about`, `in May and June`, `Rose, our florist`, `rose-portrait.jpg` | `our rose bouquets`, `We will deliver`, `May is our busiest month` |
| First name alone (the reading only) | a held person's first name written alone is held with a capital (a common one by the row above), in prose, a slug, an address or an author field; never one of two letters or fewer, never for a name in a script without spaces or in Hangul (the family name leads there) | `Ask Brannoch about raku`, `brannoch@example.test` | `brannoch` lower case in prose, `Ed was here` |

`heldNamesIn` (reviews, plan values, the site name: what reaches the site) uses the prose and script rows and no
common word relaxation: privacy first, a held `Rose` is held in any case there. `heldSlugsIn` adds the glued row. The
first name row is the reading's only.

Still over-matches, by design (privacy wins): a common word name capitalised mid sentence as a word (`in May` for a
held `May`); any token of a slug (`rose-tinted.jpg`); a multi word held business name that is a common phrase (`The
Shop`); accent folding merges distinct names that differ only by accents, Vietnamese names that differ only by tone marks among
them (the safe direction, accepted); a one word held
name of two letters in a slug (`bo-staff` for `Bo`). Could now be missed: a common word name at a sentence start with no
name context (`Will made my bouquet`); a held person's family name alone (`Ms Vey`); a first name written lower case in
prose; common words of other languages (the list is English); a glued name split by a digit (`Odalys1Brenwick`). When
unsure the rule holds the name: the sentence goes.

### 6.2 Fact values and copy (`owner-echo-fields.mjs`)

D46 has two duties of equal weight: no copied prose, and the owner's facts arrive. So the guard reads a reading field
by field, by the reading's own structure, never by guessing from the text:

| Layer | Group | Name or value: never guarded | Copy: guarded | Evidence and records |
|---|---|---|---|---|
| Reading | services | label, kind, price | | quote, mentions, id, source, basis |
| Reading | audience | label | | quote, mentions, id, source, basis |
| Reading | team | label (the person), role (a title) | | quote, mentions, id, source, reviewsOnly, factId, onSite, photo ids |
| Reading | serviceAreas | label (places) | | quote, mentions, id, source |
| Reading | story | | label (needed) | quote, mentions, id, source |
| Reading | facts | | label (needed) | quote, mentions, id, source |
| Reading | keyMessages | | label (needed) | quotes, id, basis, decidedBy |
| Reading | uspThemes | | label and line (needed), accent, who | quotes, id, basis |
| Reading | subTrade | id | | quotes |
| Reading | ownerFacts | | | every field: evidence for the writer, never copy |
| Reading | uspThemesDropped, ownerEchoDropped, standInDropped | | | records |
| Place profile | facts and quotes filed from the reading | the reading's names and values | | story and audience quotes of the statement are kind `owner-statement` (field `ownerStatement`, never shown) |
| Brief | `reading` | as the reading | as the reading, and `about` (the About line, guarded whole) | `ownerFacts`, `ownerEchoDropped` |
| Needs profile | item fields | every role not in `SUMMARY_ROLES` (names, prices, dates, phones, hours rows) | the `SUMMARY_ROLES` (descriptions, bios) | evidence |

`domain-owner-echo-fields.test.mjs` fails when a reading, its brief view or the brief holds a field the table does not
class. Hours and days, phone, email and the address are fact values: they reach the site through their own structured
fields, so a phrase such as "open seven days a week" in a story or fact line need not survive as copy; it survives as a
fact for the writer (below). Whether hours, a phone or an email typed in the chat should reach the needs profile
directly is not decided and not built.

What the guard does with an echo:

- a copy field that echoes the owner is dropped from its item, and the item stays with its facts (a USP theme keeps its
  line when only its `who` echoed);
- when the field is one the item needs (marked "needed" above), the item leaves its group and its fact moves to
  `reading.ownerFacts` as `{id, kind: 'owner-fact', group, text, source}`; the brief lists these under "What the owner
  states in the build chat, facts to write from (say each in words of your own; never these words, never as a quote)",
  and routes them as `owner-fact`, never shown as written;
- the brief's view (`readingWithoutOwnerQuotes`) also moves there every story line and fact the reading read from the
  statement, and every key message or USP theme left with no quote but the owner's; a service, an audience and a
  service area of the statement keep their name with the name as their only quote, a team member keeps name and role;
- a tagline the owner states (an item of the statement whose quote says tagline, slogan, motto or strapline; English
  words only) never reaches copy: it is kept as `kind: 'owner-tagline'`, reason `awaits_product_decision`, routed as
  never shown, and the brief only says one waits. Whether an owner's tagline is the one case where the owner's wording
  is the fact is an open product question;
- every echo is recorded in `reading.ownerEchoDropped` as `{group, field, rule, weight, why: 'copies_owner_statement',
  kept}` (`kept`: `item`, `owner-fact` or `owner-tagline`), never the text. The brief carries
  `reading.ownerEchoDropped: {count, groups}` and `reading.ownerFacts`.

For the plan step (the other session): it may show the owner, from the brief, "N things you wrote are kept as facts and
will be said in other words" (`reading.ownerEchoDropped.count`, the groups by name), list `ownerFacts` of kind
`owner-fact` as "we will say this in our own words", and, for an `owner-tagline`, "your tagline waits for a decision".
It never shows a field's words as site copy. `ownerEchoDropped` does not reach the needs profile: the needs profile
reads the research's evidence, not the reading, and records its own drops field by field (`summary_copies_owner`).
`domain-owner-echo-survival.test.mjs` measures both duties on the invented fixtures.

The `owner` source of the older flow (the value typed on the Profile card, origin `website`) is unchanged and is a
different key.
