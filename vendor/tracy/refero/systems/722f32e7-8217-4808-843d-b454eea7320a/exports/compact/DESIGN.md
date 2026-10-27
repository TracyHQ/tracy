# Dashlane — Style Reference
> Midnight vault with mint keyholes.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Dashlane is a dark, warm-toned security interface — a near-black cocoa canvas (#200f0a) with subtle plum depth, where mint (#a2f6f5) pierces the surface like a keyhole glow and violet (#858df9) plays the second voice. The system is built on one custom sans (Saans) that uses weight 300 for headlines and 500 for UI — a deliberate two-weight conversation that lets massive statistics whisper rather than shout. Surfaces sit on a warm scale from cocoa to deep aubergine, separated by hairline borders in muted beige (#e3ccc0) rather than cold grays. Components are pill-shaped for actions and 8px-rounded for cards; buttons feel like physical keys (9999px), never rectangles. The overall mood is 'midnight vault with a single lit doorway' — confident, restrained, with color appearing as small functional punctuation against an otherwise matte dark workspace.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cocoa Black | `#200f0a` | Page background, primary text on light surfaces — the warm near-black base; it has subtle brown warmth that distinguishes it from pure black and pairs with mint without vibrating |
| Cream Mist | `#fcfaf9` | Primary body and heading text on dark surfaces, icon fills — soft off-white that reads as paper against cocoa |
| Warm Sand | `#e3ccc0` | Hairline borders on cards and nav, subtle dividers — beige linework that defines edges without harshness |
| Ash Gray | `#e5e7eb` | Secondary borders, image outlines, utility rules — neutral gray for the most abundant structural lines |
| Stone | `#a69f9d` | Muted helper text, link underlines in resting state — desaturated warm gray for non-prominent metadata |
| Deep Plum | `#2b2538` | Card surfaces, elevated panels — slightly cooler and lighter than the page, reading as a card lifted off cocoa |
| Aubergine | `#4d3f3b` | Accent surface for nested cards or highlighted zones — a warmer brown for the third elevation step |
| Mint Keyhole | `#a2f6f5` | Teal action color for filled buttons, selected navigation states, and focused conversion moments. |
| Iris | `#858df9` | Outlined action borders, secondary highlights, icon accents — vivid violet for the second action voice and decorative strokes |
| Periwinkle | `#6c74df` | Deeper violet for secondary borders and surface accents when iris needs to recede |
| Lavender Mist | `#b6bbfb` | Soft violet for inactive nav borders and gentle icon tints — the muted sibling of iris |

## Typography

### Saans — All interface and display type — a custom geometric sans where weight 300 carries all headlines and hero statistics while weight 500 is reserved for UI chrome (buttons, nav, labels, body). The whisper-weight headlines are the system's most distinctive move: 100px at weight 300 reads as architectural light, not aggressive marketing.
- **Substitute:** Inter, Söhne, or GT America — any clean geometric sans that ships with true weight 300 and 500
- **Weights:** 300, 500
- **Sizes:** 12, 14, 16, 18, 28, 36, 48, 56, 72, 100px
- **Line height:** 1.10 (display), 1.17 (headings), 1.20 (subheadings), 1.50 (body)
- **Letter spacing:** 0.01em at body sizes, 0.02em at small UI sizes
- **OpenType features:** `"ss01" on, "tnum" on`

### SaansMono — Monospace utility — tracking at 0.06em gives it an uppercase tag/label feel, used for overline metadata, tags, and monospaced code-adjacent labels
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 300
- **Sizes:** 16px
- **Line height:** 1.10
- **Letter spacing:** 0.06em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.24px |
| body-sm | — | — | 14px | 1.5 | 0.14px |
| body | — | — | 16px | 1.5 | 0.16px |
| subheading | — | — | 18px | 1.5 | 0.18px |
| heading-sm | — | — | 28px | 1.2 | 0.28px |
| heading | — | — | 36px | 1.17 | 0.36px |
| heading-lg | — | — | 48px | 1.17 | 0.48px |
| display | — | — | 72px | 1.1 | 0.72px |
| display-xl | — | — | 100px | 1.1 | 1px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 32-40px
- **Element gap:** 12-24px

### Border Radius

- **tags:** 9999px
- **cards:** 8px
- **images:** 8px
- **inputs:** 4px
- **buttons:** 9999px

## Components

### Mint Filled Button
**Role:** Primary action — 'Contact Sales', 'Book a meeting'

Pill shape (9999px radius), background #a2f6f5 (Mint Keyhole), text in #200f0a (Cocoa Black), Saans weight 500, 14-16px, padding 12px 24px. The high-contrast mint-on-cocoa click target reads as a physical key against the dark vault.

### Violet Outlined Button
**Role:** Secondary action — 'Request a demo'

Pill shape (9999px radius), transparent background, 1px border in #858df9 (Iris), text in #858df9, Saans weight 500, padding 12px 24px. The outlined violet is the system's second voice for paired CTAs.

### Ghost Text Button
**Role:** Tertiary action — nav links, 'See customer stories'

Pill or near-pill, no border, no fill, text in #fcfaf9 or #a2f6f5, Saans weight 500, padding 8px 16px. Used for low-emphasis actions inside paragraphs and cards.

### Stat Card
**Role:** Large display metric panel

8px radius, background #2b2538 (Deep Plum), 1px border in #e3ccc0 (Warm Sand) at low opacity or no border, padding 32-40px. Giant number in Saans weight 300 at 100px in #fcfaf9, unit suffix ('hrs', '%') at 1/3 size. Short caption below in 14-16px #fcfaf9 or #a2f6f5.

### Testimonial Card
**Role:** Customer quote panel

8px radius, background #2b2538, padding 32-40px, company logo top-left in #fcfaf9, quote in Saans 300 at 18-20px in #fcfaf9, author avatar (circular) + name in weight 500 + role in #a69f9d.

### Top Navigation Bar
**Role:** Sticky site header

Full-width, background #200f0a or transparent over cocoa, logo left, nav links centered or left in Saans 500 14-16px #fcfaf9, language switcher and login right. On scroll, may gain 1px bottom border in #e3ccc0 at low opacity.

### Logo Lockup
**Role:** Brand mark + wordmark

Dashlane D-icon (small geometric D in #fcfaf9) + 'DASHLANE' wordmark in Saans 500, uppercase, letter-spacing 0.02em, in #fcfaf9.

### Announcement Bar
**Role:** Top promo strip

Full-bleed, background #200f0a with possible thin border, text in #fcfaf9 14px Saans 500, close X right. Centered, max-height ~40px.

### Input Field
**Role:** Form inputs (login, contact)

4px radius, background #2b2538 or #200f0a, 1px border in #e3ccc0, text in #fcfaf9 Saans 500, placeholder in #a69f9d. Focus state: border shifts to #a2f6f5 (Mint).

### Trust Logo Strip
**Role:** Enterprise customer logos

Horizontal row of greyscale logos in #fcfaf9 or #e5e7eb at 60-70% opacity, aligned on a shared baseline, centered under a 'TRUSTED BY TOP ENTERPRISES' overline in SaansMono 300 0.06em tracking.

### Hero Headline
**Role:** Primary above-fold headline

Saans weight 300, 72-100px, line-height 1.10, letter-spacing ~1px. Color rule: first word in #a2f6f5 (Mint Keyhole), remaining words in #fcfaf9 — the mint word acts as the 'lit doorway' in the vault.

### Chat Widget Panel
**Role:** Floating bottom-right support widget

8px radius, background #fcfaf9 (light surface floating on dark page), padding 16-20px, text in #200f0a, CTA buttons filled in #200f0a with #fcfaf9 text. Contrasts the dark page by being a light island.

### Progress/Bar Indicator
**Role:** Thin underline bar inside stat cards

4px height, horizontal bar under the giant stat, fill in #a2f6f5 (Mint) at ~40% width, track in #e3ccc0 (Warm Sand) at low opacity. Acts as a visual rhythm anchor beneath the number.

## Do's and Don'ts

### Do
- Use Saans weight 300 for all headlines and statistics — never bump to 600/700 for emphasis; size and color do the heavy lifting
- Color the first word of hero headlines in #a2f6f5 (Mint) and leave the rest in #fcfaf9 — this is the system's signature punctuation
- Use 9999px radius for all buttons, tags, and pill controls; reserve 8px for cards and 4px for inputs and small UI
- Default to #200f0a (Cocoa Black) as the page background; lift to #2b2538 (Deep Plum) for cards and #4d3f3b (Aubergine) only for nested emphasis
- Place the primary action as a mint-filled pill and pair it with a violet-outlined pill for the secondary action
- Use #e3ccc0 (Warm Sand) at 0.3-0.5 opacity for card borders — never use #e5e7eb on dark cards, it reads as cold
- Set display sizes between 72-100px for hero statistics; smaller statistics should land at 48-56px, never below 36px

### Don't
- Don't use pure black (#000000) as a background — the warmth of #200f0a is the brand
- Don't use weight 600 or 700 in Saans; the font is designed as a two-weight conversation between 300 and 500
- Don't pair mint and violet on the same control — mint is the filled voice, violet is the outlined voice
- Don't apply drop shadows to cards — use the surface scale and beige hairlines instead
- Don't use #e5e7eb borders on dark surfaces; switch to #e3ccc0 for warmth consistency
- Don't break the pill rule with rectangular buttons; the only exception is 8px cards and 4px inputs
- Don't render body text below 14px; the 1.5 line-height at 16px is the floor for readability
- Don't use white (#ffffff) for text — always use #fcfaf9 to maintain the paper-on-cocoa warmth

## Elevation

- **Cards and stat panels:** `none — flat surfaces rely on the warm-toned surface scale and hairline beige borders for separation`
- **Chat widget and floating panels:** `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(227,204,192,0.1)`

## Surfaces

- **Cocoa Canvas** (`#200f0a`) — Page background — the base vault surface
- **Deep Plum Card** (`#2b2538`) — Card and panel surfaces, one step lifted from canvas
- **Aubergine Accent** (`#4d3f3b`) — Nested or highlighted card surfaces, two steps lifted

## Imagery

The site is primarily text-driven with minimal hero imagery — the hero is dominated by a large abstract radar/sweep graphic on the right side (a circular teal-and-cocoa ring system with a glowing arc) that reads as a security scan visualization. Customer logos in the trust strip are rendered as flat wordmarks in cream on cocoa, no container treatment. The chat widget avatar is a small circular headshot. Overall the visual language is text-first, icon-light, and illustration-sparse — the typography itself does the atmospheric work, with color and the occasional geometric diagram providing the only visual relief from the dark canvas.

## Layout

The page is a max-width 1200px centered single-column flow on a full-bleed cocoa background. The hero uses a split layout: left-aligned headline stack (3-line headline, supporting paragraph, paired CTA buttons) occupies ~45% of the viewport, while the right ~55% holds a large abstract radar/scan illustration anchored to a dark card. Below the hero, content flows in alternating sections: a statistics row with three equal-width stat cards in a 3-column grid (70% / 54% / 2 hrs), then a testimonial carousel with two-up card slides and dot pagination, then a logo trust strip that breaks the rhythm as a full-width horizontal band. Navigation is a sticky top bar with the logo left, centered nav links, and a language switcher plus paired CTAs right. Section gaps sit around 80-120px, card padding at 32-40px, and element gaps at 12-24px. A floating chat widget anchors the bottom-right corner persistently.

## Similar Brands

- **1Password** — Same dark cocoa-toned vault aesthetic with warm neutrals and confident display type — both treat the security dashboard as a calm dark workspace rather than a techy blue grid
- **Linear** — Same approach of whisper-weight geometric headlines (Saans ↔ Inter Display) and a single saturated accent against a near-black canvas; both let typography carry the mood
- **Vercel** — Same restrained dark canvas with one electric accent and pill-shaped controls; both minimize decoration and let scale + spacing do the design
- **Notion** — Same soft warm off-white text (#fcfaf9) on a near-black background and a similar preference for flat surfaces with hairline borders over drop shadows
- **Stripe** — Same instinct for custom geometric sans + large confident display type + a single vivid accent color used sparingly as functional punctuation
