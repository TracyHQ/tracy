# (dot)connect — Style Reference
> Swiss engineering blueprint with a single ember

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

(dot)connect operates as a Swiss-engineering canvas: a warm off-white stage (#fcfbf8) where a single near-black ink (#001011) does almost all the work, and a vivid orange (#fd5321) appears only as deliberate punctuation — never decoration. The typographic signature is extreme: headlines balloon to 72-101px with aggressive negative tracking (-0.025em), creating a display voice that feels architectural rather than marketing-soft. Components are softly rounded (20-24px radii on cards and buttons), never sharp, never heavy — elevation is implied through hairline borders and tonal surface shifts, not shadows. The system reads as 'engineering blueprint with a pulse of fire': monochromatic discipline broken by one warm chromatic gesture per viewport.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone Canvas | `#fcfbf8` | Primary page background, card surfaces, light text on dark — warm off-white reads as paper, not screen |
| Charcoal Ink | `#001011` | Primary text, headings, primary action fill, dominant borders — near-black with a barely-perceptible cool tint that distinguishes it from pure #000 |
| Smoke Veil | `#0f1e1f` | Secondary text and borders for body-level elements — a half-step lighter than Charcoal for visual hierarchy without contrast loss |
| Ash Layer | `#ededea` | Elevated card backgrounds, subtle surface differentiation, hover states — a warm gray that complements the bone canvas without going cold |
| Mist Border | `#c1c4c2` | Hairline borders, dividers, section separators — barely visible structural lines |
| Ember | `#fd5321` | Orange wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Signal Blue | `#007aff` | Outlined action border for secondary interactive elements — ghost-button strokes only, never filled |

## Typography

### AeonikPro — Primary typeface across all UI: body (16-18px/400), navigation (16px/500), card titles (24-32px/500), section headings (36px/500), hero display (72-101px/400-500). The custom font's geometric proportions and the 'dlig', 'ss02', 'ss08' stylistic alternates give the system its engineering-precise voice — ss08 likely enables a more open 'a' and 'e', ss02 a distinctive 'g'
- **Substitute:** Inter, Satoshi, General Sans
- **Weights:** 400, 500
- **Sizes:** 16, 18, 21, 24, 32, 36, 72, 101
- **Line height:** 1.0–1.5
- **Letter spacing:** -0.025em at 72-101px, -0.012em at 32-36px, +0.010em at 16-18px body
- **OpenType features:** `"dlig" on, "ss02" on, "ss08" on`

### DotConnect — Branded display variant for hero and section headings — used selectively where the brand name or signature statements appear, giving those moments a distinct voice from the general AeonikPro headlines
- **Substitute:** AeonikPro with same tracking values
- **Weights:** 500
- **Sizes:** 19, 24, 36, 73
- **Line height:** 1.0–1.67
- **Letter spacing:** -0.012em at 36-73px, +0.010em at 19px
- **OpenType features:** `"dlig" on, "ss02" on, "ss08" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.5 | 0.16px |
| body | — | — | 18px | 1.4 | 0.18px |
| subheading | — | — | 24px | 1.4 | -0.29px |
| heading-sm | — | — | 32px | 1.1 | -0.38px |
| heading | — | — | 36px | 1.1 | -0.72px |
| heading-lg | — | — | 72px | 0.9 | -1.8px |
| display | — | — | 101px | 0.8 | -2.53px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 24px
- **Element gap:** 24px

### Border Radius

- **cards:** 20px
- **links:** 44px
- **pills:** 48px
- **badges:** 8px
- **images:** 20px
- **buttons:** 24px

## Components

### Filled CTA Button (Ember)
**Role:** Primary action — 'let's connect' in header, key conversion points

Pill-shaped (24px radius) filled button. Background: #fd5321. Text: #fcfbf8 at 16px, AeonikPro 500, letter-spacing +0.010em. Padding: 8px 24px. Optional leading icon slot. No border, no shadow — the orange does all the work against the bone canvas.

### Arrow Pill Button
**Role:** Secondary action — 'more' CTAs, inline navigation triggers

Pill-shaped (44px radius) button with circular arrow icon on left and label on right. Background: #001011. Icon circle: #fcfbf8 with #001011 arrow glyph. Text: #fcfbf8 at 16px AeonikPro 500. Padding: 6px 20px 6px 6px. Icon circle is 32px diameter.

### Ghost/Outlined Action
**Role:** Tertiary interactive — secondary CTAs that should not compete with Ember

Transparent fill with #007aff border (1px). Text: #007aff at 16px AeonikPro 500. Radius: 24px. Padding: 12px 24px. Used when an action exists but is subordinate to the primary Ember CTA.

### Offer Card
**Role:** Two-column service offering cards ('corporates', 'investors')

Background: #fcfbf8. Border: 1px #c1c4c2. Border-radius: 20px. Padding: 32px. Title: AeonikPro 500 at 24px, #001011. Body: AeonikPro 400 at 18px, #0f1e1f. Arrow icon prefix on title in a 24px circle. No shadow — borders carry the structure.

### Case Study Card
**Role:** Stories carousel cards (e.g. 'skillchain')

Vertical card with image container on top, text below. Image container: aspect ratio ~4:3, 20px top radius, overflow hidden. Text block: padding 16px on bone canvas. Project name: AeonikPro 500 at 18px, #001011. Description: AeonikPro 400 at 16px, #0f1e1f. Subtle border or no border — image is the visual anchor.

### Section Header
**Role:** Section openers — 'offer', 'stories', etc.

Two-part header: left side has a numbered arrow icon + section name in AeonikPro 500 at 18px, #001011. Right side has parenthetical section number (e.g. '(02)', '(04)') in same style. Below, optional centered headline at 32-36px. Horizontal hairline (#c1c4c2) separates header from content.

### Top Navigation
**Role:** Primary site navigation

Fixed/sticky top bar. Logo '(dot)connect' on far left at 19px AeonikPro 500. Center: nav links (about, offer, brainpower, stories, team, philosophy) at 16px AeonikPro 400, #0f1e1f, 24px gap. Far right: Ember CTA button. No background blur or border — sits on bone canvas.

### Carousel Navigation
**Role:** Horizontal scroll indicators for stories section

Circular buttons (32px) positioned at vertical center of carousel track. Background: #fcfbf8 with #001011 arrow glyph. No border, no shadow. Left/right pair flanking the card row.

### Badge / Tag
**Role:** Inline metadata, small status labels

Small pill with 8px radius. Background: #fcfbf8. Border: 1px #c1c4c2. Padding: 4px 8px. Text: AeonikPro 400 at 14px, #0f1e1f.

### Hero Section
**Role:** First-viewport statement

Full-width on bone canvas. Centered text block, max-width ~900px. Headline: AeonikPro 400-500 at 72-101px, #001011, line-height 0.8-0.9, letter-spacing -0.025em. Subtext: AeonikPro 400 at 18px, #0f1e1f, max 60ch. Arrow pill CTA centered below. No hero image — text IS the hero.

### 3D Render Feature Block
**Role:** Full-width visual interludes between text sections

Full-bleed image area on bone canvas. Contains metallic/glass 3D render (brain, abstract objects) often with Ember-colored particle accents. No caption overlay — the visual speaks alone with breathing room above and below.

## Do's and Don'ts

### Do
- Use Ember (#fd5321) for exactly one CTA per viewport — it loses all power if it appears twice on screen
- Set headline letter-spacing to -0.025em at 72px+ and relax it to +0.010em at body sizes — this asymmetry is the typographic signature
- Apply 20px radius to all cards, 24px to all buttons, 44-48px to pill-shaped elements — never mix 8px and 20px in the same component family
- Separate sections with 96px vertical breathing room on bone canvas — the whitespace IS the layout system
- Use the Arrow Pill Button (dark fill, circular icon) for inline 'more' actions, not the Ember CTA — reserve Ember for top-right header and key conversion moments
- Enable 'dlig', 'ss02', 'ss08' font features on all AeonikPro text — these stylistic alternates are part of the brand voice
- Use #c1c4c2 hairline borders (1px) for structure instead of shadows — the system is border-driven, not elevation-driven

### Don't
- Don't use shadows or drop-shadow effects — the system has no elevation language; depth comes from tonal surface shifts
- Don't place Ember on Ember or Ember on #001011 surfaces without testing contrast — the orange can vibrate uncomfortably against the dark charcoal
- Don't set body text below 16px or above 21px — the type scale skips small sizes deliberately to maintain confidence
- Don't use #007aff as a filled background — it is a ghost/outlined accent only; filled blue breaks the monochrome-ember logic
- Don't add decorative gradients, glows, or blur effects — the system is flat, bordered, and high-contrast
- Don't right-align body paragraphs — body text is always left-aligned; only display headlines may be centered
- Don't use icons with stroke weights under 1.5px or over 2px — the icon system matches the 1px border language

## Surfaces

- **Bone Canvas** (`#fcfbf8`) — Page background, base layer
- **Ash Layer** (`#ededea`) — Card and elevated surface backgrounds
- **Smoke Veil** (`#0f1e1f`) — Dark mode moments, high-contrast containers
- **Ember** (`#fd5321`) — Brand-emphasis surface — used on CTA buttons and accent blocks

## Imagery

Imagery is sparse and high-impact: large full-bleed 3D renders sit as interludes between text-heavy sections, never as backgrounds under text. The renders are metallic/chrome with glass-like translucency, often featuring a single Ember-orange accent (particles falling from a chrome brain, orange geometric objects). Case study cards use 3D illustration thumbnails with the same metallic+orange treatment. No photography, no people, no lifestyle imagery — the visual language is object-as-hero, abstract and sculptural. Iconography is minimal and monoline: simple arrow glyphs in circular containers, no icon sets or decorative symbols. The overall density is text-dominant with imagery appearing once per 2-3 viewport heights.

## Layout

Full-width sections on bone canvas with content centered to a ~1200px max-width. The page rhythm is: text-hero → full-bleed 3D visual → numbered text section with 2-column card grid → full-bleed 3D visual → numbered text section with 3-column carousel. Sections are separated by 96px vertical gaps with no dividers — whitespace defines boundaries. The top navigation is a single thin bar (logo left, links center, Ember CTA right) that sits on bone canvas without a background fill or border. Section headers use a split layout: numbered label left, parenthetical count right, with centered headlines below for major sections. The grid system is implicit — content aligns to a 24px column gap with cards arranged in 2 or 3 columns depending on context. No sidebar, no sticky elements other than nav, no mega-menus.

## Similar Brands

- **Linear** — Same commitment to generous whitespace, geometric sans-serif at extreme display sizes, and monochrome interfaces with a single accent color used surgically
- **Vercel** — Identical typographic confidence — oversized tightly-tracked headlines, minimal component vocabulary, and the same border-over-shadow elevation philosophy
- **Pitch** — Shares the warm off-white canvas treatment and the pattern of using a vivid accent (orange-adjacent) only for high-intent CTAs while keeping all structural elements achromatic
- **Loom** — Same pill-shaped button language with circular icon prefixes, and the same restraint of letting a single warm color carry all the emotional weight in an otherwise quiet system
