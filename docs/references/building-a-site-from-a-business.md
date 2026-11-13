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

- `input.ownerStatement` and `input.heldTexts` (the held people, plus the business name while `withheld.name` is true)
  are present only when the statement holds words; without one the input, the prompt bytes and the reading are exactly
  what they were.
- The reading reads the statement as one passage `{ref: 'owner', kind: 'owner-statement'}`, first, capped at 1500
  characters like every passage. Every sentence naming a held text (whole words or slug form) is taken out before the
  model sees anything. The model's system message gains one rule (`owner-statement-prompt.mjs`, a draft awaiting
  approval in #600): facts true, wording never copy.
- `reading.ownerStatement`: `{read: true, heldOut, cut}` (sentences held back, whether the cap cut it), or
  `{read: false, reason: 'held'}` when every sentence named something held. Absent when no statement was given.
- Items read from it carry `source: {kind: 'owner-statement', ref: 'owner'}`. Any item, key message or USP theme whose
  copy repeats a sentence of five words or more of the statement word for word is dropped and listed in
  `reading.ownerEchoDropped` (`{group, label, why: 'copies_owner_statement'}`).
- The place profile files them under the source of kind `owner-statement` (ref `chat`); a story or audience item becomes
  a quote of kind `owner-statement`, the brief's field `ownerStatement`, never a story or post quote. The brief's copy
  (`readingWithoutOwnerQuotes`) keeps a service it stated by its name only, and no story, audience, About fact, key
  message quote or USP quote of it.
- The needs profile research (`researchOf`) reads that evidence as the source id `owner-statement` of origin `answer`,
  which the plan shows as "Your answer". The needs profile drops a `quote` item from it, a summary repeating one of its
  sentences, and never takes its phrases as the business's own words (`voice.ownWords`).
- Trust order: `website`, `answer`, `google`, `social`. An answer the customer gives to a plan question is applied after
  the merge (`plan-answers.mjs`, source `customer-answer`), so it always wins over the chat statement.

The `owner` source of the older flow (the value typed on the Profile card, origin `website`) is unchanged and is a
different key.
