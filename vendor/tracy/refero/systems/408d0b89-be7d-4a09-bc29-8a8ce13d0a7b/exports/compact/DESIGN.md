# Wizz — Style Reference
> Neon pink highlighter on a black-and-white editorial — like a single fluorescent mark on a fashion magazine spread.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Wizz operates on a high-contrast social-app language: saturated black-and-white structure shot through with one electric hot-pink accent that functions as the only chromatic signal in the system. The hero is deliberately loud — a full-bleed multi-hue gradient (lavender, coral, sky, amber) supporting massive compressed black type — while every section below retreats to white space and lets pink do the work as a single, recurring punctuation mark. Typography is geometric and architectural: PolySans Bulky at display sizes, PolySans Median for headings and nav, PolySans Neutral for body — each weight stepping down in confidence rather than warmth. Components are rounded, pill-heavy, and flat; the only depth comes from a very faint black shadow on raised buttons. The navigation bar is a floating black pill that hovers above the page, setting the visual rhythm of dark-on-light framing devices.

## Colors

| Name | Value | Role |
|------|-------|------|
| Volt Pink | `#ff3d9e` | Primary action buttons, section labels, active states, cookie accept — the sole chromatic brand color, carrying 100% of the accent weight in the interface |
| Obsidian | `#000000` | Page text, floating navigation bar, bold display headlines, cookie banner surface, icon fills |
| Paper White | `#ffffff` | Page canvas, section backgrounds, text on dark surfaces, card surfaces in light sections |
| Ash | `#dadada` | Hairline borders, card inset rings, subtle dividers, secondary text on light backgrounds |
| Charcoal | `#444444` | Input borders, secondary surface fills, muted UI elements |
| Onyx | `#292929` | Secondary button backgrounds, elevated surface tone |
| Mist | `#eeeeee` | Input field backgrounds, subtle fill surfaces |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### PolySans Bulky — Hero display headlines — the signature compressed ultra-bold weight; tight line-height (1.0) lets the letters stack like a logo mark rather than reading as paragraphs
- **Substitute:** Druk Wide Bold, Archivo Black, or system impact weight
- **Weights:** 700
- **Sizes:** 72px
- **Line height:** 1.00

### PolySans Median — Primary workhorse — nav links, section headings, the 86px display for page-openers, all-caps micro-labels with 0.05em tracking. The compressed line-heights (0.85–1.0) at large sizes are what give Wizz its editorial-magazine density
- **Substitute:** Inter, Manrope, or system geometric sans
- **Weights:** 400, 600, 700
- **Sizes:** 10px, 13px, 14px, 16px, 18px, 86px
- **Line height:** 0.85, 1.00, 1.10, 1.20, 1.25, 1.44, 1.50, 2.00
- **Letter spacing:** -0.0100em at display sizes, 0.0500em for all-caps labels

### PolySans Neutral — Body copy, paragraph text, descriptive content — generous line-height (1.5) creates reading rhythm distinct from the tight display set
- **Substitute:** Inter, system-ui sans-serif
- **Weights:** 400
- **Sizes:** 14px, 16px, 18px
- **Line height:** 1.20, 1.30, 1.40, 1.50

### PolySans Slim — Light-weight utility text, subtle links, fine-print detail — provides typographic contrast against heavier Median weights in the same layout
- **Substitute:** Inter Light, system sans-serif at weight 300
- **Weights:** 300
- **Sizes:** 14px
- **Line height:** 1.00, 1.10

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | 0.05px |
| body-sm | — | — | 14px | 1.4 | — |
| subheading | — | — | 18px | 1.4 | — |
| display-xl | — | — | 72px | 1 | — |
| display | — | — | 86px | 0.85 | -0.86px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 16px
- **Element gap:** 10px

### Border Radius

- **cards:** 12px
- **icons:** 5px
- **pills:** 999px
- **images:** 24px
- **inputs:** 12px
- **buttons:** 12px

## Components

### Floating Navigation Pill
**Role:** Primary site navigation bar

Black (#000000) pill-shaped bar, border-radius 999px, floating at top of page. Contains white Wizz logotype on left, nav links (white text, PolySans Median 14px weight 400) in center, and pink (#ff3d9e) 'Download' CTA button on right. Full-width within page max-width with generous horizontal padding (~20px). No visible border; relies on the black-fill contrast against the white page.

### Primary CTA Button (Download / Accept / Our News)
**Role:** Main call-to-action

Filled with Volt Pink (#ff3d9e), white text, PolySans Median weight 600, 14–16px. Border-radius 12px. Padding approximately 10px 20px. The small 'Our News' variant uses 16px 24px padding. This is the only chromatic action element in the system.

### News / Announcement Pill
**Role:** Inline news banner

Pill-shaped, border-radius 999px, dark fill (#000000 or very dark), containing a small 'NEWS' tag in pink or white, followed by announcement text in white PolySans Median 13–14px. Includes a right-pointing arrow or chevron. Padding approximately 8px 16px.

### Cookie Consent Card
**Role:** Privacy compliance overlay

Rectangular card, black (#000000) background, white text, rounded corners (~12px). Title 'Cookie Settings' in PolySans Median 700 at ~16px. Body copy in PolySans Neutral 400 at 14px with 1.5 line-height. Contains two buttons: a ghost 'Reject' (dark surface, white text) and a filled pink 'Accept' (#ff3d9e). Fixed-position bottom-right.

### App Store Download Badge Pair
**Role:** App download CTAs

Two standard dark (#000000) pill-shaped badges side by side: 'Download on the App Store' and 'GET IT ON Google Play'. Rounded corners, white logo + text. Padding approximately 8px 16px. Serve as secondary download action below the primary pink CTA in the hero.

### Trust Indicator Strip
**Role:** Social proof band

Three-column horizontal layout with small monochrome icons (trophy/award, globe, shield) in circular outline containers (~32px). Each column has a bold heading in PolySans Median 600 (~16px) and lighter subtext in PolySans Neutral 400 (~14px). Separated by faint vertical or horizontal dividers. Functions as a credibility row between hero and content.

### Section Eyebrow Label
**Role:** Category label above section headings

All-caps, Volt Pink (#ff3d9e), PolySans Median weight 600, ~13–14px, letter-spacing 0.05em. Used as a small pink tag introducing each content section (e.g. 'REVOLUTIONIZING CONNECTION', 'EMPOWERMENT AND SELF-ESTEEM', 'JOY'). Sits directly above a larger dark heading.

### Display Headline
**Role:** Page-opener and section title

PolySans Bulky or PolySans Median at 72–86px, weight 700, line-height 0.85–1.0, black (#000000). Near-zero letter-spacing at large sizes. Examples: 'MEET YOUR PEOPLE NOW', 'OUR MISSION', 'OUR COMMUNITY'. All-caps with compressed leading is the signature.

### Feature Row (Mission section)
**Role:** Mission statement with heading + body

Two-column or single-column layout. Large black bold heading on left (PolySans Median 700, ~32–40px). Right column stacks: pink eyebrow label, then bold dark body statement (PolySans Median 600, ~16–18px), then regular body copy (PolySans Neutral 400, ~14–16px, 1.5 line-height). Generous vertical spacing between blocks.

### Phone Mockup Carousel
**Role:** Product showcase with tilted device images

Row of phone screenshots, each rotated at slight angles (-8° to +8°), overlapping with adjacent frames. The phones have large 24px border-radius, showing the dark-themed chat interface inside. Arranged horizontally across the page width, creating a fan-layout effect.

### Input Field
**Role:** Form input

Rounded rectangle, 12px border-radius, background #eeeeee (light gray fill), border 1px solid #444444 (charcoal). Placeholder and text in PolySans Median 400, ~14px. Subtle inset shadow optional. Dark border on light fill is distinctive — most sites use border-only with white fill.

### Ghost / Secondary Button
**Role:** Non-primary action

Dark fill (#000000 or #292929), white text, PolySans Median 400–600, 12px border-radius. Used for 'Reject' in cookie banner, and likely for secondary nav or modal actions. No border outline; relies on fill contrast.

## Do's and Don'ts

### Do
- Use Volt Pink (#ff3d9e) as the sole chromatic accent — for one primary action per view, for section eyebrow labels, and for the cookie Accept button. Never dilute it across multiple elements on the same screen.
- Set all-caps display headlines in PolySans Bulky or PolySans Median weight 700 at 72–86px with line-height 0.85–1.0 and near-zero letter-spacing. The compressed vertical rhythm is what makes the type feel editorial.
- Apply 999px border-radius to the floating navigation bar, news pills, and any tag/chip elements. Use 12px radius for buttons, cards, and inputs. Use 24px for image frames.
- Use black (#000000) for the floating nav surface, bold display text, and the cookie banner — and always pair it with white or pink text on top. This black-on-white framing is the system's structural backbone.
- Apply 0.05em letter-spacing to all-caps micro-labels and eyebrow text at 10–14px. This widens the optical density of the small type and makes the pink section labels feel deliberately stamped.
- Keep body copy in PolySans Neutral weight 400 at 16px with line-height 1.5 for reading comfort. Never use Median weights for paragraphs.
- Add the very faint shadow rgba(0,0,0,0.05) 0px 1px 10px to card surfaces and rgba(0,0,0,0.3) 0px 1px 30px to the primary CTA. These are the only two shadow depths in the system.

### Don't
- Never introduce a second accent color. The entire brand identity depends on pink being the only chromatic signal in a black-and-white field.
- Never use decorative gradients on UI elements. The hero gradient is the only allowed multi-color surface — everything else is flat solid fills.
- Never use drop shadows heavier than the two defined values. The system is intentionally flat; heavy elevation breaks the editorial feel.
- Don't use system sans-serif for headings. PolySans Median and Bulky are the identity — fall back to Inter or Manrope only if the custom fonts are unavailable.
- Never place body copy below 14px. The compact density is created through tight spacing, not through microscopic type.
- Don't use sharp corners (<5px radius) on any interactive element. Every button, input, card, and nav must have at least 12px or fully pill-shaped radius.
- Never use the pink accent on body text longer than a few words. Pink is for labels, buttons, and emphasis — not for paragraphs or descriptions.

## Elevation

- **Primary CTA Button:** `rgba(0, 0, 0, 0.3) 0px 1px 30px 0px`
- **Cards and elevated content:** `rgba(0, 0, 0, 0.05) 0px 1px 10px 0px`
- **Card inset ring:** `rgb(218, 218, 218) 0px 0px 0px 1px inset`

## Surfaces

- **Page Canvas** (`#ffffff`) — Default page background for all content sections
- **Input Fill** (`#eeeeee`) — Input field resting state
- **Input Border** (`#444444`) — Input field outline, secondary UI element borders
- **Hairline Surface** (`#dadada`) — Card inset rings, dividers, subtle framing
- **Elevated Surface** (`#292929`) — Secondary button fill, mid-elevation UI panels
- **Dark Surface** (`#000000`) — Floating navigation pill, cookie banner, bold text fills
- **Accent Surface** (`#ff3d9`) — Primary action button fill, active accent moments

## Imagery

Imagery is product-led and minimal. The primary visual asset is the phone mockup of the app's chat interface, shown in a fanned, tilted arrangement across a horizontal band — each device rotated at a slight angle, overlapping its neighbors, with large 24px radii. The chat screens themselves are dark-themed with pink/purple gradient backgrounds, reinforcing the brand palette. No lifestyle photography, no abstract illustrations, no stock imagery. The hero is a pure gradient field (lavender, sky blue, coral, amber) — no photos. User-generated content appears as faded, desaturated avatar tiles in the community section, receding behind the headline.

## Layout

Page is max-width 1200px centered, with a floating black pill navigation that hovers above the content. The hero is full-bleed, spanning the full viewport width with the multi-color gradient and a centered headline stack (eyebrow → huge display text → app download buttons). Below the hero, content alternates between white sections and faint gray dividers, all centered-aligned. The mission section uses a two-column pattern (large heading left, content right). The community section uses a full-width image band of tilted phone mockups, followed by a centered headline. Section gaps are generous (~80px). The overall rhythm is: loud gradient hero → quiet white content bands → loud product showcase band → quiet text section. Navigation is a single pill bar, sticky/floating. No sidebar, no mega-menu.

## Similar Brands

- **BeReal** — Same Gen-Z social app energy with a single vivid accent color (BeReal uses red-orange) against monochrome chrome, and the floating pill navigation pattern
- **Locket Widget** — Similar compact social-app landing page with large compressed display type, floating dark nav pill, and minimal product-led layout
- **Yubo** — Direct competitor in the young-audience social space; same hero-centric layout with one bright accent and phone mockup showcases
- **Threads (Meta)** — Same editorial-magazine approach to social app marketing: massive compressed headlines, single accent color, phone mockup carousels, and generous white space
