# Linktr — Style Reference
> Editorial posters stacked like candy. A full-bleed color-block site where lime green headlines sit on cobalt blue walls and white pill-shaped navs float across maroon fields.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Linktree speaks in full-volume color blocks: each section is a saturated wall of lime, cobalt, or maroon, and content floats on top as white pills and dark text. The system treats color as the layout, not decoration — headers, cards, and CTAs inherit the section hue rather than fighting it, while a recurring chartreuse green acts as the brand's singular action accent. Typography is a single custom geometric sans (Linksans) set extra-bold with tight negative tracking at display sizes, giving headlines a compressed, poster-like weight. Shapes are aggressively rounded: nav bars and buttons become perfect pills, cards become lozenges, and only form inputs keep a modest 8px corner. The result reads as a series of bold editorial spreads rather than a conventional product page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Voltage Lime | `#d2e823` | Primary action buttons, highlighted headlines, accent surfaces — the brand's signature chartreuse, used sparingly as functional punctuation across every section |
| Cobalt Signal | `#2665d6` | Full-bleed section backgrounds, link accents — saturated blue used as an alternate hero band |
| Bordeaux Maroon | `#780016` | Full-bleed FAQ and deep sections — dark wine red for high-contrast blocks |
| Midnight Ink | `#1e2330` | Primary text, icon fills, dark UI outlines — near-black with a faint blue undertone, the default ink color |
| Plaster White | `#ffffff` | Card surfaces, button text, pill nav background — pure white floats above the colored sections |
| Bone Canvas | `#f3f3f1` | Page background base, subtle button surfaces — warm off-white with a faint green cast |
| Cement Gray | `#adadad` | Muted card backgrounds, disabled or secondary surfaces |
| Slate Mute | `#676b5f` | Muted link text, secondary borders, low-emphasis text — warm desaturated olive-gray |
| Carbon | `#222222` | Deep button text and borders for inverted controls |
| Lilac Whisper | `#e9c0e9` | Decorative borders, icon strokes, soft accent washes — pastel pink used for outlines and ornaments |
| Indigo Abyss | `#061492` | Deep card surfaces, tertiary button backgrounds — saturated navy |
| Forest Depth | `#254f1a` | Headline outlines, bordered cards, body emphasis — dark forest green as an alternate text color |
| Saffron | `#d6a337` | Card accent backgrounds — warm gold for variety blocks |

## Typography

### Arial — System fallback for form inputs and legacy text nodes — only appears as a default rendering, not a designed choice
- **Substitute:** system-ui
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.50

### Linksans — Primary brand typeface — geometric custom sans used everywhere from nav to 80px display headlines. Weight 700–800 at large sizes with negative letter-spacing creates the compressed, poster-like headline voice. Substitute with Inter or Space Grotesk if Linksans is unavailable.
- **Substitute:** Inter
- **Weights:** 400, 500, 700, 800
- **Sizes:** 12px, 13px, 14px, 15px, 20px, 24px, 25px, 51px
- **Line height:** 1.06–1.50
- **Letter spacing:** -0.043em at 80px, -0.024em at 56px, -0.020em at 24–28px, -0.013em at 18px, -0.010em at 15–16px, normal at 12–14px

### Linksans Linksansvf — Linksans Linksansvf — detected in extracted data but not described by AI
- **Weights:** 400, 500, 700, 800
- **Sizes:** 14px, 16px, 18px, 24px, 28px, 56px, 80px
- **Line height:** 1, 1.06, 1.07, 1.2, 1.3, 1.5
- **Letter spacing:** -0.02, -0.01, 0.01

### yerk — yerk — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.5 | -0.28px |
| body | — | — | 16px | 1.5 | -0.16px |
| subheading | — | — | 20px | 1.31 | -0.4px |
| heading-sm | — | — | 24px | 1.2 | -0.48px |
| heading | — | — | 28px | 1.2 | -0.56px |
| heading-lg | — | — | 51px | 1.06 | -1.22px |
| display-alt | — | — | 56px | 1.06 | -1.34px |
| display | — | — | 80px | 1 | -3.44px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **nav:** 8px
- **tags:** 9999px
- **cards:** 32px
- **pills:** 1000px
- **inputs:** 8px
- **buttons:** 9999px

## Components

### Floating Pill Navigation
**Role:** Primary site navigation

White rounded pill floating over full-bleed color sections. Background #ffffff, radius 1000px, height ~64px, horizontal padding ~32px. Logo on left in Midnight Ink (#1e2330). Nav links in 14–15px Linksans 500 at #1e2330. Right side: ghost 'Log in' (dark text, no border) + filled black 'Sign up free' button (#000000, white text, 9999px radius, 18px 22px padding).

### Lime Primary Button
**Role:** Main call-to-action

Filled chartreuse green button. Background #d2e823, text #1e2330, radius 9999px, padding 18px 22px. Font: Linksans 700 at 16px. The signature CTA color; appears on every section. Hover darkens to #b8c91b.

### Black Sign-Up Button
**Role:** Secondary navigation action

Filled black button in the nav pill. Background #000000, text #ffffff, radius 9999px, padding 12px 20px. Font: Linksans 500 at 14–15px. Sits at the far right of the floating nav.

### Ghost Text Button
**Role:** Tertiary inline action

Text-only button with no fill or border. Text in #1e2330, Linksans 500 at 14–15px. Used for 'Log in' in nav. Hover adds underline.

### Dark Outlined Card
**Role:** Feature or FAQ card

Card with dark background and light text. Background #780016 (maroon) or #061492, text #ffffff, radius 32–64px, padding 24px. Thin 1px border in #e9c0e9 or #254f1a. Used for FAQ items and feature blocks.

### Phone Mockup Card
**Role:** Product showcase

Rounded device frame containing app screenshots. Outer container radius 32–64px, often a brand-color block. Inner phone shape radius 41.6px. Used to display Linktree profile previews at angles.

### Bordered Accent Card
**Role:** Highlighted content block

Card with visible colored border, no fill or tinted fill. Border 2px in #e9c0e9 (pink) or #254f1a (forest), radius 32–64px, padding 24–32px. Background can be #ffffff or section color. Creates a sticker-like emphasis.

### Text Input Field
**Role:** Form input

Simple input with bottom border or full border. Border 1px in #000000 or #676b5f, radius 8px, padding 8px 16px. Placeholder text in #757575. Font: Linksans 400 at 16px. Used in handle-creation form.

### Section Heading Block
**Role:** Display headline

Large headline set in 80px or 56px Linksans 800, letter-spacing -0.043em or -0.024em, line-height 1.0–1.06. Color matches section logic: Midnight Ink (#1e2330) on lime, Voltage Lime (#d2e823) on blue, Lilac Whisper (#e9c0e9) on maroon. Word-wraps in 2-line editorial stacks.

### Handle Input Group
**Role:** Profile creation form

Composite input: small fixed prefix label ('linktr.ee/') in Linksans 500, paired with a text input. Sits inline with the lime primary button to its right. White card-like container with subtle background.

### FAQ Accordion Row
**Role:** Expandable question item

Full-width row inside maroon section. Background a slightly lighter maroon, radius 16–32px, padding 20–24px. Question text in #ffffff Linksans 500 at 16–18px. Chevron icon in white, rotates 180° on expand. 1px Lilac Whisper (#e9c0e9) border possible.

### Top Banner Strip
**Role:** Promotional announcement bar

Full-width thin strip above the floating nav. Background Voltage Lime (#d2e823) or white, text #1e2330 in Linksans 500 at 13–14px. Includes a close (×) button on the right. Centers a short message with bold inline emphasis.

## Do's and Don'ts

### Do
- Use Voltage Lime (#d2e823) as the single primary action color on every section; never substitute another hue for CTAs
- Set display headlines at 56–80px Linksans 800 with negative letter-spacing (-0.024em to -0.043em) — tight tracking is signature
- Float the white pill navigation over full-bleed color sections; it should never sit on a flat white page edge
- Use pill radius (9999px) for all buttons and tags; reserve 8px only for inputs and form fields
- Apply full-bleed solid color section backgrounds as the primary layout device; avoid gradients and shadows entirely
- Pair each section's background with a single contrasting text color — Midnight Ink on lime, Voltage Lime on blue, Lilac Whisper on maroon
- Keep card radius in the 32–64px range for a lozenge, sticker-like feel on colored backgrounds

### Don't
- Don't use box-shadow or any drop-shadow effect for depth — separation must come from color contrast
- Don't set body or headline type in Arial or any system font; Linksans is non-negotiable for brand voice
- Don't use CTA colors other than #d2e823 — avoid blue, maroon, or pink buttons even when they match a section
- Don't apply tight negative letter-spacing below 18px — tracking only tightens at display sizes
- Don't break the full-bleed section model with subtle background tints or muted neutrals; sections should be loud and saturated
- Don't center body paragraphs — text blocks are left-aligned in a generous measure (max ~520px)
- Don't use square or small-radius buttons; everything clickable is a pill or lozenge
- Don't add gradients to backgrounds, buttons, or text — the system is strictly flat color

## Elevation

The system avoids drop shadows entirely. Depth is achieved through full-bleed color contrast — a white pill nav visibly sits on a lime or blue field, a maroon card sits on a slightly lighter maroon, a phone mockup sits on a cobalt block. No box-shadow, no blur, no glow. Flatness is the identity; separation comes from hue jumps, not elevation.

## Surfaces

- **Bone Canvas** (`#f3f3f1`) — Base page background, off-white warm neutral
- **Plaster White** (`#ffffff`) — Floating nav, cards, input fields, button text
- **Color Section Band** (`#d2e823`) — Full-bleed hero and content sections
- **Color Section Band Alt** (`#2665d6`) — Alternate full-bleed sections
- **Deep Section Band** (`#780016`) — FAQ and footer depth sections
- **Cement Overlay** (`#adadad`) — Muted overlays and secondary card backgrounds

## Imagery

Photography is lifestyle-candid: real creators in real environments, shot at medium distance with natural light, often posed with props that reinforce their trade (lettering artist with a brush, food founders with ingredients). Subjects are cropped with generous breathing room and never full-bleed — they sit in contained frames to the right of text. Product visuals are angled phone mockups floating in colored space, never literal screenshots. No illustration, no abstract graphics, no 3D renders. Iconography is minimal: simple outlined or filled glyphs at small sizes, Lilac Whisper or Midnight Ink, no multicolor icon system.

## Layout

Full-bleed color sections stacked vertically, each one a different hue (lime → blue → maroon). Inside each band, a max-width ~1280px centered content column. Hero pattern is a 2-column split: oversized left-aligned headline + supporting paragraph on the left, a contained photo or device mockup on the right. Navigation is a floating white pill that sits on top of the first color band, not pinned to the page edge. Sections alternate 2-column (text+visual) and full-width stacked content (centered headline → grid). No sidebar, no sticky header beyond the floating nav. Vertical rhythm is generous (80px section gaps) and the bottom of each section is a hard color cut, never a gradient fade.

## Similar Brands

- **Duolingo** — Full-bleed saturated color sections with a single lime-green action accent and rounded pill-shaped CTAs
- **Headspace** — Bold flat-color bands stacked vertically, playful rounded shapes, and a single warm accent punctuating the palette
- **Gumroad** — Loud solid-color hero sections, compressed bold display type, and a creator-first lifestyle photography style
- **Loom** — Vivid blue and purple full-bleed sections with pill navigation and oversized editorial headlines
- **Spotify Wrapped** — Saturated color-block storytelling with a single bright accent (lime) popping against deep brand hues
