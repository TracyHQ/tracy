# Editability Standards — the rules that gate the WHOLE review

> **Cross-cutting. Applies to phases 3–9.** Read this once at the start of a build and re-check it at
> Phase 8b. SKILL.md carries only the 6-bullet summary; this is the full, canonical version. These are
> the highest-impact lessons from real JoomlArt dev reviews — every point below came from an actual
> reviewer **rejecting** a build. A template that looks perfect but breaks any of these is rejected,
> because the buyer is a **normal user who edits in the admin UI, never in code.** Treat as
> non-negotiable.

## The one rule that drives everything

> **Ask of every text / image / link / section: "can the owner change this in the admin, with no
> code?"** If no, it is built wrong — convert it to an **ACM block / native module / Joomla view.**

Design-time guidance lives in the input adapter for your source (`inputs/from-*.md`). Review
checklist + live probes:
`review.md` (Phase 8b) — which runs every rule below as a live audit.

---

## 1. EVERYTHING the owner edits = ACM block / native module / Joomla view — NEVER Custom-HTML

This includes **chrome and pages**, not just home sections.

- **Marketing pages are NOT articles.** About / Features / Services / Solutions / Team / FAQ /
  Pricing / Changelog / Integrations … must each be a **stack of ACM modules** (one per section),
  rendered into the page via the menu item's positions or **`{loadposition <page>-page}`** in a
  minimal article. **ONLY the blog stays `com_content` articles.** A multi-section marketing page
  baked into one article body is a defect — the user can't edit it without breaking the markup.
- **Footer & header chrome are ACM too:** footer brand (logo/tagline/socials), footer copyright +
  legal links, header/off-canvas CTA buttons, newsletter → **ACM blocks** (or `mod_menu` for link
  columns). The owner must change the logo, tagline, **copyright year**, CTA labels in the UI.
- **Functional widgets = real extensions:** newsletter → **Acymailing** (`mod_acym`, bundled at
  `docs/acymailing/`), shop → VirtueMart, etc. Never a dead static form. Integrate the JA stack where
  relevant (JA Masthead, JA ACM, JA Content Type) plus 3rd-party (Acymailing/VirtueMart/JomSocial…).

## 2. ACM language strings must RESOLVE in the admin, not just be defined

Every block field `label="X_LABEL"` needs a string in `en-GB.tpl_<tpl>.ini` — AND that file must
ALSO exist (synced) at **`<site>/language/en-GB/en-GB.tpl_<tpl>.ini`**, because the JA ACM addon
loads it via `Language::load('tpl_<tpl>', JPATH_SITE)` (site language dir, NOT the template dir). A
missing/stale site copy → every ACM field shows **raw `*_LABEL`** in the admin editor. **Keep both
copies in sync.** ACM blocks must also **render every field** they expose (e.g. avatar/company
actually output).

## 3. Mega menu = PLAIN-TEXT titled columns, fully UI-editable

No per-item icons, no subtitles, no featured/CTA/promo columns, and **no `html/mod_menu` overrides**
that hardcode icons (official JA templates ship ZERO mod_menu overrides). Column titles are editable
in the T4 Megamenu builder. Secondary nav = plain dropdowns.

## 4. Complex visuals → swappable IMAGES, not hand-drawn SVG/CSS

A code/terminal panel, chart, or dashboard must be a **`media`-field image** the owner swaps (export
the design's **dark** mockup node — reads on both themes). A hand-coded SVG the owner can't change is
not a template.

**Recipe:** export **WebP q≈82** at ~2–3× display width (hero ≈2K/2048–2400px, half-column split
≈1600px → ~15–45 KB); store the served file at the **site root** `images/…` (where `media` paths
resolve, NOT the template dir; `curl` it → 200); set the field, **clear any old `media-html`**
(renderer prefers it over the image); if the image is self-contained, render only the `<img>` (no
double window frame). Full recipe: review guide §3.7a.

- **Only COMPLEX VIEWS become images — simple SVG icons/brand logos/glyphs keep rendering.** Never
  strip icons when imaging a view; if an icon/logo slot is empty, seed it (e.g. CC0 Simple-Icon SVGs,
  neutral fill that reads light+dark) — don't ship blank logo slots.
- **Each section's image must be DISTINCT & on-topic.** If the design reused one mock across several
  splits, differentiate them (header/active tab/stats/caption) before exporting — never ship the same
  dashboard 2–3× on a page (`md5` collision across sections = bug).

## 5. Whole-card links must style every child

A whole-card `<a>` must style **every** child (title/excerpt/meta/badge + shared classes) or the
unstyled children inherit the link colour and the card renders all-blue/unstyled.

## 6. Menu hygiene (backend tree == visible nav, exactly)

- Home lives in the **Main Menu** (never a hidden `home-hidden` menu + url proxy). Extra menus only
  for multilingual.
- Backend menu == the visible site nav: **NO** hidden (`menu_show=0`) destinations, **NO** unpublished
  demo leftovers, **NO** leftover scaffolding menu types (Brands / T4 Framework / Layouts / Joomla
  pages…), **NO** duplicate items → same page. Build the real sub-item structure shown; don't
  alias-to-hidden-canonical.
- **Every menu item has a real Menu Item Type** and links to a target that **exists** (no `id=89` with
  no article). Internal links use **`Itemid`**, not hardcoded SEF (SEF breaks when items move).
- Rebuild the nested set after any menu change.

## 7. Module titles MUST be `[<Tpl>] <Page> - <Section>`

So they're findable + sortable in Module Manager (hundreds of modules are otherwise unsearchable):
the `[<Tpl>]` prefix groups ALL of a template's modules (filter the whole template at once), then
`<Page>` groups a page's modules, then `<Section>` says what it is.

- Examples: `[Nexora] Home - Hero`, `[Nexora] Footer - Product Links`, `[Nexora] Blog Sidebar -
  Categories`, `[Nexora] Global - Newsletter`.
- **Page** = where it renders (`Home`, `Home 2`, `Landing`, `About`, `Features`, `Pricing`,
  `Integrations`, `Team`, `FAQ`, `Changelog`, `Footer`, `Blog Sidebar`); shared chrome uses `Global`
  (newsletter, off-canvas, breadcrumbs).
- **Section** = what it is (`Hero`, `Stats`, `CTA`, …).
- (User-mandated convention — supersedes the older `[Page] Section` form; the `[<Tpl>]` prefix is the
  key win for multi-template sites.)
- Every front-page **section** = `mod_ja_acm` (or `mod_articles_category` for a lean blog) — never
  `mod_custom`. **Footer columns** = `mod_menu`; footer brand/copyright + header/off-canvas CTAs +
  newsletter = ACM blocks. No duplicate / unpublished / trashed leftover modules.

## 8. Template styles map to LAYOUTS, not pages

A few well-named styles (Home + Inner + one per extra home/landing layout); **never** a style-per-page.

## 9. Override the T4-base `.moduletable` box

Override it in the template scss (`border:1px; padding; radius; margin`) — it draws stray borders
around any `{loadposition}` / bare module.

---

## Render / functional gate (verify live: light+dark, desktop+mobile)

Search returns results; breadcrumb separators aligned; pagination icons render (not tofu); button
hover states correct (no global `a:hover` leak); no horizontal overflow.

## Demo content gate

One **topic**, coherent voice; rich, realistic articles (no thin stubs, no lorem); real on-topic
images; the demo **SELLS** the template (buyers decide on the demo). Show the template's **signature
feature menus** prominently; push auxiliary pages (auth/404/typography) to less prominent spots.
