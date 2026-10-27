# Hatch — Style Reference
> Hand-drawn zine meets pastel candy store. A cream-paper canvas splashed with mint highlights, confetti dots, and pill-shaped CTAs, where a chunky bold serif whispers fun and a blue mascot winks from the corner.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Hatch operates as a playful creative-agency brand on a warm cream canvas: the page reads like a hand-illustrated zine rather than a corporate SaaS site. Recoleta, a chunky high-contrast serif at very large sizes with tight negative tracking, carries every headline while a quiet grotesque (Lota Grotes Que Alt) handles UI and body. A four-color pastel palette — mint, sky, peach, pink — functions as functional punctuation against the cream, with mint green reserved for the primary action and the other three cycling through decorative dots, highlight swashes, illustration strokes, and tag chips. Cards, buttons, and tags lean heavily rounded (16–40px, full pill for CTAs), generous 4px-based spacing creates breathing room, and a recurring visual vocabulary of hand-drawn mint highlight swashes, confetti dots, and a cute blue mascot character threads the whole system together.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream Paper | `#f5f4f0` | Page background, canvas — warm off-white that softens the overall feel and keeps the pastel accents from vibrating against pure white |
| Pure White | `#ffffff` | Card and button surfaces — sits one elevation above the cream canvas |
| Ink Black | `#000000` | Primary text, hairline borders, icon strokes, card outlines — the dominant structural color, 3625 occurrences make it the spine of every layout |
| Charcoal | `#222222` | Body text and secondary headings when a slightly softer black is needed |
| Slate | `#333333` | Nav text and subdued UI labels |
| Fog | `#dddfe2` | Subtle link underlines and dividers in muted contexts |
| Mint Splash | `#99ffcc` | Primary action button fill, hand-drawn headline highlight swashes, active nav emphasis — the signature color that signals go |
| Plum Ink | `#160042` | Deep brand accent for dark surface text, illustration fills, and emphasis — provides a rich counterweight to the pastels |
| Aubergine | `#26153f` | Outlined action border, dark button outline variant — borders and strokes when a deeper violet frame is needed without filling |
| Sky Pop | `#7bbbff` | Decorative illustration strokes, confetti dots, secondary accent chips, icon outlines — the cool member of the pastel set |
| Bubblegum | `#ff99cc` | Decorative confetti dots, highlight swashes, playful accent shapes — adds warmth and energy |
| Peach Pop | `#ffcc99` | Decorative dots, warm accent fills, illustration warm tones — the sunset note in the pastel quartet |

## Typography

### Recoleta — All headlines, hero display, nav wordmark. Used exclusively at weight 700; the high-contrast chunky serif gives the brand its editorial-creative voice. Scales from 32px subheadings up to 151px hero display. Tight negative tracking (approximately -0.028em) tightens the bold forms at large sizes so the headline reads as one confident block rather than airy display type.
- **Substitute:** DM Serif Display
- **Weights:** 700
- **Sizes:** 18px, 24px, 32px, 48px, 64px, 72px, 84px, 151px
- **Line height:** 1.00–1.30
- **Letter spacing:** -0.028em

### Lota Grotes Que Alt — Body copy, UI labels, button text, nav links, icon labels. The 400 weight carries paragraphs and helper text; 700 weight handles button labels and small emphatic UI strings. Acts as the quiet utilitarian counterpoint to Recoleta's personality — it should never compete for attention.
- **Substitute:** Inter
- **Weights:** 400, 700
- **Sizes:** 14px, 18px, 24px
- **Line height:** 1.20–2.30

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | 0px |
| body | — | — | 18px | 1.5 | 0px |
| subheading | — | — | 24px | 1.3 | 0px |
| heading-sm | — | — | 32px | 1.2 | -0.9px |
| heading | — | — | 48px | 1.1 | -1.34px |
| heading-lg | — | — | 64px | 1.1 | -1.79px |
| display | — | — | 84px | 1.05 | -2.35px |
| hero | — | — | 151px | 1 | -4.23px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 28-40px
- **Element gap:** 24px

### Border Radius

- **tags:** 100px
- **cards:** 16px
- **large:** 40px
- **pills:** 9999px
- **small:** 4px
- **buttons:** 12px

## Components

### Mint CTA Button (Filled)
**Role:** Primary call-to-action in hero and key sections

Background #99ffcc, text #000000, 1px solid #000000 border, 12px radius, padding 10px 16px (or 8px horizontal on compact variants). Font: Lota Grotes Que Alt 700 at 18px. Sits confidently on the cream canvas — the mint fill is the single most attention-grabbing element on the page.

### Outline Button (Dark)
**Role:** Secondary action paired with the mint CTA

Transparent background, 1px solid #000000 border, 12px radius, padding 10px 16px. Text #000000 in Lota Grotes Que Alt 700. Always appears as the right-hand companion to the mint button in button groups.

### Pill Nav CTA
**Role:** Book-a-call button in the top navigation

Full 9999px (1440px) pill radius, background #99ffcc, 1px solid #000000 border, padding ~6px 16px. Text in Lota Grotes Que Alt 700. Distinguishes the persistent nav CTA from in-page CTAs by its full pill shape.

### Feature Card
**Role:** Logo tile in the social proof grid

Background #ffffff, 1px solid #000000 border, 16px radius, padding 24-32px. Contains a partner logo centered within. No shadow — the border alone defines the card edge on the cream canvas.

### Highlighted Headline Swash
**Role:** Hand-drawn highlight behind keywords in hero and section headlines

A mint green (#99ffcc) irregular oval brush stroke positioned behind selected words in Recoleta 700 headlines. Approximately 60-80% of the text height, offset to wrap the word's contour. This is a signature brand element — it should feel hand-drawn, not geometric.

### Confetti Decoration
**Role:** Scattered playful dots around hero and section edges

Small filled circles in #ff99cc, #7bbbff, #ffcc99, and #99ffcc, placed asymmetrically around headlines and illustrations. Sizes 6-12px, no border. They signal creative/playful energy without forming a pattern.

### Navigation Bar
**Role:** Top-of-page nav with logo and links

Transparent or cream (#f5f4f0) background, no border. Logo 'HATCH' in Recoleta 700 at left. Nav links in Lota Grotes Que Alt 400 at 14-18px in #000000, spaced with ~22px horizontal padding. Mint pill CTA anchored to the right.

### Circuit Illustration Panel
**Role:** Hero feature graphic showing platform distribution network

A rounded-rectangle container (~16px radius) with cream interior, containing radiating line-traces in peach, sky blue, and pink connecting social platform icons to a central mint play-button sphere. Functions as the primary explanatory visual below the hero.

### Mascot Character
**Role:** Brand mascot — blue speech bubble with pink headphones

Hand-drawn illustration: round blue (#7bbbff) speech bubble with a winking face, wearing pink (#ff99cc) headphones, with small sparkle marks. Used as a friendly anchor in the hero corner and section accents.

### Link Underline
**Role:** Inline text links in body copy

1px solid underline in #dddfe2 or #000000, no offset. Text remains in Lota Grotes Que Alt 400. Underline is the sole affordance — no color change on hover state to maintain editorial calm.

## Do's and Don'ts

### Do
- Use Recoleta 700 exclusively for all headlines and display text — never substitute a different serif or drop to a lower weight
- Apply the mint #99ffcc highlight swash behind one or two keywords per major headline to reinforce brand identity
- Pair every mint filled CTA with a dark outline button as its right-hand companion in button groups
- Set all cards to white #ffffff with a 1px solid #000000 border and 16px radius — never use shadows for depth
- Set the page background to cream #f5f4f0 rather than pure white to let the pastel accents read softly
- Use the full 9999px pill radius only for the persistent nav CTA and small tag chips — in-page CTAs use 12px radius
- Keep body text in Lota Grotes Que Alt 400 at 18px with generous line-height (1.5+) for an airy editorial read
- Place 4-8 confetti dots in mixed pastels around hero and section headlines, varying size 6-12px and color

### Don't
- Do not use box-shadow or drop-shadow on any element — depth comes from the cream/white surface contrast and 1px borders alone
- Do not use mint #99ffcc as a background fill for cards or large surfaces — reserve it for buttons and highlight swashes
- Do not mix sky blue, peach, and pink as CTA fills — only mint is a button color; the other three are decorative
- Do not center-align body paragraphs longer than three lines — switch to left-align at 600px max-width
- Do not use Recoleta below 24px — at small sizes the high-contrast serif becomes hard to read and the Lota grotesque should take over
- Do not use pure #000000 for large filled shapes or backgrounds — it dominates too aggressively on cream; use #000000 for strokes, text, and thin outlines only
- Do not apply the mint highlight swash to more than two keywords per headline or to body copy — it loses impact through repetition
- Do not add photography, stock images, or photorealistic renders — the visual system is illustration-only

## Elevation

Hatch avoids drop shadows entirely. All depth and separation is achieved through the combination of cream canvas + white card surfaces + 1px solid #000000 borders. This flat-with-line approach keeps the visual language in the zine/illustration register rather than a product-UI register. Never add box-shadow to cards, buttons, or modals.

## Surfaces

- **Canvas** (`#f5f4f0`) — Page background
- **Card** (`#ffffff`) — Elevated content surfaces, logo tiles, feature cards
- **Mint Action** (`#99ffcc`) — Primary CTA surface, highlight wash behind headlines
- **Decorative Accent** (`#ffcc99`) — Warm accent fills on illustration and chips

## Imagery

Hatch's visual language is illustration-first, photography-last. The page relies on three repeating graphic devices: (1) a cute hand-drawn blue speech-bubble mascot with pink headphones, appearing as a hero companion; (2) a circuit-board style infographic with radiating colored traces connecting social platform icons to a central mint play sphere, which visualizes the 'every platform' idea; (3) scattered confetti dots in the four pastel colors placed asymmetrically around headlines. All graphics have hand-drawn, slightly imperfect edges — never geometric-perfect vectors. The palette of pastels on cream reinforces a paper/zine aesthetic. There is no photography anywhere on the visible sections; the visual work is entirely carried by illustration, typography, and color.

## Layout

The page is centered, max-width 1200px contained, with generous vertical breathing room between sections. The hero is a full-bleed cream canvas with a large centered headline (Recoleta 700 at 84-151px) with mint highlight swashes, a short paragraph below, and a two-button group (mint filled + dark outline) — the mascot sits in the lower-left corner of the hero. Below the hero, a full-width rounded-rectangle illustration panel (the circuit board) spans nearly the full content width. Further down, social proof appears as a horizontally-scrolling row of white logo cards in a single line, followed by additional text+visual sections. Navigation is a minimal top bar with the HATCH wordmark left, center nav links, and mint pill CTA right — no sticky behavior, no mega-menu. Section gaps are 96px+, card padding 28-40px, element gaps 24px. The overall rhythm is: large type, generous space, single illustration beat, repeat.

## Similar Brands

- **Figma Config / creative tool brand sites** — Same playful pastel-on-cream palette, hand-drawn illustration accents, and friendly mascot approach to a professional service
- **Notion** — Same zine-like editorial layout: cream canvas, bold serif headlines, generous spacing, and flat cards with hairline borders rather than heavy shadows
- **Mailchimp** — Same brand-mascot-plus-pastel-accent visual identity aimed at creative audiences, with hand-illustrated warmth replacing product-UI precision
