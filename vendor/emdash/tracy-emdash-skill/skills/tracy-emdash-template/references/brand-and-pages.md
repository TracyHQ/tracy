# Brand and pages — ready for "Customize your site"

Tracy asks every customer seven questions before it builds their copy of a template (TracyHQ/tch#1013):
**Business name, Logo, Favicon, One line about the business, Pages, Site language, Tone.** A template is
ready only when each answer *reaches the site* with no later fix. This file is the part of that contract the
template itself owns; `tools/personalize.mjs` writes the answers, the template must read them in the right
place. Read it at P2 (content model: the fields below exist) and P5/P6 (chrome: header, footer, `Base.astro`),
and tick the checklist at the end before P8.

What the kit gives every new template (`new-template.sh` copies `scripts/src/` into `src/`, byte for byte —
`check-kit-sync.mjs` holds the copies):

| File | What it does |
|---|---|
| `src/lib/brand.ts` | `brandLogos(settings, darkValue, name)`, `logoSpots(logos, 'themed' \| 'dark')`, `templateIconWanted(settings)`, `THEME_CLASS` — pure, held by `tests/brand.test.mjs` |
| `src/lib/media.ts` | `mediaUrl(value)` — a usable URL for an image field (local media follows the viewing origin) |
| `src/components/site/BrandLogo.astro` | one logo spot: the customer's picture per theme, the template's text lockup (the default slot) where there is none |
| `src/lib/display-locale.ts` | `displayLocaleOf(locale, LOCALES)` — the tag `<html lang>` and hreflang print when the stored locale is shown as another (`en` shown `en-US`, or a root written in Vietnamese shown `vi-VN`) — held by `tests/display-locale.test.mjs` |

`tests/brand.test.mjs` and `tests/display-locale.test.mjs` are starting points (template-owned): keep them
passing in the template.

## 1. Business name

- The site title is core `settings.title`: `seed/personalize.json` `settings.title: "{name}"` (the starter has it).
- The chrome's own brand field (the wordmark in the header and footer) is an `identity` rule with
  `value: "{name}"` — never a `replace` alone, which only finds the demo spelling.
- The copyright line is a field of the chrome entry written by an `identity` rule from the name and the year,
  e.g. `"value": "© {year} {name}"` (Tracy Business) or `"(c) {year} {name}."` (Tracy SaaS). Never a literal
  copyright in a component: the customer's site would keep the demo company.

## 2. Logo

- **Light or only logo = core `settings.logo`.** Nothing to add to the schema.
- **Dark-background logo = an image field `logo_dark` on the chrome entry** the header and footer already read
  (Tracy Business and Base: `site`/`site`; Tracy SaaS: `social`/`footer-brand`). Declare it in the schema, and
  name it in `seed/personalize.json`:

  ```json
  "brand": { "note": "…", "logoDark": { "collection": "site", "slug": "site", "field": "logo_dark", "label": "Logo for dark backgrounds" } }
  ```

  The starter carries this block. The tool that reads it (`writeBrand`, flags `--logo-file`,
  `--logo-dark-file`, `--favicon-file`) is in the kit's brand PR; a tool without it ignores the block.
- **Every logo spot goes through `<BrandLogo>`**, with the demo lockup as its default slot:

  ```astro
  ---
  import BrandLogo from '@/components/site/BrandLogo.astro'
  import { brandLogos, logoSpots } from '@/lib/brand'
  const logos = brandLogos(await getSiteSettings(), site.logo_dark, site.brand_name)
  ---
  <!-- header: its background follows the theme -->
  <BrandLogo spots={logoSpots(logos, "themed")} alt={logos.alt} imgClass="h-10 w-auto max-w-[220px] object-contain">
    …the demo's mark and name, unchanged…
  </BrandLogo>
  <!-- footer drawn on ink in both themes -->
  <BrandLogo spots={logoSpots(logos, "dark")} alt={logos.alt} imgClass="h-9 w-auto max-w-[200px] object-contain">
    …
  </BrandLogo>
  ```

  `themed`: the light logo in the light theme, the dark one in the dark theme, the text lockup in a theme that
  has no picture. `dark`: the dark logo, else the text lockup — never the light logo on a dark ground (Q7). No
  customer logo at all renders the slot alone, unwrapped: the demo's own markup.
- **Height is capped by `imgClass`** to the height of the demo's lockup, with a max width: a customer's PNG of
  any proportion stays inside the design.
- **Hide a spot outside its theme**, in `src/styles/global.css`, keyed on the template's theme attribute,
  unlayered and important so no utility can bring it back:

  ```css
  html[data-theme="dark"] .brand-when-light,
  html:not([data-theme="dark"]) .brand-when-dark {
  	display: none !important;
  }
  ```

- **No CSS that recolours or swaps a logo** (`filter: invert(…)`, `brightness(0)`, `content: url(…)` on a
  logo selector). It destroys the customer's picture.

## 3. Favicon

EmDash's head prints the customer's favicon from core `settings.favicon`. The template's own icon is printed
**only while the customer has none**, otherwise the browser has two candidates and may keep the demo's:

```astro
---
import { templateIconWanted } from '@/lib/brand'
---
{/* The template's icon only while the customer has none: EmDashHead prints theirs from settings.favicon. */}
{templateIconWanted(settings) && <link rel="icon" href="/favicon.svg" type="image/svg+xml" />}
```

No other `<link rel="icon">` anywhere (layouts, components, `public/` HTML). An empty answer keeps the
template's icon.

## 4. Site language — one language, written into the root

A customer who picks one language other than the root's gets the root written in it (`personalize`
`localesFrom` → `as: { en: 'vi' }`), stored as `en`, shown as `vi-VN` through `<SITE_DATA_DIR>/display-locale.json`.
The template must:

- print `<html lang={displayLocaleOf(chrome.locale, LOCALES)}>` and use `displayLocaleOf` for every hreflang;
- not lock `locales: ['en']` in a way that forbids writing the root in another language;
- say its own chrome words (menu button, "Home", dates, reading time, archive labels) in the display language:
  a template-owned word table looked up by the display tag — Tracy SaaS and Base: `src/lib/ui-words.ts`
  (`uiWords(tag)`: the exact tag, then its language, then English; dates through ICU with the Gregorian
  calendar named, counts through `Intl.PluralRules`) behind `src/lib/ui.ts` `ui(locale)`; Tracy Business:
  `locale-words.ts` + `ui.ts` `uiLocale(locale)`. Never an English literal in a component.

## 5. Pages

Tracy's Pages question lists the pages a customer may keep or hide, from the asset `tracy_site_pages.json`
(`{ "pages": [{ "id", "label", "home"?: true }] }`) on the release: level 1 of the `primary` menu of
`seed/site-model.json`, ids = page record slugs, exactly one `home`.

- `tools/release.mjs --site-pages <dir>` writes it with the release (kit PR #17, open; until it merges take
  `release.mjs` from that branch).
- Or `tracy-dev site-pages --emdash <source.zip | seed/site-model.json> [--out dir]`, checked with
  `tracy-dev site-pages --emdash <same input> --check <tracy_site_pages.json>` (TracyHQ/tracy-template-dev PR #1,
  open draft) — also for a release already published.
- Put every page a visitor reaches from the header on the `primary` menu; a page only in a topbar or footer is
  not offered.
- `personalize.mjs` hides an unticked page by unpublishing it in every written locale and dropping its menu
  items; never home.

## 6. One line about the business, Tone

`identity`/`copy`/`rewrite` rules of `seed/personalize.json` cover the home page's hero and intro (P2: name
the fields). The tool reads `about` and `tone` itself; nothing for the template beyond listing those fields.

## Personalization — three files, and no package ships without them (P4.5)

Moved here from `SKILL.md`, which keeps the phase row (P4.5) and the gate names.

A Tracy template must turn the customer's copy into **the customer's** site: business name, sector,
address, hotline in place of the demo text. That is done by **three files inside the package itself**, not by
Tracy from the outside:

| File | What it is |
|---|---|
| `seed/questions.json` | The questionnaire the customer answers before the site is built (`tracy-questions/v1`). The `name` question is mandatory; every label must have **every language** listed in `languages`, otherwise a Vietnamese form gets an English line wedged in. `tools/release.mjs` pushes this very file to the release as `tracy_site_question.json` — Tracy reads the questionnaire there (ADR 0017) |
| `seed/personalize.json` | The map: which answer lands in which collection/slug/field. Six kinds — `identity` (written verbatim; a missing answer **leaves it empty**, it does not keep the demo text), `replace` (demo brand name → customer name, everywhere, as a plain substring; `{find, with, word: true}` matches the whole word only — set it when the demo brand is a short word such as `RES`, which would otherwise also rewrite RESERVATIONS and FRESH), `copy` (the model writes for the sector), `rewrite` (rewrite the whole entry), `facts` (**delete**: project counts, founding year, certifications, client names — inventing them is lying in the customer's name), `trim` (`[{collection, keep, why, leadsTo, list}]`: demo rows beyond `keep` leave the site **before** anything is written into them — no PUT, no republish; with no model, every collection in `rewrite` keeps **0** rows and the `list` page is hidden; links to removed rows are changed to `leadsTo`) |
| `tools/personalize.mjs` | The kit tool that reads the two files above and writes to the site through the Admin API (draft → publish, with receipts, rerunning changes nothing more). Copy it from `scripts/tools/`, do not rewrite it. Model: `TRACY_SEED_TEXT_PROVIDER` (the one `/ops` assigns) → `TRACY_MODEL_URL` → DeepSeek → OpenRouter; the report records the `model` actually used. The report separates `errors` (failed writes — exit code **4**), `unanswered` (missing answers), `skipped` (valid skips). Each mutation writes two lines to `data/personalize-journal.jsonl` (before/after, with `before`, `after`, `rev`, `origin`); a `generated` cell without `evidence` is rejected at the write door. `--inspect --json` reads the journal against the live site; `--revert <applyId> --json` returns the latest run to `before`, refusing when a cell was hand-edited afterwards |

`scripts/new-template.sh` puts the two `seed/*` files in place as **placeholders**; filling them is the
template author's job. Left as is, `tools/release.mjs` refuses to package — on purpose.

🔒 **Why this is a gate and not advice.** Until 19/09/2026 the kit had no such tool and
did not mention the other two files. `tracy-saas` 1.0.0 therefore shipped a release with none of the three — and
**nothing went red**: the package was valid, every gate green, the built site ran. The customer was still asked the questionnaire
(Tracy falls back to the CMS default set when a release lacks `tracy_site_question.json`), typed in the business
name, and then got back the sentence *"this template has no personalization tool"* on a site still full of the
template's demo text.

## Checklist (before P8)

- [ ] `settings.title: "{name}"` and an `identity` rule for every brand-name field of the chrome
- [ ] the copyright field written from `{year}` and `{name}`; no literal copyright in a component
- [ ] schema: image field `logo_dark` on the chrome entry; `seed/personalize.json` `brand.logoDark` names it
- [ ] every logo spot is `<BrandLogo>` with `logoSpots(logos, 'themed' | 'dark')` and an `imgClass` height cap
- [ ] `.brand-when-light` / `.brand-when-dark` rules in `global.css`; no `filter`/`content:url` on a logo
- [ ] the template's `<link rel="icon">` only behind `templateIconWanted(settings)`
- [ ] `<html lang>` and hreflang through `displayLocaleOf`; chrome words from a word table by display tag
- [ ] header pages on the `primary` menu; the release carries `tracy_site_pages.json` that passes `--check`
- [ ] `tests/brand.test.mjs` and `tests/display-locale.test.mjs` pass in the template
