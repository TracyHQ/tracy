# Fingerprint — Style Reference
> warm CRT terminal on cream paper — a fraud-detection lab notebook where code blocks are the main characters

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Fingerprint reads as a developer tool that has been deliberately warmed up: a cream-paper canvas (#fafaf8) sits beneath sharp black type, a single vivid orange (#f35b22) does the work of a highlighter on key nouns, and the rest of the accent palette is borrowed from an IDE — teal, blue, pink, green as code-syntax tokens. Surfaces are flat with hairline borders; elevation is whispered, not announced. The hero alternates between editorial typography (Inter, tight tracking) and a dark CRT-style terminal panel, establishing a two-mode visual rhythm: light prose, dark code. Orange never decorates — it annotates, turning one word per headline into a call-to-action, and turning the primary button into the only filled rectangle on the page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream Paper | `#fafaf8` | Page canvas and primary surface — warm off-white that softens the otherwise stark black/orange system |
| Card White | `#ffffff` | Elevated card surfaces and input backgrounds — sits one step above the cream canvas |
| Pebble Gray | `#f0f0ef` | Secondary surface for section bands, subtle backgrounds behind grouped content |
| Linen Border | `#e4e5e1` | Hairline dividers, card borders, and table separators — the dominant structural line color |
| Ash | `#d9d9d9` | Disabled controls, placeholder shapes, and de-emphasized borders |
| Ink | `#141415` | Primary headings, body text, and the near-black terminal panel background |
| Graphite | `#2e2e2c` | Dark elevated surfaces for code blocks and terminal mockups |
| Carbon | `#454542` | Secondary text, button text on light backgrounds, icon strokes |
| Slate | `#6e6f6c` | Muted helper text and meta-information |
| Stone | `#8c8c89` | Tertiary captions, timestamps, inactive nav items |
| Fog | `#b7b7b4` | Light placeholder text, icon tints on muted backgrounds |
| Signal Orange | `#f35b22` | Orange supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Ember | `#ff5e24` | Hover state for Signal Orange, secondary highlight orange for icons and micro-emphasis |
| Apricot | `#f77c55` | Lighter orange for inline links, secondary text accents, and warm icon strokes |
| Burnt Orange | `#be400f` | Deep orange for borders on featured elements, hover borders, and dark-mode accent strokes |
| Persimmon | `#d14200` | Darkest orange for high-contrast text accents on light surfaces and breadcrumb separators |
| Peach Blush | `#ffcab5` | Pale orange wash for decorative borders and soft highlight backgrounds |
| Teal Token | `#88d2c3` | IDE syntax-highlight color for strings and identifiers in code blocks — repeated at scale gives the page its terminal texture |
| Sky Token | `#8bc5f3` | IDE syntax-highlight for keys, booleans, and object properties in code blocks |
| Orchid Token | `#c678dd` | IDE syntax-highlight for keywords and function names in code blocks |
| Forest | `#165424` | Green supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Success Green | `#62b06d` | Green supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Coral Alert | `#f67976` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Rose Blush | `#f9aea9` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |

## Typography

### Inter — Primary UI and editorial typeface — handles all headings, body text, buttons, and navigation. Weight 600 is the default for headlines, weight 400 for body, weight 500 for labels. Calt and liga features are disabled, giving the type a more uniform, 'engineered' feel rather than the swashy alternates Inter ships with.
- **Substitute:** Inter (Google Fonts)
- **Weights:** 300, 400, 500, 600, 700
- **Sizes:** 9, 10, 11, 12, 13, 14, 16, 30, 36, 48
- **Line height:** 1.15 (display/heading), 1.50 (body), 1.60 (body-sm), 1.67 (captions)
- **Letter spacing:** -0.0620em at 48px (≈-2.98px), -0.0200em at 36px (≈-0.72px), 0.0010em at 16px (≈0.016px), 0.0100em at 14px (≈0.14px), 0.0600em at 12px (≈0.72px), 0.0800em at 11px (≈0.88px), 0.1200em at 10px (≈1.2px), 0.2000em at 9px (≈1.8px)
- **OpenType features:** `"calt" 0, "liga" 0`

### JetBrains Mono — Developer-language typeface — owns the eyebrow labels ('I'M A DEVELOPER'), code blocks, terminal output, API URLs, and visitor IDs. Acts as a visual signature: whenever the page shifts from prose to technical content, JetBrains Mono takes over. Weight 470 is the distinctive 'regular' weight that sits between 400 and 500.
- **Substitute:** JetBrains Mono (Google Fonts) or IBM Plex Mono
- **Weights:** 300, 400, 470, 500, 600, 700
- **Sizes:** 8, 10, 11, 12, 13, 14
- **Line height:** 0.86 (tight label stacks), 1.00 (inline code), 1.45–1.62 (code blocks)
- **Letter spacing:** -0.0800em (tight tracking on IDs/strings), 0.0010em (default), 0.1000em (wide tracking on uppercase eyebrow labels)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| eyebrow | — | — | 11px | 1.45 | 0.88px |
| heading-sm | — | — | 30px | 1.17 | -0.6px |
| heading | — | — | 36px | 1.15 | -0.72px |
| display | — | — | 48px | 1.15 | -2.98px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 72px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **nav:** 4px
- **cards:** 12px
- **badges:** 4px
- **buttons:** 4px
- **code-panels:** 12px
- **large-blocks:** 16px

## Components

### Primary CTA Button
**Role:** Filled orange button for top-of-funnel conversion actions

Background: #f35b22. Text: #ffffff, Inter weight 500, 14px, letter-spacing 0.14px. Padding: 12px 24px. Border-radius: 4px. Box-shadow: rgba(255,255,255,0.2) 0px 1px 0px 0px inset, rgba(24,25,22,0.06) 0px 1px 2px 0px, rgba(24,25,22,0.1) 0px -1px 0px 0px inset. Hover transitions to #ff5e24. The only filled button in the system — everything else is ghost or outlined.

### Secondary Ghost Button
**Role:** Outlined or transparent button for secondary actions

Background: transparent. Text: #141415, Inter weight 500, 14px. Border: 1px solid #d9d9d9. Border-radius: 4px. Padding: 12px 24px. No shadow. Used for 'Contact Sales' and 'See all Use Cases' — always paired with a primary CTA.

### Terminal Code Panel
**Role:** Dark code block showing API responses, visitor IDs, and JSON output

Background: #141415. Border-radius: 12px. Padding: 24px. Text: JetBrains Mono weight 400, 13px, line-height 1.57. JSON keys in #8bc5f3 (Sky), string values in #88d2c3 (Teal), numbers/booleans in #c678dd (Orchid), punctuation in #abb2bf. May include a top tab bar with an 'I'M A DEVELOPER' eyebrow label in JetBrains Mono 11px weight 500, letter-spacing 0.88px, color #abb2bf. This is the page's signature component.

### Feature Card
**Role:** Light card for use cases, features, and content blocks

Background: #ffffff. Border: 1px solid #e4e5e1. Border-radius: 12px. Padding: 24px. Box-shadow: rgba(228,229,225,0.3) 0px 1px 0px 0px inset, rgba(110,111,109,0.1) 0px -1px 0px 0px inset. Contains a small orange icon (stroke 1.5px, #f35b22) at top-left, Inter weight 600 heading 16px, body text 14px weight 400 in #6e6f6c. No hover elevation change.

### Accordion Use Case Item
**Role:** Expandable list item for use case descriptions

Background: #ffffff. Border: 1px solid #e4e5e1. Border-radius: 4px. Padding: 16px 20px. Title in Inter weight 600 16px #141415 with a small orange icon prefix. Expand/collapse chevron in #8c8c89. Expanded body text in Inter 14px weight 400 #454542. Stacked vertically with 1px gap between items.

### Eyebrow Label
**Role:** Small uppercase label above headings and section titles

JetBrains Mono weight 500, 11px, line-height 1.45, letter-spacing 0.88px. Color: #f35b22 for branded labels (e.g., 'I'M A DEVELOPER'), #6e6f6c for neutral labels. Always uppercase. Acts as a category marker before the main heading.

### Stats Block
**Role:** Large numeric stat with caption

Number: Inter weight 600, 36px, color #f35b22, letter-spacing -0.72px. Caption below: Inter weight 400, 14px, color #6e6f6c, line-height 1.5. Arranged in 3-column equal-width grid with 72px gap. The orange number is the visual anchor; the caption recedes.

### Trust Logo Strip
**Role:** Row of partner/client logos for social proof

Full-width band, background #ffffff. Logos displayed at uniform height (~24px), grayscale, evenly spaced in a single row. Above the logos, a centered eyebrow label in JetBrains Mono: 'TRUSTED BY 6000+ COMPANIES OF ALL SIZES' in 11px, letter-spacing 0.88px, color #8c8c89.

### Navigation Bar
**Role:** Fixed top navigation header

Background: rgba(250,250,248,0.85) with backdrop blur. Height: 64px. Logo (fingerprint icon + 'Fingerprint' wordmark) left, primary nav links center (Inter 14px weight 500 #141415), two buttons right (ghost 'Login' + filled 'Get Started'). Box-shadow: rgba(24,25,22,0.02) 0px 2px 1px 0px, rgba(24,25,22,0.1) 0px -1px 0px 0px inset.

### Inline Highlighted Word
**Role:** Single word or phrase in Signal Orange within a heading

Runs inline within an otherwise black Inter heading. Color: #f35b22, same weight and size as surrounding text. Used to create editorial emphasis without changing the typographic rhythm. Example: 'Identify Every Visitor' where 'Every' is orange.

### Device Detection Card
**Role:** Overlay card showing device intelligence data next to a phone mockup

Background: #ffffff. Border: 1px solid #e4e5e1. Border-radius: 12px. Padding: 16px. Contains structured key-value pairs: label in Inter 12px weight 500 #6e6f6c, value in JetBrains Mono 13px #141415. Suspicious scores highlighted in #f67976. Clean, tabular, monospace data presentation.

### Integration Icon Row
**Role:** Horizontal strip of technology/integration logos

Small icons (~32px) in a single row, evenly spaced. Icons are grayscale or muted. Background: dark or light depending on section. Used to show platform breadth (SDKs, integrations). No labels — icon recognition is the point.

## Do's and Don'ts

### Do
- Use #f35b22 as the single filled button color — never introduce a second filled button color
- Apply the inline orange highlight pattern to one word per headline: wrap the most important noun in #f35b22 while keeping the rest #141415
- Set Calt and Liga to 0 on all Inter text to preserve the engineered, non-decorative letterform character
- Use JetBrains Mono 11px weight 500 with 0.88px letter-spacing for all uppercase eyebrow labels
- Apply 4px radius to buttons, nav items, and badges; 12px radius to cards and code panels; 16px only to large feature blocks
- Pair every primary CTA with a ghost secondary button — never show a primary CTA alone in the navigation or hero
- Use #141415 or #2e2e2c as the background for any code or terminal content — code blocks should never appear on the cream canvas

### Don't
- Don't add drop shadows beyond the four defined elevation tokens — the system uses hairline borders and inset highlights, not floating shadows
- Don't use the syntax-highlight colors (#88d2c3, #8bc5f3, #c678dd) outside of code/terminal contexts — they are borrowed from an IDE palette, not decoration
- Don't introduce a second accent color — orange is the only chromatic voice in the system
- Don't use #f35b22 on dark backgrounds without testing contrast — the orange is calibrated for light surfaces
- Don't set body text below 14px in Inter or below 12px in JetBrains Mono — the type scale has a hard floor
- Don't apply rounded corners above 16px — the system is intentionally low-radius, not pill-shaped
- Don't use gradients — the system is flat; if depth is needed, use the inset highlight + border-radius 12px pattern instead

## Elevation

- **Navigation bar:** `rgba(24, 25, 22, 0.02) 0px 2px 1px 0px, rgba(24, 25, 22, 0.1) 0px -1px 0px 0px inset`
- **Cards:** `rgba(228, 229, 225, 0.3) 0px 1px 0px 0px inset, rgba(110, 111, 109, 0.1) 0px -1px 0px 0px inset`
- **Links and interactive text:** `rgba(24, 25, 22, 0.06) 0px 1px 2px 0px`
- **Primary buttons:** `rgba(255, 255, 255, 0.2) 0px 1px 0px 0px inset, rgba(24, 25, 22, 0.06) 0px 1px 2px 0px, rgba(24, 25, 22, 0.1) 0px -1px 0px 0px inset`

## Surfaces

- **Cream Canvas** (`#fafaf8`) — Base page background and dominant surface for all content sections
- **Card White** (`#ffffff`) — Elevated cards, feature blocks, and form surfaces that sit on the canvas
- **Pebble Band** (`#f0f0ef`) — Alternating section background to create visual separation between content groups
- **Terminal Dark** (`#141415`) — Dark code blocks, terminal mockups, and developer-focused panels — the only dark surface in the system
- **Graphite Panel** (`#2e2e2c`) — Slightly lighter dark surface for nested code blocks and elevated terminal sections

## Imagery

Visuals are dominated by dark code/terminal panels showing JSON API responses and visitor identification data — these are the product's portfolio pieces, not decorative. Supporting visuals include a minimal phone/device mockup showing device intelligence results in a card overlay. The trust bar at the bottom uses small grayscale partner logos in a single row. No lifestyle photography, no illustrations, no 3D renders. The only 'graphic' element is the fingerprint logo mark, a simple overlapping-circle fingerprint icon in Signal Orange. When screenshots or product UI appear, they are treated as flat artifacts: dark backgrounds, mono fonts, syntax-highlighted text — the page treats code as a first-class visual medium.

## Layout

Max-width ~1200px centered content with full-bleed background sections. The hero is a centered text stack over the cream canvas, immediately followed by a wide dark terminal panel that breaks the light grid. Below the fold, the page alternates between two-column text+visual blocks (text-left/visual-right, then visual-left/text-right) and full-width feature card grids. Stats sections use a 3-column equal-width grid with large orange numbers. The trust bar is a single full-width row of logos. Navigation is a fixed top bar with logo left, primary nav center, and two buttons (ghost + filled orange) right. The overall rhythm is: light prose → dark code → light prose → dark code, creating a two-mode cadence that reinforces the developer-tool identity.

## Similar Brands

- **Snyk** — Same devtools DNA: warm-neutral canvas, single bold accent color for CTAs, JetBrains Mono for code, dark code panels breaking up light prose sections
- **Linear** — Similar tight typographic rhythm with negative letter-spacing on headings, hairline borders, flat cards with subtle inset highlights instead of drop shadows
- **Vercel** — Same editorial approach to monochrome: near-black text on warm off-white, one accent color doing all the emphasis work, minimal elevation philosophy
- **Auth0 / Okta Developer** — Shared developer-console aesthetic with terminal-style dark panels containing syntax-highlighted JSON, mono fonts for technical content, and code-as-hero compositions
