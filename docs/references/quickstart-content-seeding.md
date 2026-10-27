---
description: The seed stage of a site built from a quickstart — how a contract profile comes about, how 1,800 slots pass through the model, the refusal rules, the translation stage, and the real measurements of one build run.
sources:
  - packages/cms/tracy-seeder/src/cli.mjs
  - packages/cms/tracy-seeder/src/plan-joomla-contract.mjs
  - packages/cms/tracy-seeder/src/apply-joomla-contract.mjs
  - packages/cms/tracy-seeder/src/plan-joomla-language.mjs
  - packages/cms/tracy-seeder/src/shipped-translations.mjs
  - packages/cms/tracy-seeder/src/chrome-slots.mjs
  - packages/cms/tracy-seeder/src/reconcile-site.mjs
  - packages/cms/tracy-seeder/src/model.mjs
  - packages/cms/tracy-joomla-quickstart/scripts/capture-contract.py
  - packages/site/tracy-site-build-joomla/src/host/stages.mjs
---

# Seeding the content of a quickstart

This document describes the **`seed` stage**: the step that turns a copy of the vendor's demo into the customer's site,
by replacing the text in slots declared in advance, and touching **nothing** else.

It answers four questions that are often guessed wrong: *where those slots come from*, *how many slots actually go through the model*, *what
stops the model from breaking the site*, and *how many calls one build run costs*.

Every number here was measured on contract `tracy-business/j6/1.1.0` and build run `site-jvsjoe` on 22/09/2026.
Another quickstart has the same shape and very different numbers — ja-kinetic has 4,662 slots, 3,634 of which
are the demo blog.

## 1. Where seed sits

`packages/site/tracy-site-build-joomla/src/host/stages.mjs:26` declares seven stages, run in order:

```
check → template → style → copy → seed → language → shot
```

| Stage | What it does |
|---|---|
| `check` | whether the installed quickstart matches its contract — if it does, the site is **sealed** |
| `template` | the original template stays intact |
| `style` | layout, modules, menus, ACL are locked |
| `copy` | gathers the customer's input; secondary languages follow the original |
| **`seed`** | **replaces the demo text with the customer's text** — this document |
| `language` | builds the secondary-language versions |
| `shot` | takes screenshots of the site |

The first four stages write no content. They build the cage that `seed` must write inside.

## 2. Three parties, and why there must be three

The seeder has **no** access to the customer site's database. The path of a piece of text is always:

```
seeder  ──►  Apply door  ──►  Claude Cowork plugin com_claudecowork  ──►  database
(holds the model key,  (allowlist)     (inside the customer site itself,
 never touches the DB)                  checks every value against the contract)
```

Any party can refuse, and **the Claude Cowork plugin is the final arbiter**. It does not trust the seeder: `apply` is **one
transaction**, and the first value it rejects sends the whole batch back. That is why `plan-joomla-contract.mjs` keeps
a **narrow** copy of three Claude Cowork plugin rules (`coworkWouldRefuse`), so a bad slot costs one slot and not
the whole stage — the rules that need to know the site (image aspect ratio, media paths that actually exist) stay on the Claude Cowork plugin's side.

## 3. Contract profile — four files

Lives in `packages/cms/tracy-joomla-quickstart/contracts/<id>/`:

| File | Content in tracy-business 1.1.0 |
|---|---|
| `manifest.json` | id, platform `joomla`, template `tracy_business`, `coworkContractVersion` 0.15.0, `mode: content-recommendation` (ADR 0022) |
| `content-map.json` | **367 entities · 1,800 slots · 78 pages** — the map of text slots |
| `presentation-lock.json` | 367 entities, 170 assignments, 4,137 file hashes — a design baseline to diff against (ADR 0022), not a lock |
| `multilingual-map.json` | rules for building a new language version: 157 entities `translate`, 210 `shared` |

Only `content-map.json` is read by `seed`. The other three files belong to other stages.

## 4. How the 1,800 slots come about

Nobody types them by hand. `packages/cms/tracy-joomla-quickstart/scripts/capture-contract.py` installs the quickstart into
a throwaway webroot, reads the database, and for every text slot it finds pushes one element into `slots`.

**Five tables, filtered down to 367 entities:**

| Kind | Count | Filter |
|---|---|---|
| `module` | 165 | only `client_id=0` (modules of the visitor-facing site) |
| `article` | 86 | only `state=1` |
| `menuItem` | 78 | only menutype `tracy` |
| `category` | 36 | only `extension=com_content` |
| `templateStyle` | 2 | only the template's styles |

Category and templateStyle produce **0 slots** — they are there to seal the structure, not to replace text.

**Four slot sources:**

| Source | Slots | How they are extracted |
|---|---|---|
| `params` of ACM modules | 1,510 | unpacks the nested `jatools-config` JSON, walking every branch recursively |
| `title` of article + menuItem | 164 | 86 + 78, one slot each |
| `introtext` + `fulltext` of article | 98 | HTML extracted with `ContentSlots::htmlSlots` (PHP) |
| `content` of `mod_custom` modules | 28 | same HTML extractor |

You can tell where a slot came from by looking at it: 1,510 slots carry `nestedJson: "jatools-config"` with a `jsonPath`,
126 slots carry an `xpath`.

**Three text types decided by the schema.** For ACM modules, the script opens the exact XML schema file of the layout in use
(`templates/<template>/acm/<block>/tmpl/<layout>.xml`) and **only accepts** fields declared as `text` ·
`textarea` · `media` · `url` · `email`. Any field whose name contains `color|class|style|layout|icon|width|height|
column|align|animation` is thrown away — that is presentation. Then the type is assigned: `media` → `image` (70), a name ending in
`link`/`url` or a field declared `url` → `url` (140), everything else → `text` (1,590).

Three real slots, from one topbar and one hero:

```
module-428.1  text   "Hotline: 8 800 550-67-90"       maxCharacters 68
module-428.0  url    "tel:88005506790"                maxCharacters 2048
module-441.8  image  "images/northgate/hero-ru.png"   maxCharacters 255
```

`maxCharacters` is a formula too: url is always 2048, image always 255, text is
`max(40, min(2000, len(sample) * 2 + 20))` — the 24-character string above gives exactly 68, so the customer may write
twice the length of the demo plus a little.

`requiresEvidence` is on when the **module title** matches `Pricing|Statistics|Testimonials|Clients|Team` —
where there may be prices, figures or testimonials, the value must be a verbatim quote from the customer's
brief, and the model may not write it itself. Since 13/10/2026 (#1326) it is also turned on by the **role of the field**: slots
`stat-value`/`value`/`number`, `city`/`addr`/`place`, `quote`/`rating`, `name`/`role`/`bio`,
`client-name`/`logo-alt`, `price`… ask for evidence whatever the module is called ("Home - Stats" is not
"Statistics", "Home - Hero" has four counter slots). The rule lives in `apps/tracy-web/src/lib/fact-fields.json`;
the Joomla planner attaches it itself when reading the profile (`staticState`), so old profiles that never recorded the flag are still gated; new
profiles are captured with `--evidence-by-field`, and already-captured profiles take `node scripts/regate-contract.mjs <folder>`
before the plugin is cut.

**More than half the contract is a Russian twin.** Counted by the entity's `identity.language`: **899 slots
en-GB, 899 slots ru-RU, 2 shared slots**. This quickstart is the vendor's bilingual demo site.

## 5. What one seed run goes through

### 5.1 Ask the site first

`cli.mjs` calls the Apply door with `content.contract` / `inspect`. The site returns `contract`, `revision`, and
all `slots` with **`current`** — the value actually sitting in the database right now. `revision` is what makes it
impossible for one apply run to overwrite a change another run has just written.

### 5.2 Four valves before spending money

`plan-joomla-contract.mjs` removes slots from the batch sent to the model by four rules:

| Valve | Removed in tracy-business | Why |
|---|---|---|
| `chrome.handled` | **0** | the slot belongs to the original (footer, legal line) — settled by rule, not through the model. `chrome-slots.json` only declares it for `tracy-apple` and `tracy-airbnb`, **not yet for `tracy-business`** |
| `isInternalRoute` | 62 | `index.php?Itemid=263` and paths starting with `/` — already correct, and the customer cannot supply them |
| `type === 'image'` | 70 | the only valid value is a path already in the site's `images/`; the model has no way of knowing it, it invents `images/hero-en.png` and the Claude Cowork plugin rejects **the whole batch** |
| `isDerived` | **0** | reads `slot.translates`/`slot.sourceKey`, but `content-map.json` carries neither field |

Plus a fifth valve, the `--surface` flag: default `all`; set to `pages` and it only plans for entities that sit
on a page a visitor can reach. In tracy-business it cuts 1,800 → 1,616 (only a few demo blog posts); in
ja-kinetic it cuts 78%. That is why the valve exists.

There is also one safety valve: a key containing non-ASCII characters is dropped with a warning. This contract has no such
key — but the model **produces one on its own** (see §8).

**Result: 1,800 − 70 − 62 = 1,668 slots go into batches.**

### 5.3 Batching and asking the model

```js
for (let offset = 0; offset < planned.length; offset += 35)
```

35 slots per batch → **48 calls**, up to 144 if every batch has to be retried all three times.

⚠ **The number 35 is a bare constant, with no comment and no measurement.** It entered the tree in the same commit that built the contract
mechanism and nobody has touched it since. Its sibling file follows the repo standard: `plan-joomla-language.mjs:21` declares
`BATCH = 30` with a reason — *a small batch means one broken answer costs little*. This is known debt, not a recorded
decision.

The model receives `{ brief, pages, slots }` and must return `{"values":{…},"pending":[…]}`. The prompt forbids it from inventing
facts, from keeping demo text as customer content, and from following instructions embedded in the brief or in a sample.

**Three attempts per batch** (`ATTEMPTS = 3`), and a broken answer is a **complaint to the model**, not
an exception: a wrong shape gets the sentence "return exactly `{values,pending}`" sent back; keys named outside the batch
get the list of wrong keys sent back. If the shape is still wrong after three attempts → the stage stops; **extra keys are dropped
with a warning**, because the loop below only reads this batch's keys so nobody ever looks at an invented key.

### 5.4 Six rules judging each value

Each slot of the batch goes through exactly this order; it stops at the first rule that catches it, and **the reason is recorded**:

| Reason | Meaning |
|---|---|
| `model-pended` | the model itself declared "no facts to write this" |
| `no-answer` | the model returned nothing for this key |
| `emptiness-mismatch` | the sample is empty but text was returned, or the other way round |
| `too-long` | exceeds `maxCharacters` |
| `evidence-missing` | the slot requires evidence but the value is not a verbatim quote from the brief |
| `markup` · `directive` · `unsupported-url` | three rules of the Claude Cowork plugin, checked early here |

Recording the reason is deliberate: a bare list of 546 keys cannot be sorted, while the three reasons call for three
different actions — ask the customer, ask the model again, or fix the length.

A caught slot **keeps the demo text** and goes into `pending`. There is exactly one exception: a slot whose `current` already
differs from `sample` is a slot someone has already filled through this very door — it is not asked again and not overwritten.

### 5.5 The site is the arbiter, not the plan

`reconcile-site.mjs` runs on both the cache path and the re-plan path, and prints three sentences:

- *N slots the site has already answered; not asking again*
- *N slots this build run has written; closing*
- *N slots edited on the site after this plan; keeping the site's text*

### 5.6 A last sweep before sending

Before sending, the whole of `mapping.changes` is swept again with `coworkWouldRefuse`. The measured reason: one cache
run replayed the value `<400ms` in a stats strip, the Claude Cowork plugin rejected it, and a whole plan of thousands of slots
was lost — twice on ja-kinetic on 16/09.

`pending`, on the other hand, **blocks the stage**: `CONTENT_REQUIRED: <list of keys>`. The `--keep-demo` flag **moves** the
wait rather than removing the rule: slots without facts are still not written, but the stage completes and returns the list
as `kept` so the site is usable at once. Without that flag an unattended build run would stop every
time — ja-kinetic has 727 out of 4,662 slots that require evidence.

### 5.7 Apply

`apply-joomla-contract.mjs` checks once more before anything leaves the machine: the mapping must name exactly the
contract installed, must carry `revision`, must not contain derived slots, slots that require evidence must have
evidence, and there is **at most 1,500 slots per run**. `apply_id` is a hash of (site, contract, revision,
changes, evidence) — sending it again unchanged gives the same `apply_id`, so a retry does not write twice.

## 6. Real measurements — `site-jvsjoe`, 22/09/2026

| | Count |
|---|---|
| Slots in the contract | 1,800 |
| Sent to the model | 1,668 (48 batches) |
| `changes` — actually changed | 740 |
| `reasons` — refused, kept demo text | 423 (`model-pended` 324 · `emptiness-mismatch` 53 · `evidence-missing` 38 · `image` 5 · `markup` 2 · `unsupported-url` 1) |
| `evidence` | 1 (`module-447.10 = "Woodworks"`) |
| **Model answered validly but with exactly the old value** | **505** |

505 is the difference 1,668 − 740 − 423. They **leave no trace**: `plan-joomla-contract.mjs` only records
`changes[key]` when the value differs from what is there, and records no `reason`. That is, about 14 of the 48 batches cost money
without changing a word, and reading the result file does not show it.

## 7. The `language` stage — much cheaper, because there is a shipped translation pack

The translation source is **the text currently on the site**, not the brief and not the demo. Translating again from the brief would be
writing a second time, and it would silently throw away every edit the customer made after the build.

The key point is the **shipped translation pack**: `packages/cms/tracy-joomla-quickstart/translations/<id>/<locale>.json`
— 41 languages, 778 strings per file, already reviewed. The lookup key is `${locale}:${maxCharacters}:${source}`,
and **that same key does the sorting too**: a slot the customer has not touched still holds the pack's original string so it
hits the cache; a slot the customer has rewritten misses, and only then is the model asked. No extra condition is needed.

Two measured runs on vi-VN, two different sites:

| Site | Strings to translate | From pack | From model | Calls |
|---|---|---|---|---|
| `site-jvsjoe` | 960 | 692 | 268 | 9 (up to 27) |
| `site-ukxspk` | 807 | 700 | 107 | 4 (up to 12) |

On the WordPress side: 837 out of 1,182 strings matched from the table. The pack hit rate depends on how many slots the customer
rewrote — which is exactly what the cache key measures without needing to know anything else.

⚠ Both numbers above had to be **reconstructed from the cache file**, because the log line "N strings from pack, M from model"
reaches neither `job.json` nor the container log.

Here `BATCH = 30`, `ATTEMPTS = 3`, only `text` slots are translated — urls and images are carried over by the Claude Cowork plugin itself, because
"translating" a link is how a working CTA becomes a 404 in a language nobody on the team can read.

## 8. Cache, recomputation, and the trap that sprang

The plan's cache key is `briefHash` = hash of (site in the preview, target site, contract).

**The most important rule: a new answer must not throw away the previous answers.** Before 12/09, every
time the customer answered one more question, all 1,113 slots were re-planned and the model's variance was
rolled again from scratch — measured on two Airbnb runs on the same site: an 880-character brief gave 546 pending, a 2,713-character
brief gave 540, and `article-2.0..5` was **filled** by the short brief but **pending** with the long one. More
facts, worse result, because nothing accumulated. Now the old plan is the starting point: filled slots are
kept, and only slots still pending are asked again. `--fresh` is the way to say "rewrite from scratch".

Exactly one kind of slot is withdrawn: a slot requiring evidence whose quoted excerpt is no longer in the brief —
the customer has withdrawn that fact, so it goes back onto the list of questions.

## 9. The cost of one build run

| Stage | Calculation | Calls |
|---|---|---|
| content `seed` | 1,668 ÷ 35 | 48 (up to 144) |
| `seed` blog + cover images | one text call, images generated separately | 1 + N images |
| `language` per secondary language | (strings the model must translate) ÷ 30 | vi-VN: 9 (up to 27) |

Model: text is `deepseek/deepseek-chat-v3.1` via OpenRouter, falling back to `deepseek-chat` called directly when there is no
OpenRouter key (`model.mjs`, `providerOf`). Images are `google/gemini-3.1-flash-lite-image`, measured at
$0.07 per image.

⚠ **Money has not been measured yet.** `chat()` does receive `usage` from the provider but **does not record it anywhere** —
neither `job.json` nor the container log has tokens. The only real figure available is the 36-language translation run for
EmDash: 8 requests, ~22 seconds, around $1. To answer "how much does one site cost", `usage` must be recorded
first.

## 10. Seven ways it has broken, and how each was plugged

| Breakage | Plugged by |
|---|---|
| The model wrote `images/hero-en.png` for an image slot → the Claude Cowork plugin rejected the whole batch, 19 minutes of seed lost | `image` slots never go into a batch |
| The model returned `module-614极` — mangling an ASCII key into CJK itself — three times in a row, two build runs died after 4 stages | extra keys are dropped with a warning instead of killing the stage |
| A batch returned JSON that would not parse → `seed` died, with nothing to resume from | three attempts, the complaint sent back to the model |
| `<400ms` in a stats strip → the Claude Cowork plugin rejected the whole batch, a plan of thousands of slots lost | `coworkWouldRefuse` sweeps before sending |
| A longer brief gave a worse result | the old plan is the starting point, not garbage |
| The footer printed the word `apple` on an Airbnb site | chrome slots settled by rule, out of the model's reach |
| Model cache shared by `cwd`: a souvenir shop site reused 6 posts written for a bakery | the cache sits next to `design-preview.json`, not next to the process |

## 11. CLI flags worth remembering

```
tracy-seed --platform joomla --preview docs/agents/design-preview.json
           --target-site <label> --door <address> --contract <id>
           [--surface all|pages] [--keep-demo] [--fresh] [--dry] [--no-model]
           [--add-language vi-VN]
```

- `--dry` prints the plan, writes nothing.
- `--no-model` skips both model calls — for a stand with no key.
- `--fresh` throws away the cache, rewrites from scratch.
- `--add-language` is **a separate run**, not a flag of the content run: it installs a language pack,
  writes hundreds of rows, and must be able to resume after being interrupted.

## 12. Three places known to be wasteful

Not fixed yet, written down so nobody has to find them again:

1. **899 ru-RU slots go through the model as original content.** The quickstart's Russian twin is not
   marked as a translation anywhere: `content-map.json` has no `translates`/`sourceKey`, and
   `multilingual-map.json` describes *how to build a new language version from en-GB* rather than pairing the en↔ru of
   rows that already exist. So `isDerived` filters out 0. Fixing it means pairing them at capture time — not
   just appending existing files.
2. **`tracy-business` declares no chrome slots**, while `tracy-apple` and `tracy-airbnb` each
   declare 4. Footer, legal line, and perhaps even structural menu labels are going through the model needlessly.
3. **The 505 "model returned it unchanged" slots leave no trace.** One counting line is enough to measure next time
   what we are paying for.

And one small debt: the constant `35` needs a name and a one-sentence reason, like `BATCH = 30` in the translation stage.
