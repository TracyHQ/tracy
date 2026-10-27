# Prisma — Style Reference
> engineer's blueprint on frosted glass

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Prisma uses a disciplined developer-workbench language: pure white canvas, hairline borders, and one quiet teal accent that signals action without shouting. Typography carries the brand — Mona Sans displays at 64px with 0.1em tracking create an engineered, almost blueprint-like authority, while Inter's character variants (cv01–cv10) give body text a custom-cut feel inside an otherwise standard sans. Surfaces are nearly weightless: no decorative gradients, no drop-shadow stacks, just a single 1px border at #e2e8f0 separating regions. Components are compact and functional — code blocks sit next to CTA buttons, terminal panels replace marketing illustrations, and brand color appears only when something should be clicked. The result is a page that feels like documentation and product wrapped in one surface: quiet, precise, and trusting that code speaks louder than decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Prism Teal | `#14b8a6` | Teal supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Deep Teal | `linear-gradient(rgb(13, 148, 136) 0%, rgb(255, 255, 255) 100%)` | Teal supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color; Top-to-bottom gradient from Deep Teal to white — used in the hero background as a subtle vertical wash |
| Carbon Ink | `#1d242f` | Primary headings, nav text, logo mark, heavy body emphasis — near-black with a cool blue undertone that pairs with the teal accent |
| Graphite | `#111827` | Body text, button labels, dense content text — deeper than Carbon Ink, reserved for running copy and form values |
| Slate | `#6b7280` | Secondary body text, helper copy, muted descriptions, footer meta — pulls text back without losing legibility |
| Steel | `#718096` | Tertiary text, disabled labels, icon strokes on neutral backgrounds — one step further back than Slate |
| Fog | `#9ca3af` | Placeholder text, subtle icon fills, decorative dividers — present but recessive |
| Mist | `#e2e8f0` | Hairline borders, card edges, code-block frames, grid lines — the structural glue that separates surfaces without weight |
| Bone | `#f3f4f6` | Subtle surface lift, secondary card backgrounds, alternating section bands — barely visible, used to create quiet layering |
| Paper | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |

## Typography

### Inter — Body, UI, navigation, and code-adjacent text — Inter with character variants enabled gives the system a custom-cut look inside a familiar sans. Weight 500–600 for nav and button labels, 400 for body, 375 sparingly for captions that need a lighter voice.
- **Substitute:** Inter (the system itself is the substitute; the cv features are the differentiator)
- **Weights:** 375, 400, 500, 600, 700
- **Sizes:** 11, 12, 14, 16, 18, 22px
- **Line height:** 1.10–1.50
- **Letter spacing:** 0.02–0.033em
- **OpenType features:** `"cv01", "cv02", "cv06", "cv07", "cv08", "cv10"`

### Mona Sans VF — Display and heading typeface — GitHub's variable Mona Sans brings geometric authority with subtle humanist warmth; the 0.1em letter-spacing at 64px is the brand's signature: headline text reads as engineered precision, not marketing prose. Weight 900 reserved for hero display, 650 for section headings, 700 for sub-headings.
- **Substitute:** Satoshi (700–900) or General Sans Bold — both capture the geometric-modernist character
- **Weights:** 400, 650, 700, 900
- **Sizes:** 16, 18, 24, 30, 36, 40, 64px
- **Line height:** 1.13–1.56
- **Letter spacing:** 0.1em at display sizes (30–64px), 0 at body sizes
- **OpenType features:** `"ss01", "ss02", "ss05", "ss06"`

### Mona Sans Mono VF — Inline code, terminal snippets, CLI command pills — the monospaced sibling to Mona Sans keeps code blocks visually tied to the display type
- **Substitute:** JetBrains Mono or IBM Plex Mono at weight 400
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.50
- **OpenType features:** `"ss01", "ss02", "ss05", "ss06"`

### Font Awesome 7 Pro — Font Awesome 7 Pro — detected in extracted data but not described by AI
- **Weights:** 300, 400
- **Sizes:** 14px, 16px, 18px, 20px
- **Line height:** 1

### Font Awesome 7 Brands — Font Awesome 7 Brands — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 22px
- **Line height:** 1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 11px | 1.45 | 0.33px |
| caption | — | — | 14px | 1.43 | 0.32px |
| body-sm | — | — | 16px | 1.5 | 0.48px |
| body | — | — | 18px | 1.39 | 0.36px |
| body-lg | — | — | 22px | 1.33 | 0.44px |
| subheading | — | — | 24px | 1.33 | 0.72px |
| heading-sm | — | — | 30px | 1.2 | 3px |
| heading | — | — | 36px | 1.13 | 3.6px |
| heading-lg | — | — | 40px | 1.2 | 4px |
| display | — | — | 64px | 1.13 | 6.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 6px
- **cards:** 10px
- **icons:** 6px
- **buttons:** 6px
- **codeBlocks:** 10px

## Components

### Primary CTA Button
**Role:** Single highest-priority action on a page — teal-filled, white text, used for 'Get started' and 'Create database'

Background #14b8a6, text #ffffff, font Inter 14–16px weight 500–600, border-radius 6px, padding 10px 16px, no border. Hover transitions to #0d9488. Letter-spacing 0.02–0.03em. No shadow.

### Ghost Code-Pill Button
**Role:** Secondary action that shows CLI usage — sits next to or replaces a CTA on developer-focused surfaces

Background #ffffff, border 1px solid #e2e8f0, text #111827 with Mona Sans Mono VF 16px weight 400 for the command portion. Border-radius 6px, padding 8px 12px. Includes a small copy icon at right.

### Navigation Bar
**Role:** Top-level site navigation — sticky, white, hairline-bordered bottom edge

Background #ffffff, border-bottom 1px solid #e2e8f0, subtle rgba(0,0,0,0.04) 0 1px 2px shadow. Height ~64px, horizontal padding 24px. Contains logo (left), nav links center, GitHub star count + Login link + teal CTA (right). Nav links in Inter 14px weight 500, color #1d242f, with dropdown chevrons in #718096.

### Feature Card
**Role:** Three-column feature highlight in the 'Your database, right in your workflow' section

Background #ffffff, border 1px solid #e2e8f0, border-radius 10px, padding 24px. Contains teal icon (16–20px), Inter 16–18px weight 600 title in #1d242f, Inter 14px weight 400 description in #6b7280. Optional inner panel with a terminal/code preview at the bottom using #f3f4f6 background.

### Terminal / Code Preview Panel
**Role:** Embedded UI screenshot or code terminal inside cards — replaces stock photography

Background #f3f4f6, border 1px solid #e2e8f0, border-radius 10px. Interior uses Inter 12–14px for UI labels in #6b7280 and Mona Sans Mono VF for code. Teal (#14b8a6) highlights for selected/active rows.

### Logo Grid Card
**Role:** Stack/integration partner showcase in the 'Postgres that fits your stack' section

Flat 4-column or 5-column grid of partner logos, each in a 48×48 to 64×64 area, centered. Logos are full-color (not monochrome), no background tiles, no borders. Grid sits on plain #ffffff.

### Testimonial Card
**Role:** Social proof block — multi-column masonry of developer quotes

No background fill, no border, no card chrome. Avatar (32–40px circle), name in Inter 14px weight 600 #1d242f, role/company in Inter 13px weight 400 #6b7280 with company name linked in #0d9488. Quote in Inter 16px weight 400 #1d242f, italicized emphasis in weight 600.

### Icon Tile (Stack Integration)
**Role:** Small iconography used in feature cards and nav

Teal-colored line icons at 16–20px, stroke width ~1.5px. Color #14b8a6 on light backgrounds. Sit left of card titles with 12px gap.

### Section Heading Block
**Role:** Section intro — centered or left-aligned, sets up a content band

Mona Sans VF 36–40px weight 700 #1d242f with 0.1em letter-spacing, optional subtext in Inter 16–18px weight 400 #6b7280. Vertical spacing: 48–80px above and below.

### Nav Dropdown Item
**Role:** Items inside the Products / Resources dropdown menus

Inter 14px weight 500 #1d242f, padding 8px 12px, border-radius 6px on hover with #f3f4f6 background. No border, no shadow on the dropdown panel itself — relies on the global nav shadow.

### CLI Command Snippet
**Role:** Inline code or copyable command — the 'npx prisma init' example

Font Mona Sans Mono VF 16px, text #111827 on #f3f4f6 background, border 1px solid #e2e8f0, border-radius 6px, padding 6px 12px. Dollar-sign prompt in #6b7280.

### GitHub Star Badge
**Role:** Social-proof pill in the nav showing repo stars

Background #ffffff, border 1px solid #e2e8f0, border-radius 6px, padding 6px 10px. GitHub icon (16px) in #1d242f, star count in Inter 13px weight 500 #1d242f.

## Do's and Don'ts

### Do
- Use #14b8a6 teal exclusively for primary actions, active states, and brand mark — never for decorative shapes, illustrations, or backgrounds larger than a button.
- Set Mona Sans VF at display sizes (30–64px) with 0.1em letter-spacing — this wide tracking is the brand's signature; removing it collapses the engineered feel into generic SaaS typography.
- Enable Inter's character variants (cv01, cv02, cv06, cv07, cv08, cv10) globally — this is the single line that turns stock Inter into a custom-feeling typeface.
- Separate surfaces with 1px borders at #e2e8f0 — never use background-color shifts alone to create layering; the hairline border is the system's primary depth signal.
- Show CLI commands and terminal panels alongside UI screenshots — the product page is also a documentation page; visual evidence of code is more persuasive than marketing art.
- Use border-radius 6px for buttons, nav items, and icons; reserve 10px for cards and code blocks. Never exceed 10px — the system is precise, not soft.
- Keep section gaps at 48–80px and let the 4px base unit govern all internal spacing — the rhythm should feel calibrated, not improvised.

### Don't
- Do not use teal for headings, body text, or paragraph copy — teal is an action color, not a brand wash. Headings stay in #1d242f or #111827.
- Do not introduce a second chromatic accent. The 5% colorfulness budget is allocated entirely to teal; adding blue, purple, or warm tones breaks the monochrome discipline.
- Do not use display-size type below weight 650 in Mona Sans — thin display headlines read as weak in this system. The 0.1em tracking needs weight to anchor it.
- Do not apply multi-layer drop shadows, colored glows, or gradient fills to cards or buttons. Depth is 1px border + 1px shadow, nothing more.
- Do not use stock photography, lifestyle imagery, or hero illustrations with people. The visual language is product UI and code — abstractions of the tool, not humans using it.
- Do not set border-radius above 16px or use fully rounded pill buttons — the system is angular and engineered, not friendly-soft. 6px and 10px are the design's edges.
- Do not use a dark theme variant for the page body. The entire interface is light; if a dark surface is needed for a code terminal, confine it to a bordered card, not the page.

## Elevation

- **Navigation bar:** `rgba(0, 0, 0, 0.04) 0px 1px 2px 0px`
- **Cards and panels:** `rgba(0, 0, 0, 0.04) 0px 1px 2px 0px`

## Surfaces

- **Paper** (`#ffffff`) — Page canvas, default background for all sections
- **Bone** (`#f3f4f6`) — Subtle band differentiation, input backgrounds, ghost-button fills
- **Mist** (`#e2e8f0`) — Hairline borders and card edges — not a fill, but a surface-level signal

## Imagery

The visual language is almost entirely product UI and code — terminal panels, database schema tables, IDE-style editors, and stack-integration logos replace stock photography. Code is treated as imagery: monospaced CLI commands sit inside bordered pills, SQL queries appear in panel mockups, and terminal cursors blink in feature card previews. Partner logos (Docker, Next.js, Vercel, etc.) appear in full color within a borderless grid. The only photographic element is minimal headshot avatars inside testimonial cards, presented as small circles without frames. No hero photography, no lifestyle imagery, no abstract gradient art — the page looks like it was designed by engineers for engineers.

## Layout

Layout is a centered, max-width 1200px container with generous vertical breathing room. The hero is a centered stack: Mona Sans display headline, one-line subtext, then a two-element row (teal CTA + ghost code-pill). Below the hero, a 3-column card grid introduces core features, each card containing a teal icon, title, description, and an inner terminal preview. Subsequent sections alternate between 2-column text-and-visual layouts (heading left, icon grid or code panel right) and full-width centered heading bands. The 'Postgres that fits your stack' section uses a 4–5 column logo grid floating on white. A testimonial band uses a 3-column masonry of unbordered quote blocks. The nav is a single sticky top bar with dropdown menus. Section gaps are 80px; internal card padding is 24px. The page never goes full-bleed dark; even the subtle teal-to-white hero gradient stays within the 1200px container.

## Similar Brands

- **PlanetScale** — Same developer-database positioning with a teal/green accent on a white hairline-bordered canvas, and code-pill buttons next to CTAs
- **Supabase** — Monochrome light UI with a single emerald accent, code-first feature illustrations, and similar Inter/Mona-Sans-style display typography
- **Vercel** — Restrained monochrome palette, hairline-border surface treatment, 6px button radii, and a preference for product UI screenshots over photography
- **Linear** — Engineered precision aesthetic — tight 6px radii, hairline borders, Inter at body with a custom display face, and zero decorative gradients
- **Railway** — Developer-tool landing pages that lead with CLI commands and terminal panels, using a single chromatic accent against a near-white surface
