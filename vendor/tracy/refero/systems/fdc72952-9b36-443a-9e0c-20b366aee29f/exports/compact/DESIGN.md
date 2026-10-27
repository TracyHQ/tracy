# Flecto — Style Reference
> Botanical greenhouse glasshouse. A warm cream-walled conservatory where deep teal planters hold bright mint seedlings — flat, rounded, alive with green, zero shadows.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Flecto is a warm botanical rental platform aesthetic: a cream canvas (#fffbec) replaces pure white, deep forest teal (#004737) anchors hero sections and borders, and vivid mint (#56f09f) punctuates interactive moments. Typography is exclusively Aeonik at weight 400 — no bold, no light — relying on negative letter-spacing (-0.043em at display sizes) to create contrast through tightness rather than weight. The system is flat, border-driven, and color-blocked: large rounded surfaces (40–60px radius) in deep teal sit directly on the warm cream, with thin chromatic borders carrying most of the structural weight instead of shadows. Mint appears sparingly as a functional accent on filled buttons, icons, and decorative shapes, never as large surface area.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Ink | `#004737` | Dominant brand surface — hero panels, section backgrounds, thick structural borders, nav header, footer blocks. Deep teal absorbs the page and makes cream text glow |
| Mint Pulse | `#56f09f` | Green outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Mint Mist | `#d4ffe8` | Green accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Cream Canvas | `#fffbec` | Page background — warm off-white replaces pure white. Border-color on teal sections, card fills on light areas, heading text on dark surfaces |
| Deep Loam | `#032019` | Text color on cream surfaces, subtle dark borders. Near-black with a green undertone that harmonizes with the Forest Ink brand color |
| Sage Whisper | `#99b5af` | Muted body text and secondary borders — desaturated green-gray that recedes on cream while staying tonally consistent with the brand palette |
| Stone Mist | `#ccdad7` | Hairline dividers, icon borders, subtle background tints on cards within light sections |
| Bone | `#faf2d5` | Soft warm card background — slightly warmer and more saturated than cream canvas, used to lift specific content blocks without breaking the tonal family |
| Charcoal | `#222222` | Body text and standard button borders in neutral contexts. Used when chromatic text is not appropriate |
| Iris Spark | `#8f37ff` | Violet outline accent for tags, dividers, and focused UI edges. |

## Typography

### Aeonik — Universal typeface — headings, body, UI labels, buttons. Single weight 400 across the entire system; contrast is achieved through size and negative letter-spacing, not weight. This is the signature choice: a monoweight geometric sans where display headlines at 56–74px tighten to -0.043em while body text at 14–16px sits at normal or slightly positive tracking. Tabular numerals ('tnum') are enabled for all instances.
- **Substitute:** Inter, Satoshi, General Sans
- **Weights:** 400
- **Sizes:** 8px, 9px, 10px, 11px, 12px, 13px, 14px, 15px, 16px, 17px, 18px, 19px, 20px, 24px, 26px, 28px, 32px, 33px, 36px, 56px, 60px, 64px, 66px, 74px
- **Line height:** 1.00–2.88 (contextual)
- **Letter spacing:** -0.0430em at 56px+ (display), -0.0300em at 32–36px (heading), -0.0100em at 18–24px (subheading), normal to +0.0200em at 8–14px (caption/label)
- **OpenType features:** `"tnum" on`

### roobert — Secondary body face — used for longer descriptive copy, list items, and hero subtext. Warmer and more humanist than Aeonik, providing tonal variety in long-form text while staying in the same single-weight, geometric family.
- **Substitute:** Inter, Söhne, Untitled Sans
- **Weights:** 400
- **Sizes:** 12px, 16px
- **Line height:** 1.40–1.87

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.4 | 0.1px |
| body | — | — | 14px | 1.4 | 0px |
| body-lg | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.3 | -0.2px |
| heading-sm | — | — | 28px | 1.2 | -0.56px |
| heading | — | — | 36px | 1.15 | -1.08px |
| heading-lg | — | — | 56px | 1.1 | -2.4px |
| display | — | — | 74px | 1 | -3.18px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 40-80px
- **Card padding:** 12-20px
- **Element gap:** 10-12px

### Border Radius

- **cards:** 19px
- **pills:** 9999px
- **buttons:** 40px
- **small-chips:** 10px
- **icon-squares:** 5.76px
- **large-panels:** 60px

## Components

### Filled Mint Button
**Role:** Primary call-to-action (Login, Start)

Background #56f09f, text in Deep Loam (#032019), Aeonik 14px weight 400, padding 10px 24px, border-radius 40px. No border. Sits on white or cream surfaces.

### Outlined Dark Button
**Role:** Secondary action (Book a Demo)

Transparent background, 1px solid #222222 border, text #222222, Aeonik 14px weight 400, padding 10px 20px, border-radius 40px. Inverts to cream-on-teal when on dark hero panels.

### Ghost Pill Button
**Role:** Tertiary action or filter

Background #d4ffe8, text #004737, no border, Aeonik 12px weight 400, padding 6px 14px, border-radius 9999px. Used for tag-like actions and active filter states.

### Hero Panel
**Role:** Full-bleed dark section

Background #004737, border-radius 0 at edges but 19–60px on inner cards, generous 80–120px vertical padding, centered headline at 56–74px Aeonik weight 400 in #fffbec.

### Light Card
**Role:** Content card on cream canvas

Background #ffffff or #faf2d5, 1px solid #ccdad7 border, border-radius 19px, padding 20px. Shadow rgba(0,0,0,0.04) 0px 3px 2px 0px when no border present.

### Tinted Feature Card
**Role:** Highlighted content block

Background #d4ffe8, no border, border-radius 19px, padding 24px, heading at 28px #004737.

### Language Selector
**Role:** Compact utility dropdown

White background, 1px solid #ccdad7 border, border-radius 10px, padding 6px 12px, text 12px Aeonik, chevron icon in Sage Whisper.

### Navigation Bar
**Role:** Top-level site nav

White background, height ~64px, horizontal flex: logo left, nav links center-left, utility buttons right. No bottom border — separation from hero is achieved by color contrast.

### Decorative Shape Module
**Role:** Brand illustration element

Flat vector shapes in #56f09f on dark teal hero — rounded rectangles, connecting lines, organic key/branch motifs. No gradients, no shadows, 100% opaque mint.

### Footer Section Block
**Role:** Dark footer column

Background #004737, text #fffbec at 14px, section headings at 20px, generous padding 40px, border-radius 0 (full-bleed).

### Icon Glyph
**Role:** UI icon system

Outlined 1.5px stroke, 16–20px size, color Sage Whisper (#99b5af) on cream or #fffbec on teal. Rounded line caps. Filled variant in #56f09f for active states.

### Circular Action Button
**Role:** Floating utility (download, scroll)

40px circle, 1px solid #ccdad7 border, white background, centered icon, no shadow.

## Do's and Don'ts

### Do
- Use Aeonik at weight 400 for all text — never introduce bold or light weights; let size and negative tracking create hierarchy
- Apply -0.043em letter-spacing at 56px and above; tighten to -0.030em at 32–36px; open up to +0.020em at caption sizes 8–12px
- Use Forest Ink (#004737) for hero backgrounds and primary structural borders; never use it as a small accent — it is a surface color
- Reach for Mint Pulse (#56f09f) only on filled buttons, active icons, and decorative shapes; its rarity is the system
- Set borders at 1–2px using Forest Ink on dark sections and Stone Mist (#ccdad7) on light sections instead of adding shadows
- Set page background to Cream Canvas (#fffbec) — never pure #ffffff for the base canvas
- Use border-radius 40px on all buttons, 19px on cards, and 9999px on pill tags

### Don't
- Don't introduce additional font weights — the monoweight system is the signature
- Don't use Mint Pulse (#56f09f) as a large surface area — it loses punch; keep it to button-sized and icon-sized moments
- Don't add drop shadows beyond rgba(0,0,0,0.04) 0px 3px 2px 0px — the flatness is intentional
- Don't use pure #ffffff as the page background — the cream warmth is load-bearing for the botanical feel
- Don't apply gradients — the system is strictly flat color blocks
- Don't use #8f37ff (Iris Spark) as a functional color — it is decorative only and should appear rarely
- Don't center-align body copy or lists — only headlines; body text stays left-aligned for reading rhythm

## Elevation

- **Card:** `rgba(0, 0, 0, 0.04) 0px 3px 2px 0px`

## Surfaces

- **Page Canvas** (`#fffbec`) — Base background for all light sections — warm cream replaces pure white
- **Card Lift** (`#faf2d5`) — Slightly warmer card surface within cream pages — subtle separation without hard borders
- **Tinted Highlight** (`#d4ffe8`) — Mint-tinted surface for selected cards, tag backgrounds, pill highlights
- **Dark Hero Panel** (`#004737`) — Full-bleed dark teal sections — hero, footer blocks, feature panels

## Imagery

The site uses flat geometric illustration over photography. The hero features a organic key-and-branch diagram in solid mint (#56f09f) on the deep teal background — rounded rectangles connected by thick lines, evoking a growing plant or network. No product screenshots, no lifestyle photography, no 3D renders. Iconography is outlined 1.5px stroke in a consistent single style. Imagery is decorative atmosphere rather than explanatory content; the brand relies on color and shape language instead of photographs.

## Layout

Page model is max-width 1200px centered, with full-bleed dark teal sections breaking out. The hero is a full-viewport-height dark teal band with centered headline and decorative illustration. Navigation is a white top bar with logo left, links center-left, and utility actions (language, book demo, login) right-aligned. Sections alternate between cream canvas and forest-teal panels, separated by generous 40–80px vertical gaps. Content within light sections is primarily left-aligned text in a single column at 600–800px max width. Cards use a 19px radius and appear in 1- or 3-column grids. The overall rhythm is spacious breathing room between sections, compact information density within them.

## Similar Brands

- **Linear** — Same monoweight sans-serif (Aeonik/Inter at single weight) with negative letter-spacing on display sizes and flat color-block hero sections
- **Arc browser** — Cream/warm canvas with a single vivid accent color, rounded surfaces, and flat illustration over photography
- **Notion** — Light cream backgrounds, generous border-radius, and border-driven separation instead of heavy shadows
- **Mercury** — Deep brand-color hero panels with cream/off-white text, flat surfaces, and single-accent-color interaction moments
- **Pitch** — Monoweight geometric sans, warm off-white canvas, and border-radius-driven soft geometry without gradients or shadows
