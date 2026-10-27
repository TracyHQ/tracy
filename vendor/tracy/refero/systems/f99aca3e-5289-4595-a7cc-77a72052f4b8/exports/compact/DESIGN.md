# Ventriloc — Style Reference
> Editorial data observatory on warm paper — a single orange ember punctuating monochrome precision.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Ventriloc speaks in a quiet, editorial voice: warm paper-white canvas, monospaced-precision data cards, and a single orange ember that punctuates the monochrome like a highlighter on a printed report. The system pairs a custom neo-grotesque (PolySans) at weight 400 for headings — unusual restraint that trades authority-through-volume for authority-through-precision — against Inter for body and UI chrome. Surfaces are warm grays and ivory rather than cool tech-blue, cards wear asymmetric corner radii (sharp top-right, soft elsewhere), and interactive elements split into two clear dialects: sharp-cornered text-style buttons and pill-shaped navigation containers. Color is rationed: pages should read 95% achromatic with orange appearing only as functional punctuation for highlights, link underlines, and decorative data accents.

## Colors

| Name | Value | Role |
|------|-------|------|
| Graphite | `#202020` | Primary text, headings, nav links, icon strokes — the typographic anchor of every surface |
| Canvas White | `#ffffff` | Page background, card elevation, icon fills — the brightest surface in the system |
| Ash | `#efefef` | Primary card and section background, nav pill container — the dominant warm-gray surface |
| Fog | `#f5f5f5` | Subtle background tone for nested surfaces and secondary containers |
| Ivory | `#ebe6dd` | Warm accent background wash for featured blocks — the paper-stock feel |
| Steel | `#4d4d4d` | Secondary body text, long-form paragraph copy |
| Slate | `#828282` | Muted helper text, tertiary nav items, inactive controls |
| Mist | `#e8e8e8` | Hairline dividers, nav background fills |
| Ember Orange | `#ff682c` | Orange text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color |
| Brass | `#816729` | Secondary accent for chart strokes, decorative SVG lines, and tag text — a muted warm counterpoint to Ember |

## Typography

### PolySans — Headings and display text — custom neo-grotesque used exclusively at weight 400 with -0.02em tracking creates a whisper-weight editorial authority that no bold headline could replicate
- **Substitute:** Inter Tight or Space Grotesk at weight 400
- **Weights:** 400
- **Sizes:** 12px, 13px, 16px, 32px, 40px, 66px
- **Line height:** 0.91–1.38
- **Letter spacing:** -0.0200em

### Inter — Body copy, UI labels, button text, captions, metadata — the workhorse sans for everything that isn't a headline
- **Substitute:** system-ui or Roboto
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 13px, 14px, 15px, 16px, 18px
- **Line height:** 1.15–1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | 0px |
| subheading | — | — | 18px | 1.25 | 0px |
| heading | — | — | 32px | 1.19 | -0.64px |
| heading-lg | — | — | 40px | 1.2 | -0.8px |
| display | — | — | 66px | 0.91 | -1.32px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 40px
- **Element gap:** 20px

### Border Radius

- **tags:** 20px
- **cards:** 8px
- **buttons:** 0px
- **nav-pills:** 200px
- **asymmetric-card:** 6px 0px 0px

## Components

### Primary CTA Button
**Role:** High-emphasis action button used for conversion and contact

Dark filled (Graphite #202020 background, white text), sharp 0px corners, PolySans 16px weight 400, padding 10px 20px, letter-spacing -0.02em. No shadow, no border-radius — the square edge is deliberate contrast to the rounded cards

### Ghost Outlined Button
**Role:** Secondary action with minimal visual weight

Transparent background, 1px Graphite border, Graphite text, 0px radius, padding 10px 20px, PolySans 16px weight 400. Sits beside the primary CTA as a quieter alternative

### Navigation Pill Container
**Role:** Houses dropdown nav items in a floating capsule

Ash (#efefef) background, 200px border-radius (fully pill-shaped), 8px vertical padding, 18px horizontal padding, wraps dropdown-trigger links. PolySans 16px for items inside

### Language Toggle Link
**Role:** Locale switcher in header

Plain text link in Slate (#828282), PolySans 16px, no background or border. Sits inline with nav items

### Asymmetric Radius Card
**Role:** Featured content panel with a distinctive cut corner

Ash (#efefef) background, border-radius 6px 0px 0px (soft top-left, sharp everywhere else), generous internal padding (70px top, 60px left). This asymmetric radius is the signature card shape — no shadow, surface color does the lifting

### Data Dashboard Card
**Role:** Chart widget for analytics visualization

White (#ffffff) surface, 20px border-radius, thin border or no border, contains revenue/profitability charts with Ember Orange and Brass accent strokes. No shadow — floats on the Ash page background

### Hero Headline Block
**Role:** Above-the-fold typographic statement

PolySans 66px weight 400, line-height 0.91, letter-spacing -1.32px, Graphite color. Followed by 18px Inter body text in Steel (#4d4d4d). No background — sits directly on white canvas

### Partner Logo Strip
**Role:** Social proof bar showing client/partner logos

Row of monochrome (Graphite) partner logos on white canvas, separated by generous horizontal spacing (~20px gap), with a "Trusted by 80+ partners" caption in PolySans 13px Brass color above

### Text-Style Nav Link
**Role:** Dropdown trigger in the pill nav container

Graphite (#202020) text, PolySans 16px weight 400, with a small chevron icon. No underline by default, no background — active state may show a subtle color shift

### Link with Orange Underline
**Role:** Inline text link with the accent color

Text in base color with a 1px Ember Orange (#ff682c) underline offset 2-3px below baseline. Used sparingly for the one or two most important links per page

### Section Divider
**Role:** Horizontal break between content sections

No visible line — sections are separated purely by 80px vertical whitespace and alternating surface colors (white → ash → white)

### Cookie Preferences Link
**Role:** Footer utility link

Small text in Slate (#828282), PolySans 13px, no decoration. Bottom-of-page placement

## Do's and Don'ts

### Do
- Use PolySans exclusively at weight 400 for all headings — never bold the display type; the whisper-weight is the signature
- Apply the asymmetric border-radius 6px 0px 0px to featured content cards; reserve 20px radius for data widgets and 0px for buttons
- Keep pages 95% achromatic; let Ember Orange (#ff682c) appear only as link underlines, chart highlights, and small icon accents
- Use 20px for element gaps and 80px between sections — the generous whitespace is what makes the editorial voice work
- Pair Inter for all body and UI text; PolySans for headings, nav items, and button labels only
- Separate sections by alternating white canvas and Ash (#efefef) surface bands rather than dividers or shadows
- Use letter-spacing -0.02em on every PolySans text element — it's baked into the font's identity

### Don't
- Do not bold PolySans headings — weight 400 at large size is the whole point; bolding destroys the editorial restraint
- Do not use Ember Orange as a filled button background — it is an accent for highlights and links, not a CTA fill
- Do not add box-shadows to cards or buttons — depth comes from surface color contrast, not elevation
- Do not use symmetric border-radius on all elements; the asymmetric 6px 0px 0px and the 0px button radius are deliberate contrast
- Do not introduce blue, green, or other chromatic colors — the two-warm-accent system (Ember + Brass) is the limit
- Do not set line-height above 1.25 on display headings; the 0.91 leading on 66px creates the tight, poster-like headline
- Do not crowd the layout — if you need to add decoration, increase whitespace instead

## Elevation

- **Data Card (chart widget):** `0px 0px 0px 0px (no shadow — cards float on warm-gray surfaces without elevation)`
- **Nav Pill:** `0px 0px 0px 0px (flat — no shadow)`

## Surfaces

- **Page Canvas** (`#ffffff`) — Primary page background — the brightest base layer
- **Ash Surface** (`#efefef`) — Card and section panels — dominant warm-gray surface
- **Fog Surface** (`#f5f5f5`) — Nested containers and secondary backgrounds
- **Ivory Surface** (`#ebe6dd`) — Warm accent wash for featured or editorial blocks

## Imagery

Visuals are almost entirely data-driven: chart widgets (line graphs, circular progress indicators, stat cards) rendered in a flat, minimal style with thin strokes in Ember Orange and Brass against white card surfaces. No lifestyle photography, no stock imagery, no hero illustrations. The only photographic content is partner/client logos presented in monochrome Graphite. The visual language is closer to a printed annual report than a typical SaaS site — the charts ARE the imagery. Icons are thin-stroke, monoline, and Graphite-colored, appearing sparingly in nav and card headers.

## Layout

Max-width 1200px centered container with generous 80px section gaps. The hero is a two-column split: left side holds the headline, subtext, and dual-button CTA stack; right side shows a cluster of three overlapping data dashboard cards (finance chart, revenue stat, profitability ring) floating on the white canvas. Below the hero, a full-width partner logo strip on white. Subsequent sections alternate between Ash (#efefef) and white bands. Navigation is a floating pill container centered in the header, with the brand wordmark left-aligned and a dark Contact-us button right-aligned. The overall rhythm is spacious and editorial — wide margins, tall sections, and the data cards as the only visual punctuation beyond typography.

## Similar Brands

- **Stripe** — Same editorial restraint with monochrome palette and generous whitespace; both use a single warm accent color for highlights rather than a dominant brand fill
- **Linear** — Shared taste for sharp 0px-radius buttons against soft rounded surfaces, and a near-monochrome interface that lets typography do the heavy lifting
- **Plaid** — Similar data-product aesthetic with dashboard-card imagery and warm-gray surfaces; both treat charts as editorial content rather than decoration
- **Figma Config** — Matching sparse, poster-like typographic headlines at extreme sizes with tight tracking, and a commitment to letting negative space carry the design
