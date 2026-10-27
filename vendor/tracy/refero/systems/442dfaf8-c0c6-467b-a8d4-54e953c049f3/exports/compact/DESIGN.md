# CHAIBOY — Style Reference
> black gallery wall with a single illuminated photograph.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

CHAIBOY presents a black-box gallery aesthetic: a single dark canvas where nearly everything is typographic and almost nothing is decorative. The interface behaves like a museum wall — one large monochrome photograph dominates the viewport, framed by hairline white rules and small uppercase navigation. Color is rejected as a tool; hierarchy is built entirely through type size, generous negative space, and the stark contrast of white on black. The Neue Haas Grotesk 55 Roman at weight 400 only, combined with the OpenType 'case' feature, produces a disciplined all-caps voice that reads more like a printed art monograph than a DTC tea site. Every UI element — nav links, buttons, cart, footer — is a text fragment. There are no fills, no shadows, no gradients, no rounded chrome; the single 4px radius is the system's only concession to softness.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Page canvas, hero background, footer background — the absolute ground everything else sits on or within |
| Carbon | `#131313` | Subtle surface variation from the page canvas — used as a near-identical lifted surface where one is needed without breaking the monochrome spell |
| Ash | `#afafaf` | Secondary text, muted labels, inactive input borders — a half-step between white and black for elements that must recede |
| Bone | `#ffffff` | Primary text, hairline rules, link and button borders, image borders — the only forward-facing tone, used with restraint as both type and geometry |

## Typography

### Neue Haas Grotesk TP 55 Roman — Sole typeface for all interface text — navigation, body, headlines, buttons, footer. The exclusive use of weight 400 is a deliberate anti-hierarchy choice; scale and spacing do the work that weight normally would. The OpenType 'case' feature is enabled site-wide, giving all-caps small text properly designed uppercase parentheses, hyphens, and numerals instead of lowercase glyphs scaled up.
- **Substitute:** Neue Haas Grotesk Text Pro, Inter, Helvetica Neue, Arial
- **Weights:** 400
- **Sizes:** 11px, 14px, 18px, 54px
- **Line height:** 0.89, 1.11, 1.27, 1.29
- **OpenType features:** `"case" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.11 | — |
| body-sm | — | — | 14px | 1.29 | — |
| subheading | — | — | 18px | 1.27 | — |
| display | — | — | 54px | 0.89 | — |

## Spacing & Layout

**Density:** compact

- **Section gap:** 60px
- **Card padding:** 16px
- **Element gap:** 5px

### Border Radius

- **tags:** 4px
- **cards:** 4px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Announcement Ticker Bar
**Role:** Scrolling promotional strip across the top of every page

Full-bleed black bar at the very top, 1px solid #ffffff bottom border. Contains small repeating text blocks in Neue Haas Grotesk 11px weight 400, uppercase, white. Each text block may include a bordered CTA chip (4px radius, 1px white border, 5-7px vertical padding, 6-10px horizontal padding). Items are separated by inline 4-5px gaps.

### Primary Navigation Row
**Role:** Main site navigation

Two-line layout: brand wordmark 'CHAIBOY' left, nav links centered, cart right. Sits on a black canvas with a 1px white rule above and below. All text is 14px weight 400 uppercase, #ffffff. Nav links separated by 15-16px gaps. No background, no border, no fill — just text on black.

### Text Link
**Role:** All clickable navigation, footer, and inline references

Bare 14px uppercase white text. No underline, no color change. The only active affordance is the cursor. Spacing between links is 15-16px horizontal.

### Bordered Chip Button
**Role:** Promotional micro-CTA inside the announcement ticker

4px border-radius, 1px solid #ffffff border, 5-7px padding top/bottom, 6-10px padding left/right. 11px weight 400 uppercase white text on black fill. Example shape: 'ORDER NOW' or 'SHOP NOW'.

### Hero Photograph Frame
**Role:** Full-bleed editorial image that defines the page

A single large monochrome photograph centered on the black canvas. Contained to roughly 60-70% of the page width, left/right gutters are pure void. 1px solid #ffffff border (72 instances of borderColor on images), creating a fine gallery-frame edge. No caption, no overlay, no gradient — the image is the entire content of the fold.

### Footer Link Bar
**Role:** Bottom-of-page legal and contact links

Single horizontal row on black, top edge marked by a 1px white rule. Left side: TERMS & CONDITIONS, PRIVACY POLICY, CONTACT, INSTAGRAM at 11-14px weight 400 uppercase white. Right side: NEWSLETTER link and a local time display (e.g. '22:50'). Gaps between links are 4-6px.

### Cart Link
**Role:** Shopping bag entry point in the nav

Right-aligned in the primary nav row. 14px uppercase weight 400 white text reading 'CART'. No icon, no badge, no fill — the word alone is the affordance.

### Brand Wordmark
**Role:** Logo lockup in the top-left of the nav

Plain text 'CHAIBOY' in Neue Haas Grotesk 14-18px weight 400 uppercase, #ffffff. No symbol, no mark, no decoration. Acts as the home link.

## Do's and Don'ts

### Do
- Use #000000 as the page background everywhere; let #131313 appear only when a true surface lift is needed without breaking the monochrome language.
- Set all interface text in Neue Haas Grotesk 55 Roman at weight 400 only, with font-feature-settings: 'case' on to keep all-caps forms typographically correct.
- Use only the four documented sizes — 11, 14, 18, 54 — to build hierarchy. No weights beyond 400.
- Use #ffffff for primary text, hairline rules, and the 1px borders that separate regions; use #afafaf only when a label must visibly step back.
- Keep all border-radius at 4px across buttons, cards, chips, and inputs — the system has one radius and it should not be overridden.
- Let product or editorial photography carry the visual weight; the chrome should be invisible. Frame hero imagery with a 1px white border on black.
- Separate major regions (announcement, nav, footer) with a 1px solid #ffffff hairline rule rather than background-color changes or padding alone.

### Don't
- Do not introduce any chromatic color — no brand accent, no semantic red/green/blue, no hover tint. The system is monochromatic by conviction.
- Do not use font-weight above 400, and do not add italic. Weight contrast is not available as a hierarchy tool.
- Do not use box-shadow, gradients, or glow effects. Surfaces are flat black; depth comes from hairline borders and photography only.
- Do not use border-radius larger than 4px. Pills, fully rounded shapes, and large curves are outside this system.
- Do not use backgrounds or fills on nav links, buttons in the main flow, or cart. The bordered chip is the only filled/bordered interactive shape, and it belongs only in the announcement bar.
- Do not underline links or change their color on hover. Text links are distinguished by position, context, and cursor only.
- Do not set type below 11px or use centered body copy. Small text is always uppercase, tight-leading, left-aligned in rows.

## Elevation

No shadows, no glow, no layered surfaces. The system intentionally avoids all depth cues because the visual hierarchy is carried entirely by typographic scale, generous negative space, and the 1px white hairline that separates the few regions. A raised element in this system is simply a white rule above and below it.

## Surfaces

- **Void** (`#000000`) — Base page canvas — every screen begins here
- **Carbon** (`#131313`) — Near-identical lifted surface for the rare case where a region must differ from the base without breaking the monochrome field
- **Ash** (`#afafaf`) — Stepped-back typographic surface — secondary text and inactive input borders that need to read but not compete
- **Bone** (`#ffffff`) — Forward-facing surface — primary text, hairline rules, and the 1px frame around imagery and bordered chips

## Imagery

A single large black-and-white editorial photograph carries the entire visual load of the page. The subject is a portrait — a model with a product box balanced on her head — shot in high-contrast monochrome against a soft gray background, contained in a centered frame roughly 60-70% of the page width, edged by a 1px white border that reads as a gallery frame. Treatment: high-key studio lighting, sharp focus, no color, no lifestyle context — the object and the subject are the art. No product photography, no illustrations, no icons, no 3D renders, no abstract graphics. Imagery is sparse, deliberate, and editorial.

## Layout

Full-bleed, centered, and austere. The page is one continuous black canvas with no max-width container; regions are separated by 1px white hairline rules rather than by background-color bands. The hero is a single large monochrome portrait photograph, centered horizontally and sized to roughly 60-70% of the page width, with deep black gutters on either side. Above the hero: a thin announcement ticker, then a two-line nav with the wordmark left, centered links, and cart right. Below the hero: a single footer row with legal links left and newsletter/time right. Vertical rhythm is set by hairline rules and 60px section gaps, not by alternating background colors. Grid: no multi-column product grid or card layout — this is a brand and editorial surface, not a catalog page.

## Similar Brands

- **Aesop** — Same editorial restraint and monochrome discipline — black canvas, small uppercase type, photographic product framing, zero decoration
- **The Row** — Same gallery-wall presentation: one large monochrome image, hairline rules, single weight sans-serif, no visible UI chrome
- **Cos (the fashion label)** — Same minimal typographic system with a single weight and size-based hierarchy on a dark neutral ground
- **Muji** — Same quiet, text-first interface with hairline rules separating regions and no decorative color or shape
