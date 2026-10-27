# Eraser — Style Reference
> Neon blueprint on black velvet. A black canvas where luminous pastel words and sticker-shadowed cards float like a wireframe schematic projected onto darkroom paper.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Eraser is a technical-drawing canvas rendered as a neon blueprint on black velvet: near-black canvas (#181818), luminous pastel accents dropped onto individual headline words, and a hard 6px solid-offset shadow that gives every card a sticker-like physicality. The display face is a high-contrast condensed grotesque (National 2 Condensed at line-height 0.85) that lets 90px headlines feel architectural rather than decorative. Color is rationed — almost everything is bone-white on obsidian, with violet, sky, saffron, and rose appearing only as small functional punctuation on borders, heading words, and diagram containers. The signature interaction language treats UI surfaces like diagram nodes themselves: colored group containers, floating pill annotations, and a purple-bordered AI prompt panel that sits beside the canvas like a chat companion.

## Colors

| Name | Value | Role |
|------|-------|------|
| Iris Glow | `#9985ff` | Primary brand accent — headline words, diagram group borders, and the violet offset shadow that makes hero cards pop off the canvas |
| Pale Lavender | `#ddccff` | Softened brand accent — used where Iris Glow would be too saturated, particularly in headline strokes and lighter decorative borders |
| Violet Deep | `#363054` | Accent shadow tone — paired with the 6px solid-offset shadow recipe to make Iris Glow feel grounded on the dark canvas |
| Sky Pulse | `#94dbff` | Cool accent — second headline color and decorative border accent; the blue counterpart to the violet brand system |
| Saffron Whisper | `#d6ca6f` | Warm accent — third headline color, brings the gold/amber note into the multi-word display treatment |
| Rose Quartz | `#ffa3c2` | Warm accent — fourth headline color, the pink note that completes the four-color headline palette |
| Bone | `#e3e3e3` | Primary text and dominant border color across the interface — the single most-used color in the system |
| Obsidian | `#181818` | Page canvas and card fill background — the dark base everything sits on |
| Charcoal | `#4b4b4b` | Muted borders and dividers, secondary structural lines on dark surfaces |
| Ink Black | `#080808` | Deepest shadow tone — used in the 6px 6px 0 hard-offset shadow under standard cards |
| Pure White | `#ffffff` | Primary action fill — the only CTA button background; also used for high-emphasis text on dark surfaces |
| Pearl | `#f6f6f6` | Secondary text color and heading borders where Bone is too cool |
| Slate | `#2a2b2b` | Subtle borders — the barely-there divider for low-emphasis separation |
| Graphite | `#878787` | Muted text and link borders — body copy de-emphasized, nav text in resting state |
| Ash | `#666666` | Subtle link borders for de-emphasized text links |

## Typography

### National 2 Condensed — Display and hero headlines only — used for the brand's biggest typographic statement. The 0.85 line-height is unusually tight and makes multi-line headlines stack like a poster, not flow like prose. Combined with -0.007em tracking and condensed proportions, this face carries authority without weight.
- **Substitute:** Bebas Neue or Oswald (700)
- **Weights:** 700
- **Sizes:** 48px, 72px, 90px
- **Line height:** 0.85
- **Letter spacing:** -0.007em at 90px, -0.005em at 72px, -0.007em at 48px

### Inter — All UI text — body, nav, buttons, labels, subheadings, and card titles. The 400 weight is the workhorse; 600 is reserved for emphasis. The slight -0.019em tracking tightens UI text on the dark canvas, giving it the same technical-drawing precision as the display face. No 300 weight — restraint here means condensed, not thin.
- **Substitute:** Inter (Google Fonts) — already open-source
- **Weights:** 400, 500, 600, 700
- **Sizes:** 8px, 11px, 12px, 13px, 14px, 16px, 18px, 20px, 26px
- **Line height:** 1.15, 1.23, 1.25, 1.35, 1.50
- **Letter spacing:** -0.019em applied across all sizes

### JetBrains Mono — Code and technical tokens — used for diagram node labels, code snippets, and any monospaced context. The 1.00 line-height variant is for inline monospaced glyphs.
- **Substitute:** JetBrains Mono (open-source)
- **Weights:** 400, 600
- **Sizes:** 14px
- **Line height:** 1.00, 1.23
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| tiny | — | — | 11px | 1.23 | -0.209px |
| caption | — | — | 14px | 1.5 | -0.266px |
| body-sm | — | — | 16px | 1.5 | -0.304px |
| body | — | — | 18px | 1.35 | -0.342px |
| heading-sm | — | — | 20px | 1.25 | -0.38px |
| subheading | — | — | 26px | 1.15 | -0.494px |
| heading | — | — | 48px | 0.85 | -0.336px |
| heading-lg | — | — | 72px | 0.85 | -0.36px |
| display | — | — | 90px | 0.85 | -0.63px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 72px
- **Card padding:** 16px
- **Element gap:** 24px

### Border Radius

- **cards:** 16px
- **pills:** 9999px
- **medium:** 8px
- **buttons:** 4px

## Components

### Primary CTA Button
**Role:** Single high-emphasis conversion action — the only filled button in the system

Pure white (#ffffff) fill, #181818 text, 4px border-radius, 14px vertical / 6px horizontal padding in its compact form, Inter 500 at 14px with -0.019em tracking. Includes a right-arrow glyph (→) as part of the label. No hover state color change — the white fill is the signal.

### Ghost / Outlined Button
**Role:** Secondary action that should not compete with the primary CTA

Transparent fill, 1px #e3e3e3 border, #e3e3e3 text, 4px radius, 14px vertical padding. Used for nav actions and low-emphasis controls. Same Inter 500 / 14px spec as the primary button.

### Display Headline
**Role:** Hero and section-anchor headlines where typographic personality is the message

National 2 Condensed 700 at 48–90px, line-height 0.85, tracking -0.005em to -0.007em. Each word in a multi-word headline receives a different color from the accent palette (Iris Glow, Sky Pulse, Saffron Whisper, Rose Quartz) — a signature multi-color word treatment. Bone (#e3e3e3) for non-accented words.

### Floating Pill Annotation
**Role:** Decorative label that floats in hero space, annotating product features

Fully rounded (9999px radius) pill, 1px #e3e3e3 border on transparent fill, 12px Inter 500 text, ~12px 16px padding. Appears as a wireframe-like annotation in the hero, positioned absolutely around the headline.

### Card — Standard (Hard Shadow)
**Role:** Default content card on the dark canvas

#181818 fill, 16px border-radius, 1px #e3e3e3 border, 16px padding, 6px 6px 0px 0px #080808 shadow. The border plus offset shadow together create a sticker-like edge that reads against the dark canvas.

### Card — Brand Highlight (Violet Shadow)
**Role:** Hero card or feature card that needs to feel more present than standard cards

Same as Standard Card but with 6px 6px 0px 0px #363054 (Violet Deep) shadow. The violet offset is the visual cue that the card is brand-adjacent.

### Diagram Group Container
**Role:** On the product canvas — a colored container that groups related diagram nodes (like a Processing or Post-Processing cluster)

Filled with a tinted dark surface (e.g. #32295f for violet, #4a2230 for rose, #203658 for blue), 1px matching lighter-tone border in the same hue family, 16px radius, 16px padding. Functions as a labeled sub-region on the canvas.

### AI Prompt Panel
**Role:** Side panel where users type natural-language commands to modify the diagram

1px #9985ff (Iris Glow) border on #181818 fill, 16px radius, 16px padding. Contains a title ('AI Prompts') in Inter 600, a multiline text input with #f6f6f6 placeholder, and chip-style suggestion buttons (e.g. 'Add a CloudFront CDN', 'Add IAM roles'). The violet border is what visually distinguishes this panel from all other UI.

### Diagram Node
**Role:** Individual service or component on the canvas (e.g. Lambda, S3, CloudFront)

Small card, 8px radius, 1px subtle border, colored service icon (AWS-style or Eraser-native icon set in vivid flat colors: orange Lambda, green S3, purple CloudFront, pink SNS), 12px Inter 500 label in #e3e3e3. Compact, minimal — the icon is the primary visual.

### Top Navigation Bar
**Role:** Primary site navigation

Transparent fill over the #181818 canvas, Eraser wordmark (Inter 700) on the left, inline nav links in Inter 500 / 14px #e3e3e3 with 12px gap, CTA pair on the right (Ghost outlined 'Book Demo' + White filled 'Try Eraser →'). No drop-shadow or border — sits directly on the canvas.

### Promo / Announcement Bar
**Role:** Slim bar above the main nav for time-sensitive announcements

Sits above the nav, Inter 500 13px text in #e3e3e3 on the #181818 canvas, with a text link and a compact 'Book Demo' outlined button inline. ~48px tall.

### Code Block
**Role:** Inline code or monospaced tokens

JetBrains Mono 400 at 14px, #e3e3e3 on #181818, no background fill by default (or subtle #2a2b2b pill for inline code). Line-height 1.23 for multi-line.

### Trust Logo Strip
**Role:** Social proof band of customer wordmarks

Centered, 2-row grid of monochrome customer logos in #878787 on the #181818 canvas, 48px gap between logos, framed by a thin #e3e3e3 border with corner brackets [ ] to give it a 'spec sheet' feel. Heading above in Inter 500 16px #e3e3e3.

## Do's and Don'ts

### Do
- Set display headlines to National 2 Condensed 700 at line-height 0.85 with tracking between -0.005em and -0.007em
- Apply the 6px 6px 0px 0px hard-offset shadow to all cards — never use blurred drop-shadows
- Use Bone (#e3e3e3) for primary text and dominant borders on the Obsidian (#181818) canvas
- Color individual words in display headlines with the four-color accent palette: Iris Glow #9985ff, Sky Pulse #94dbff, Saffron Whisper #d6ca6f, Rose Quartz #ffa3c2
- Use 4px radius for buttons, 8px for medium elements (tags, small cards), 16px for cards, 9999px for pill annotations
- Pair white-filled CTAs with #181818 text and always include a trailing arrow glyph (→)
- Use Iris Glow (#9985ff) borders specifically for AI-related panels and prompts to distinguish them from standard UI

### Don't
- Never use soft blurred drop-shadows — the system uses only hard 6px solid-offset shadows
- Never set display line-height above 0.9 — the tight stacking is what makes the type feel architectural
- Don't use the pastel accent colors as full backgrounds for body text — reserve them for borders, headline words, and decorative surfaces
- Don't use #363054 (Violet Deep) as text or fill — it's a shadow color only
- Don't apply fully rounded (9999px) radii to cards or buttons — pills are for floating annotations only
- Don't use a lighter fill to distinguish a card from the canvas — the border + offset shadow is the only elevation system
- Don't introduce new accent hues — the four-color pastel palette is the complete accent set

## Elevation

- **Standard Card:** `6px 6px 0px 0px rgba(8, 8, 8, 1)`
- **Hero / Brand Card:** `6px 6px 0px 0px rgba(54, 48, 84, 1)`

## Surfaces

- **Canvas** (`#181818`) — Page background, product canvas base — everything sits on this
- **Card** (`#181818`) — Default card fill sits flush with canvas; the hard-offset shadow is what defines the card edge, not a lighter fill
- **Elevated Group Container** (`#32295f`) — Diagram group node fill (violet) — colored containers that group related nodes on the canvas
- **Variant Group Container** (`#4a2230`) — Diagram group node fill (rose) — second color variant for distinguishing groups on the canvas

## Imagery

The visual language is product-screenshot-first: the hero is dominated by a large UI screenshot showing the Eraser canvas with a live diagram (AWS-style architecture with Lambda, S3, CloudFront, SNS nodes in colored service icons), color-coded group containers, and the violet-bordered AI prompt panel on the right. The screenshot itself is the hero — no stock photography, no illustration, no abstract graphics. Supporting visuals are tight product crops and monochrome customer wordmarks (Microsoft, Amazon, Visa, KPMG, etc.) rendered in #878787. Icon style inside the product is flat and vivid — each AWS service gets its canonical brand color (orange Lambda, green S3, purple CloudFront, pink SNS), making the diagram readable at a glance. Outside the product screenshot, the page is text-only with no decorative imagery.

## Layout

Full-bleed dark canvas (no max-width container around the page itself) with a max-width ~1200px content column for the hero and sections. Hero is centered: announcement bar at top, then nav, then a centered multi-color display headline over a single CTA, with the product screenshot breaking below at near-full width. Floating pill annotations are absolutely positioned around the hero headline — not in the flow. Below the hero, sections are centered stacks with 72px vertical gaps. The trust logo band uses a bordered frame with corner brackets for a 'spec sheet' framing. Grid usage: 2-column text-and-visual sections for features, single-column centered stacks for hero and announcements, 1-row or 2-row grids for logo strips. No sidebar; nav is a single top bar.

## Similar Brands

- **Linear** — Same dark-canvas + condensed display + tight-tracking approach, with a single white-filled primary button and heavy reliance on neutral grays for borders
- **Vercel** — Same black-canvas aesthetic with condensed sans-serif display type and near-zero soft shadowing — borders and contrast do the structural work
- **Excalidraw** — Same hand-drawn / technical-diagram visual language with dark canvas and hand-feel UI; Eraser is essentially the AI-native evolution of this aesthetic
- **tldraw** — Same infinite-canvas diagramming product category with dark UI, floating annotation labels, and a minimal accent palette
