# Content-architecture audit — is every datum GUI-editable, DB-seeded, reproducible?

> **Phase P3 packet (pass-2 deep audit).** Read alongside `menu-sef-and-data.md` after the visual loop
> (P0–P2). Detect-side of the builder's `editability-standards.md` — here you find what isn't editable.

Pixel-perfect ≠ done. A page can match the `.pen` exactly while its content is **hardcoded in template
PHP** — so a site admin can't edit it, it isn't in the DB, and a fresh quickstart renders it blank or wrong.
This is the **pass-2 deep audit** that the visual review (P0–P2) does not catch. Run it as part of P3
(data + architecture integrity). Distilled method only — every template differs, but the method and the
defect classes recur.

## The question for every block on every page
> *Could a non-developer change this text / number / image / link / person through the Joomla/T4 admin GUI
> (no code edit), and would it survive a fresh quickstart install?*
Anything that needs a code edit → defect. The build skill's
`references/editability-standards.md` has the canonical fixes (single source);
here you DETECT.

## Method — partition the surface into content-source domains, classify each
Split the template into independent domains (parallelisable to subagents) and classify each block's source:
1. **ACM modules** (`acm/*/tmpl/*.php`) — all displayed content from `$helper->get()/getRows()`? or
   hardcoded literals/mockups? Are the live instances' params actually seeded in `#__modules.params`?
2. **com_content overrides + people** (`html/com_content/**`, author/team) — author role/bio/avatar/socials
   from **com_fields** (or a team ACM), or a hardcoded PHP map? Listings live from `#__content`?
3. **Article-body pages** (marketing pages built as articles) — GUI-editable body; images via media paths
   (`images/...`) not template-internal; NO inline `<script>`/`<link>` in the body.
4. **Chrome** (`html/layouts/**`, `mod_custom`) — logo/wordmark/tagline/masthead from site config / params /
   menu params, not literals; footer/nav/mega are `mod_custom` (DB).
5. **Images/media** — every image swappable via Media Manager (article field / module media-param / T4 logo
   setting); none buried as a hardcoded path only a dev can change.
6. **Seed / reproducibility** — does a DB dump + `images/` exist so a fresh quickstart reproduces every page?
   (Template folder alone carries NO content.)

Verdict per block: ✅ GUI-editable & DB-seeded · ⚠️ editable-but-not-portable/partial · ❌ hardcoded in PHP.

## Fast detection — grep the template, then confirm live
```
grep -rn 'href="#"' html acm                         # dead links (some auth/OAuth stubs are acceptable — list them)
grep -rIn 'Stratum\|<brand>' html acm | grep '\.php:' # hardcoded brand strings (exclude $site_name/params/comments)
grep -rIn -E '>[0-9.]+(k|K|M|B|%)\b' html acm         # hardcoded stat numbers (exclude helper/field)
grep -rIn -E '<img src=|url\(|<link|<script' html acm # images/css/js that should be media-field/addStyleSheet/addScript
```
DB-side:
- ACM params seeded? `SELECT id,title,LENGTH(params) FROM #__modules WHERE module='mod_ja_acm';`
- Article bodies with embedded `<script>`/`<link>`? (WYSIWYG "clean" save silently strips them → page breaks.)
- com_fields exposed on registration (see platform-latent-bugs CA-3).
- Leftover **clone placeholders** from `t4_bs5_blank`: demo categories (People/Food and Drink/Magazine),
  2021 demo articles, demo tags, `t4-blank-logo.png` in `etc/site/*.json` — these surface on
  Categories/Category/Archive/Tag pages and the logo. Confirm taxonomy menu items point at the DESIGN's
  real content, not the clone's demo tree.

## Recurring content defects to check (tags — see also `recurring-defects.md`)
- `[HARDCODED-COPY]` literal text/number in override PHP instead of param/field/language-key.
- `[HARDCODED-PEOPLE]` author/team data in a PHP map, not com_fields / team-ACM.
- `[FAKE-STAT]` same invented number for every item (followers/reads/KPIs) — should be live query or field.
- `[IMG-NOT-EDITABLE]` image as a hardcoded PHP/CSS path, not a `type="media"` field / article image.
- `[BODY-SCRIPT]` inline `<script>`/`<link>` inside an article body (strips on WYSIWYG save).
- `[RAW-LANG-KEY]` a `Text::_('KEY')` whose key is missing → renders `KEY` on screen.
- `[CLONE-LEFTOVER]` `t4_bs5_blank` demo categories/articles/tags/logo still showing.
- `[FIELDS-ON-REGISTRATION]` internal `com_users.user` fields visible on the public signup form.
- `[NOT-REPRODUCIBLE]` no DB dump / `images/` not bundled → fresh quickstart can't reproduce the site.

## Reproducibility check (P4 / sign-off)
The site is reproducible only if a fresh install + the template renders every page with full content. Confirm
a **DB dump** exists (and re-imports cleanly) and `images/` travels — the basis of a Quickstart, like the
official JA products. "Copy the template folder" is NOT reproduction (content lives in the DB). Flag if missing.
→ consumed by Phase 10 preflight (this check gates the start of the packaging stage).
