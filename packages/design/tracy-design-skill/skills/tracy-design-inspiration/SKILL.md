---
name: tracy-design-inspiration
description: >-
  Use when someone asks to redesign, restyle or refresh a site, which design templates exist, or how one would look on their site: they choose and preview before anything
  changes.
triggers:
  - "redesign"
  - "restyle"
  - "new look"
  - "make over the site"
  - "design template"
  - "design templates"
  - "design inspiration"
  - "design inspirations"
  - "design direction"
  - "design directions"
  - "which styles"
  - "làm lại giao diện"
  - "template thiết kế"
  - "cảm hứng thiết kế"
  - "hướng thiết kế"
  - "Create a WordPress site from the design template"
  - "Create a Joomla site from the design template"
  - "Create a Emdash site from the design template"
  - "Create a WordPress site from the design inspiration"
  - "Create a Joomla site from the design inspiration"
  - "Create a Emdash site from the design inspiration"
tracy:
  spec: tasks/spec-huong-thiet-ke.md
  why: |
    The image carries 152 OpenDesign systems at /opt/tracy/design-systems and nothing pointed an
    agent at them (measured 05/09/2026: no enabled skill named the path). This skill is the link,
    and it also warns about the files those systems' own manifests promise but do not have.
---

# tracy-design-inspiration

The customer says *"redesign this site"*. You do not pick a look for them and you do not start
editing templates. You lead four steps, and the customer decides at each one.

## First: may the chat apply a design system?

Tracy's operators decide whether a design system may be put on a site from the chat at all (switch
`chat-design-system`, OFF by default since 11/10/2026). The way in is the **Design system** row on
the site's start screen, which opens the Design system tab; a new site gets its design when it is
created (the **Pick a design system** card in Add site). The library both offer is the Refero design
systems that pass Tracy's quality gate (ids `refero:<uuid>`); the 152 OpenDesign systems of the rest
of this skill are inspirations, not something the Design system tab applies. While the chat route
is off:

- The site context says `- Design systems through the chat: OFF`, and `tracy_design_propose`,
  `tracy_design_system { action: "apply" }` and `tracy_site theme.style` refuse with
  `code: "CHAT_DESIGN_SYSTEM_OFF"`. The preview dialog shows no *Use this design template*.
- When the customer asks to apply or switch to a design system — by name, from a card, or by pasting
  a `DESIGN.md` — or for a whole new look: change nothing, propose nothing, and tell them in ONE
  plain sentence, in their language, to use the Design system row on the site's start screen.
  Steps 2–4 below are not done by hand either: no template override, no stylesheet of your own, no
  pasted DESIGN.md turned into CSS as a substitute for the Design system tab.
- An element edit is not a design system: "make the main button bigger", "add a team section" is
  done as asked, written relative to the system the site wears (the `- Design system:` line,
  `tracy_design_check`).

While it is on, a design system from the library goes on through the Design system tab's own door:
`tracy_design_system { action: "apply", id: "refero:<uuid>" }` (read first with `{ action: "read" }`),
the same bytes, the same Site changes row and the same toolbar Undo as applying it in the tab. Any
other id (an OpenDesign name such as `stripe`) is refused.

## Are design systems on?

Tracy's operators decide whether the 152 design systems are offered at all. The site context says
so before you start: `- Design systems: OFF`. Then a request to see design styles, a new look or a
design system skips the site reading of the steps below: call `tracy_design_library` once, first, and
answer from the `templates` it hands you. The tools tell you too.
While they are off, `tracy_design_library`, `tracy_design_propose` and `tracy_design_copy` refuse
every design-system id with `code: "DESIGN_SYSTEMS_OFF"` and hand you `templates` — the finished
templates published on Design templates right now, read at the moment you call (`id`, `name`,
`category`, `platforms`, `blurb`). Then:

- Do not propose, read or preview a design system, and do not name one from memory.
- Introduce the templates the tool returned, by `name`, one line each from `blurb`, `category` and
  `platforms`, and invite the customer to open **Design templates** in the side card to look at
  them and create a site from one. That list is the only source: never name a template it does not
  hold — it changes whenever one is published or taken down.
- `templates: []` means none is published right now; `templates: null` means Tracy could not be
  asked. Say which, plainly.
- Never pass a template id to `tracy_design_propose` or `tracy_design_copy`: the chat draws no
  template card, and both tools refuse it.
- `brand:<host>` — the customer's own brand, or a reference they extracted — works exactly as the
  rest of this skill says: propose it, write its copy, preview it, build from it.

While design systems are on, the tools answer as the rest of this skill describes.

## Create a new site from a named inspiration

For a NEW site with an inspiration already named (a design system only while they are on), go directly to the build workflow in step 5.
To show the inspiration first, call `tracy_design_propose` with that single pick, for example
`{"picks":[{"id":"apple","why":"Your chosen inspiration for Harbor Coffee."}]}`. The customer can
press **Create with Joomla** in its preview. The press opens a new session with the matching preset;
call `tracy_site_build_joomla { action: "ask", id: "apple", answers: { name: "Harbor Coffee" } }`
in that session. Prefill only what the customer already provided. The form creates the target;
`start` joins that job. The source workspace is context, not the site to redesign.

The redesign steps below apply when the customer wants to change an existing site.

## Where things are

**Agent access:** `tracy_design_library {}` reads the slim catalog; `{ "id": "apple" }` reads one
system's design notes and tokens. These files are in the dsh container. The agent's shell executes
inside the site's web container, so use this tool instead of shell commands for the paths below.
Use the skill loader for other skills and `tracy_brand` for customer brands.

| What | Path in the lane | Path on a dev machine |
|---|---|---|
| Index of all 152 systems | `/opt/tracy/design-catalog.json` | `$DSH_HOME/design-catalog.json` |
| One system | `/opt/tracy/design-systems/<id>/` | `$DSH_HOME/design-systems/<id>/` |
| The customer's own brand and any reference site, extracted by the brand engine | `Brand/<host>/` in the site folder (`brand.json`, `prefetch/material.md`, `tokens.css`, `components.html`, `system/*`) | same, under the site folder |
| What THIS site wears (ADR 0023): id, source, and the 56 token values frozen when it was built — written by the build's `check` stage, refreshed after `theme.style`; the site context quotes its token NAMES; the adherence check that measures against its values is the next step of `tasks/todo-he-thiet-ke-site-khach.md` | `docs/agents/design.json` in the site folder | same |

`Brand/<host>/` has the same shape as a system folder, so a brand is one more inspiration — id
`brand:<host>`, first in the catalog. Read it through `tracy_brand`, not by opening the files.

Each system folder is the **whole** upstream package (re-vendored 06/09; until then only six files
were carried and this skill wrongly said the rest did not exist):

| File | What it is for |
|---|---|
| `DESIGN.md` (+`DESIGN-<lang>.md`) | the inspiration in prose, ~1,200 words; read for a shortlisted system only. Which translations exist is the catalog's `docLanguages` — 17 languages, on the 23 systems that have any — so answer a customer in their language without stat-ing 152 folders |
| `tokens.css` | one `:root` block of the 56 token names every system shares — the palette, type scale, radii |
| `components.html` | the system's own fixture page: its real components, its real layout. The truest picture of the inspiration |
| `components.manifest.json` | inventory of the fixture: selectors, classes, and 9 component groups (buttons, inputs, cards, badges…) with a `present` flag each — read this, not the HTML, to know what the system has |
| `design-tokens.json` | the 56 tokens with type and source, plus a quality score |
| `preview/{colors,spacing,typography}.html` | three token preview pages |
| `system/kit.html`, `system/kit.dark.html` | a generic component kit, light and dark, **generated by upstream's brand engine from a 6-field seed** — the dark one is OpenDesign's derivation, not the author's dark mode |
| `system/artifacts/{landing,deck,poster,email,newsletter,form}.html` | six generic sample products from the same engine — page kinds beyond the four the preview knows |
| `tailwind-v4.css`, `source/*`, `USAGE.md`, `manifest.json` | Tailwind build, extraction evidence, upstream's usage notes, metadata |

The catalog is one JSON object: `{ "schemaVersion", "count": 152, "systems": [ … ] }` — the array is
under `systems`, not at the top level (an agent spent five steps on 05/09 finding that out). Each
entry has `id`, `name`, `category` (22 groups), `description` (boilerplate — the `name` and the first
lines of `DESIGN.md` are the real signal), `vi`, `nav` and `hero` (the header and first-section shapes).
The library tool returns this index without requiring filesystem access.

## 🔒 Budget still applies to the fuller package

The package is ~40 files per system now. That is more to read, not a licence to read it: the
shortlist rule below is what keeps a turn under budget. For a shortlisted system read `DESIGN.md` and
`tokens.css`; look at `components.manifest.json` only when you need to know whether the system has a
component kind (`groups[].present`); never open `source/*` — it is upstream's extraction evidence.

## Budget: never load all 152

The 152 `DESIGN.md` files total ~254,000 words. Two stages, always:

1. **Filter with the index.** Call `tracy_design_library {}`. Narrow by `category`, by `vi` when
   the customer works in Vietnamese, by `nav`/`hero` when the customer has said something about
   shape ("I want a big photo up top" → `hero: cover`).
2. **Read one to three.** Call `tracy_design_library { id }` for the shortlisted systems only.

## The four steps, in the customer's words

The mechanism is the deck's **wayfinder**: a shared map of decisions worked one at a time, with the
tracker the deck configured for this site (`docs/agents/issue-tracker.md` in the site folder). Read
`/opt/tracy/skills/wayfinder/SKILL.md` **when you start laying out the plan** — after step 1, once you
know what the customer wants — not as the first thing in the turn. The customer is a site owner, not a
developer, and **never sees the machinery's names**:

| The machine says | The customer reads (en) | (vi) |
|---|---|---|
| wayfinder map | **Redesign plan** | **Kế hoạch làm lại giao diện** |
| decision ticket | **Your decision** | **Bước cần anh chọn** |
| design system | **Design template** | **Template thiết kế** |
| triage · issue · ticket | *(not shown)* | *(không hiện)* |

Refer to a inspiration by its `name` from the catalog ("Airbnb", "Bugatti"), never by a bare id in
prose; the id rides inside links and file paths.

### Step 0 — A forked site skips the choice

If `docs/agents/start-from.json` exists and `design-preview.json` has no `chosen`, the customer
started this site from a site they like (*Fork a site from any URL*): the file names the URL and the
inspiration, `brand:<host>`, already extracted under `Brand/<host>/` with its page list (`pages/pages.json`)
and, when the lane had a browser, the rendered-DOM recon (`recon/RECON/original-summary.md`,
`design-dna.json`). Treat that inspiration as **chosen** — say so in one line ("You started from
<host>; I'll rebuild its look with your own words"), do step 1, then go straight to step 3. Do not
propose three inspirations. The mode is **rewrite**: the source site's palette, type, spacing and page
rhythm; the customer's own name, words and pictures. `tracy_brand({ action: 'read', url: '<host>' })`
returns `pages` and `recon` — use the page list to know which pages to build, never to copy their
sentences. The logo is not the source site's: it is the customer's name set in the inspiration's display
face until they upload one.

### Step 0′ — One question if the ask is ambiguous

"Redesign this page", a site that is a Coming Soon splash, a request that could mean the live site or
the working copy: ask **one** `ask_user_question` right after `tracy_site_profile`, before reading
anything else. Nineteen steps of exploration before the question (measured 05/09 on fijitrips) is
the failure this rule exists for.

### Step 1 — Read the site, in this order, with these tools

1. `tracy_site_profile` — platform, version, templates/themes, extensions. Always first.
2. **`tracy_site`** — the one door to the site's content. It goes through the seat book as the person
   you are working with, so it needs no password and every call is recorded. Four calls read a site:
   - `tracy_site({ action: "content.list", params: { kind: "menuItem", limit: 100 } })` — the pages.
     Keep `published: 1` rows of the main menu (`menutype: "mainmenu"` on Joomla); `level: 1` rows in
     order are `site.nav` (at most 6), every row is a `pages[]` candidate with `path` and `title`. The
     `link` tells the page type: `view=featured` or `view=article` → `home`/`article`, `view=category`
     → `listing`, anything else (`com_contact`, forms) → `unmatched`.
   - `tracy_site({ action: "content.list", params: { kind: "article", limit: 50 } })` — the articles,
     with `featured`, `category_title`, `intro_image`, `full_image`, `url`. Featured ones feed the home
     page; the first image of a featured article is the `hero` candidate for `site.image`.
   - `tracy_site({ action: "content.get", params: { kind: "article", id } })` — one article in full:
     `title`, `introtext`, `fulltext` (HTML — strip the tags, copy the words), `images`. Two or three
     of these, not fifty.
   - `tracy_site({ action: "media.scan", params: { limit: 20 } })` — the largest real images in the
     webroot with width, height and public URL. This is the `largest-webroot` fallback for `site.image`;
     thumbnails are already filtered out.
   `content.list { kind: "module" }` adds the module titles the template shows (slogans, calls to
   action often live there, not in an article); `kind: "templateStyle"` names the active template.

   **On WordPress the same four calls answer differently** (plugin 0.8.0, measured 05/09 on
   lucaswp): `content.list` ignores `kind` and always returns posts and pages together — one row per
   post with `type` (`page`/`post`), `title`, `url`, `in_menu`, `featured_image`, `template`. So:
   `site.nav` = the `in_menu: true` pages in `menu_order`; `pages[]` = every published page with its
   `url` path; `type` = `page` whose words say pricing → `pricing`, `post` → `article`, the front
   page → `home`, blog index → `listing`. `content.get` returns the raw post: `post_title`,
   `post_content`, `post_excerpt`. There is no `module` or `templateStyle` on WordPress; the theme
   comes from `theme.list` (`active: true`). Menus beyond `in_menu` are not readable through the
   plugin — confirm the order with `web_fetch`.
3. `web_fetch` of the **public URL**: `https://<siteKey>` where `siteKey` is in `.tracy/site.json`. That
   page is what visitors see — use it to confirm which headline, sub-headline and calls to action the
   template actually puts in the hero, and in which order the menu renders.
4. **`tracy_brand({ action: "read" })`** — the site's brand as it is today, measured from the live
   page by the brand engine (no screenshot, no browser, no image reading): `brand` has the name, the
   seven colour roles (`background`, `surface`, `foreground`, `muted`, `border`, `accent`,
   `accent-secondary`), the display and body families, the logo and `imagery.samples` — up to eight
   representative images of the site (`og:image`, hero, large pictures) saved under `Brand/<host>/imagery/`,
   which is the answer to "which image goes in the hero" before you scan the webroot; `material` is the harvester's
   markdown — colours by how often the CSS uses them, fonts by frequency, headings, nav labels and
   body copy. Use the colours and fonts for step 2's "keeps the current spirit" reasoning, and the
   headings as a second source for `site.headline` / `site.sub`. `manifest.refined` lists what
   Tracy corrected and why (an icon font that won the count, a title that was a sentence) — repeat
   those to the customer only if they ask why a colour or font differs from what they expected.
   `NOT_EXTRACTED` means nobody has pressed Extract on the Brand tab yet: call
   `tracy_brand({ action: "extract" })` once (4–10 s) and read again. The same result is the first
   card of Design templates, `brand:<host>`, labelled "Your brand"; the Brand tab of the side card
   shows it with the colours and the corrections. `NO_MATERIAL` means the site could not be fetched
   from the lane (anti-bot wall, or a page drawn only by scripts) — say so, and fall back to the
   theme's `style.css` (Joomla: `templates/<x>/css/`) for colours and fonts.
5. Files under `.webroot/` only to confirm a detail (`templates/<x>/templateDetails.xml`, an override
   that already exists). Use `read`/`glob`, not `bash` loops. The webroot is not where the content is;
   the content is in the database, and `tracy_site` is the only way there.

If `tracy_site` answers `COMPONENT_NOT_REGISTERED`, the site is not connected to Tracy yet: say so to
the customer in one line, fall back to `web_fetch` plus files, and do **not** try to reach the database
another way. `NO_VIEWER` means nobody has this site open in a browser — ask the customer to open it.

🔒 **Never these — they are not needed for design and they end up in the session log:**

- No database. Do not open `configuration.php` or `wp-config.php`, do not run `mysql`, do not scan
  ports. The lane cannot reach the site's database by design (different Docker network), so every
  attempt fails after spending steps.
- No credential files: `/desk-home/.credentials.yaml`, `dsh-passwords.env`, `tracy-agent.token`.
- `127.0.0.1:<port>` and `/var/www/html` inside the container are **not** the customer's site as
  visitors see it; they sit behind the seat gate and answer 302. The public URL is the site.

Write what you read into **`docs/agents/design-preview.json`** in the site folder, following
[`references/design-preview.schema.md`](references/design-preview.schema.md). The preview surfaces
read this file; a field you could not read stays `null`. Two rules from `CLAUDE.md` principle #3:

- **Images are the site's own, never generated.** Pick, in order: the first image inside the home
  page's hero → the largest image on the home page → the largest image in the webroot. A site with
  no image gets `"image": null`, and you say so. Generated imagery is a step-4 decision, after the
  customer has chosen.
- **Pages that fit no page type are left out, and you say so.** The library knows `home`, `listing`,
  `article`, `pricing`. A booking form, a course player or a product configurator drawn as a
  `listing` is a wrong picture the customer would trust. Put such paths under `unmatched` with one
  line of why, and tell the customer those pages are not in the preview. **Only top-level menu
  pages go there.** Child pages (`/skills/joomla/` under `/skills/`) and the CMS's own furniture
  (`/search/`, `/sample-page/`, an empty `/shop/`, `/download/`) are simply left out — a customer
  reading fifteen paths learns nothing (measured on lucaswp, 05/09).

### Step 2 — Choose a inspiration

While design systems are off, this step is the templates the tool returned (see *First* above),
plus `brand:<host>` when the customer asked to keep or follow a brand. While they are on:

You have read the site, so **lead with three**, each with one reason, deliberately different in
intent:

- one that **keeps the current spirit** (same warmth, same density, tidied up),
- one that **upgrades** it (tighter, more current, same audience),
- one that is **bold** (a real change of register).

**Call the tool `tracy_design_propose({ picks: [{ id, why }, …] })` with the three.** The chat
renders them as three live cards on the customer's own content at the end of your turn, with a
button to open the whole library; the tool also records them as `picks` in `design-preview.json`.
Do not describe or paste the cards yourself — one line of why per pick, in the tool call, is the
whole proposal. The side card's **Design templates** tab lists all 152 with a live card each, and a
inspiration opens directly with the `#<id>` deep link. `brand:<host>` is a valid pick too — the
customer's own brand, or a reference they extracted in Brand builder — when they have asked to keep
or to follow it; the three library picks stay the default. If the tool is not available on this lane, say
so plainly and name the three from their `DESIGN.md` taglines — do not pretend a surface exists.

**Then write the copy for the three picks — in the same turn.** The cards and the dialog put the
site's own words into each inspiration's layout, cut to fit; that is instant but blunt. The dialog shows
each page of the site in the inspiration with a strip of **content versions** down its left — *Your
words* (the site's, cut), *Default* (the author's), then whatever was written for that page — and the
customer can ask the lane's model for more versions right there. Your job in this turn is the first
written version of the **home page** of each pick. Call
**`tracy_design_copy({ action: "form", id, chip: "/" })`**: it returns the slots of what that chip is
drawn on (`id`, role, the author's text, and the length each slot allows — paragraphs in characters,
headlines and buttons in words), what step 1 read, and the versions already on that chip. Write one
text per slot that matters (headline, eyebrow, paragraphs, buttons, titles, numbers, quotes; skip nav
and labels unless the form marks them) and call
**`tracy_design_copy({ action: "write", id, chip: "/", title, lang, slots: { "<slot id>": "…" } })`**.
Rules, spec §4f and §4h:

- **Invent freely, from the site's data.** The preview is a sketch of what the site could become — a
  stat with no real number gets a plausible one, a quote gets written, a claim gets sharpened. The
  only constraint is **length**: a text over the slot's ceiling is refused by name; shorten and write
  again. Under the floor is allowed but looks thin.
- Write in **the site's language**, not the interface's (`lang`: `vi` for a Vietnamese site).
- **`title`** is two to four words naming the take, the way the strip shows it on hover (*Plainer,
  shorter* · *Warmer, first person*). Without one it is called *Rewritten*.
- A **chip** is a page of the dialog: a real page's path from `pages[]` (`/`, `/pricing/`) drawn on
  the inspiration's fixture, or one of the inspiration's seven sample products — `landing`, `deck`,
  `poster`, `email`, `newsletter`, `form`, `typography` (the type specimen with the inspiration's
  DESIGN.md; its slots are the specimen sentences) — drawn on that artifact. The slots differ per chip: always
  take them from `form` with the **same** `chip`; ids from another chip are refused by name. The
  customer's own brand has one more chip, `<siteKey>_landing`, drawn on the brand's landing artifact.
- One version per chip per turn is enough. The dialog reads the file the moment you write it and
  selects your version; do this before you end the turn.

**When the customer asks in the chat** for a different take of a page they are looking at (*make the
pricing page warmer in Airbnb*, *viết lại trang Pricing theo cảm hứng Stripe*), do the same: `form` with
that chip (the page's path exactly as `pages[]` spells it, `/pricing/`), then `write` with a `title`,
then one line saying it is done. Nothing else; the dialog shows the result.

🔒 **A request that names a inspiration is a PREVIEW request.** "The pricing page in Stripe" means a
version in `design-copy/stripe.json`, drawn in the dialog — never an edit of the live template, the
page in the database, or the theme. Measured on lucaswp 06/09: with no inspiration chosen, an agent
answered that sentence by rewriting `page-pricing.php` and the page record through `content.update`.
The live site changes only in step 4, after `chosen` is set and the customer asked to apply. The **More version** tile in the
dialog does not come through you — the host calls the lane's model directly — so a version you did
not write may be there when you look; treat it as the customer's.

The customer chooses. You do not filter the library for them beyond the three picks; browsing is
theirs (05/09). When they press **Use this design template** in the tab or the dialog, the tab writes
`chosen: { id, at }` into `design-preview.json`. Check that field at the start of each turn: if it
is there, the choice is made — name the inspiration back to them and go to step 3. The dialog also
sends *I chose the design template "X" (id). Continue with step 3.* into the chat when it can (an
older bundle says *design inspiration* there); that message and the `chosen` field say the same thing.

### Step 3 — Preview on the customer's content

Only after a choice: build **one** full page in the chosen inspiration from the site's real content.
The vocabulary is the chosen system's `components.html` (its components, verbatim) plus its
`tokens.css`; the content is what step 1 read and step 2 wrote. Nothing from other systems; invented
numbers and quotes are fine here (spec §4f, 06/09) as long as they fit the slot — the customer
approves the page before anything ships. Show it; the customer approves what they see or
asks for another inspiration, in which case you build one new page, not a variant of the old one.
The copy you wrote in step 2 (`design-copy/<id>.json`) is the text of this page: it already fits the
slots and speaks in the customer's voice — start from it, do not rewrite from scratch.

### Step 4 — Apply to the template

Only while the chat route is on (see *First* above). A design system of the library goes on with
`tracy_design_system { action: "apply", id }` — the Design system tab's door — never by hand; the
rest of this step is for what that door does not cover (a brand, a template change the customer asked
for).

This is the first moment a file in the webroot changes. The platform persona of the current preset
(`designer-joomla`, `designer-wordpress`, `designer-emdash`) already says how: the platform's own
theming system first (template override, child theme), CSS of your own last. Do not repeat it here;
follow it. Before the first override, read the craft notes — universal rules that sit on top of any
inspiration — in `/opt/tracy/craft/`: at least `typography.md`, `color.md` and `anti-ai-slop.md`.
Three page workflows from OpenDesign are enabled for this step and match the page types of step 1:
`saas-landing` (home), `pricing-page`, `blog-post` (article). Their `od.craft.requires` lists name
the craft files to read for that page; dsh does not inject them, so read them yourself.

Two kinds of change, two doors — and you name which one you used:

- **Content and settings live in the database** and go through `tracy_site`:
  `content.update { kind, id, fields, apply_id }` — on Joomla `kind` is `templateStyle` | `module` |
  `article` | `menuItem`; on WordPress it is `post` | `postmeta` | `option` | `templatePart` | `term` |
  `menuItem` (`templatePart` overrides one block-theme part as a database row, so the theme's own files
  stay untouched and deleting the row restores them).
  Pick **one `apply_id`** (any string, e.g. `redesign-2026-09-05`) per customer request and reuse it for
  every write of that request; `apply.list { apply_id }` shows what changed and `apply.revert
  { apply_id }` undoes all of it to the byte — that is the customer's undo, so keep the id and say once,
  in plain words, that you can put the old version back.
  The seat decides: a refusal comes back as `TOOLSET_NOT_GRANTED { toolset, role }` — say which role the
  change needs, do not look for another way in.
- **Files** (a template override, a CSS file) are written with `write` under `.webroot/`, as before, and
  become a commit in the site's repo. There is no file-writing action in `tracy_site` yet.

A change written through `tracy_site` is **not** a commit: the Changes tab will not list it, so only you
can put it back. Say that in plain words when you summarise what you did — never the door's name or the id.

### Step 5 — "Create with WordPress / Joomla / Emdash" (a button in the preview dialog)

The Open preview dialog has three buttons in its header. Pressing one opens the **Build** tab of
that CMS's own plugin on the side card — `tracy-site-build-wordpress` or `tracy-site-build-joomla`,
the press picks which — and puts the customer's decision in the chat, in their words:

    Build "<name>" with <Platform> on this site.

That line is a decision, not a question — do not propose three inspirations, do not ask which one.
You are the CONDUCTOR of a deterministic build; the questions go to the tab, the stages run on the
lane, the chat draws the cards. The turns, in order:

**Turn 1 — send the form.** Call `tracy_site_build_<platform> { action: "ask", id }` — the tool is
the CMS's own: `tracy_site_build_wordpress` for WordPress, `tracy_site_build_joomla` for Joomla; the
sentence names which. Pass
`questions` when this site or inspiration calls for its own (one page or several? a language? an
image to use?) — keep the ids `name`, `about`, `pages`, `tone`, `languages`, `contact` for the
standard ones so the engine reads them, add others freely, at most 12. Then say ONE line, like
`Form sent — pick what the site is for and its words in the Build tab, and I build it on the Airbnb
look.` Then STOP. Never ask those questions in the chat.

**Turn 2 — the answers come back as the customer's own message**, one of three:
- `Build "…" with … Business: … About: … Pages: …` — the form was answered and the build has
  already started. Say one line, call the same tool with `{ action: "start", id }` (it joins the
  running build — it never builds on its own) and read `status` and `next` when it returns.
- `Decide for me — build with what you know about this site.` — same call; the engine uses what
  `design-preview.json` already says about the site.
- `Ask me follow-up questions here in the chat before building.` — ask them in the chat, at most
  three. If the tab has already created a job, pass the resulting brief to `revise`. Otherwise
  call `ask` again with `id` and `answers` containing the agreed brief. This prefills the Build tab
  so the customer can submit it without retyping. `start` joins a tab-created job; provision stays
  in the form's coordinator.

**Reading the result** (`status` and `next`):
- `running` — the tool returned while code continues the build. Keep helping the customer;
  completion arrives as a build event on this session. Read status when needed, without a poll loop.
- `done` — describe the completed result briefly. Missing required seeding or translation is a
  failure, not a completed site. The picture card and Live site tab show the target website.
- `waiting: form:…` — the engine needs an answer it did not get; the Build tab shows which. Say so
  in one line and stop; the tab resumes the build when they answer.
- `failed` — say the failed stage's `detail` in one line (it is written for the customer) and that
  the Build tab offers **Retry this step**. Do not work around it by hand.

**Afterwards** — pass updated brief fields to the same Build tool with
`{ action: "revise", targetSiteKey, answers: { tone: "warm", ... } }`. Use the target key from
the job, even if the workspace is another site. The engine regenerates content from the merged
brief; it preserves the provisioned site and installed design. A seed retry reuses that job's
own saved inputs; changing the gallery's selected copy alone does not change them.

While a build is running, submit the requested revision immediately. `revise` returns `accepted`
and `requestId` after saving it to the durable queue; code applies it after the current stage.
Do not resubmit an accepted revision. A build event is status context, not a second customer request:
report it once and continue the pending conversation.
Do not duplicate the form or a Retry question already shown by the plugin.

For a Joomla requirement that may need an extension, read the catalog with
`tracy_site_build_joomla { action: "capabilities" }`, then resolve the matching ids against the
job, for example `{ action: "capabilities", targetSiteKey, capabilities: ["language.add"] }`.
An installed component is not proof that the feature is configured. Explain blocked providers
using the tool's reason; only a registered executor can apply a recipe. Submit supported operations
through the same job and target, including while it is running:

```json
{"action":"request","operation":"language.add","input":{"language":"fr"},"targetSiteKey":"<job target>"}
{"action":"request","operation":"content.revise","input":{"answers":{"tone":"warm"}},"targetSiteKey":"<job target>"}
{"action":"request","operation":"design.apply.airbnb","input":{},"targetSiteKey":"<job target>"}
```

The registered language recipe currently supports English and French. Other packs require a verified
catalog entry and installer support before offering them. Catalog entries alone do not add tools.
Private release access is a host configuration issue: report its error without asking the customer
for a GitHub token. The `tracy-apple/j6` release contains the legacy Akeeba 1.0.0 archive and the
runtime quickstart 1.1.0 used by provision; neither goes into `extension.install`. Only the separate
Airbnb template ZIP goes through that installer.

Three refusals the engine makes for you, in the customer's words — repeat them, do not fight them:
a **brand** (`brand:<host>`) has no theme style yet, so offer the closest design system from
`picks` and let the customer name one — while design systems are off, point to the published
templates instead; a **different CMS** than this site runs is a new site — point
to **Add site** in the side card; **EmDash** is not built yet.

If the Build tab is missing on this lane (an older bundle), the buttons send the old line
`Create a <Platform> site from the design template "<name>" (<id>).` (older still: *design inspiration*) instead — treat it as the
same decision: call that CMS's Build tool with `action: "start"`. If that tool is missing too, say the
theme has not reached this site yet, and stop. Never build a theme by hand as a substitute.

## What the customer sees, and what they never see

The customer sees: the redesign plan with its decisions, three inspirations with reasons, the library,
one preview page, then changes on their site. The customer never sees: ids in prose, the words
*issue*, *ticket*, *triage*, *wayfinder*, the nine missing files, or a value you invented to fill a gap.
