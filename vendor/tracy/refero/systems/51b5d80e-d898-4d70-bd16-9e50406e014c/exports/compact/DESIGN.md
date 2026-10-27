# Cards Against Humanity — Style Reference
> Scattered playing cards on a velvet game table — the design language is the game itself, not a wrapper around it.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Cards Against Humanity uses a game-night table aesthetic: near-black canvas, white card surfaces scattered at chaotic angles, and a tight three-color accent system (signal red, royal violet, antique gold) applied as thick borders rather than fills. Typography is uniformly heavy — Helvetica Neue LT at weight 800 even for mid-size copy — treating the screen like a punchline card rather than a SaaS dashboard. Buttons are chunky pills with 2px inset borders that read as physical objects sitting on the felt, not flat UI controls. The card metaphor saturates everything: content blocks, decorative backgrounds, badges, even borders adopt card-like geometry. Density is spacious but the large display sizes (55-80px) keep the vertical rhythm from feeling airy — each line lands like a card being dealt.

## Colors

| Name | Value | Role |
|------|-------|------|
| Game Night Black | `#000000` | Page background, card shadows, button borders, heading text on light surfaces |
| Card White | `#ffffff` | Card surfaces, body text on dark, button borders, input fills |
| Signal Red | `#fe2f2f` | Primary accent border on cards and badges — the brand's loudest punctuation, used as outline not fill |
| Royal Violet | `#7333f1` | Primary accent border on cards and badges — deep saturated purple carrying the brand's irreverent energy |
| Antique Gold | `#d7b73b` | Primary accent border on cards and badges — warm yellow-gold that rounds out the three-color system |
| Lemon Card | `#fffe5b` | Card face fill for highlighted playing cards in the scattered background |
| Lavender Card | `#ede5ff` | Card face fill for pastel playing cards, soft purple surface |
| Cobalt Card | `#1b5bff` | Card face fill for blue playing cards, saturated blue accent surface |
| Sky Card | `#a0e9ff` | Card face fill for light blue playing cards |
| Bubblegum Card | `#ffa0f0` | Card face fill for pink playing cards |
| Mint Card | `#b4ff91` | Card face fill for green playing cards |
| Tangerine Card | `#ff9559` | Card face fill for orange playing cards |

## Typography

### Helvetica Neue LT — The site's sole typeface. Weight 800 dominates everything from body up through 80px display — this anti-hierarchy choice makes the brand feel like it's shouting a punchline rather than presenting information. Tight leading at display sizes (0.98–1.07) creates an impactful block, generous leading on body (2.0–2.86) lets the heavy weight breathe. No letter-spacing tricks; the geometry of Helvetica at 800 weight does all the work.
- **Substitute:** Helvetica, Arial, Inter (weight 800), Neue Haas Grotesk Display Pro
- **Weights:** 400, 800
- **Sizes:** 12, 14, 16, 20, 24, 28, 40, 55, 65, 80
- **Line height:** 0.98–2.86

### Helvetica Neue — Helvetica Neue — detected in extracted data but not described by AI
- **Weights:** 700
- **Sizes:** 21px
- **Line height:** 1.38

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 2 | — |
| body-sm | — | — | 14px | 2.1 | — |
| body | — | — | 16px | 2.38 | — |
| subheading | — | — | 20px | 1.29 | — |
| heading-sm | — | — | 24px | 1.25 | — |
| heading | — | — | 28px | 1.3 | — |
| heading-lg | — | — | 40px | 1.07 | — |
| display-sm | — | — | 55px | 1.05 | — |
| display | — | — | 65px | 1 | — |
| display-lg | — | — | 80px | 0.98 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 50px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **cards:** 13px
- **badges:** 38px
- **inputs:** 38px
- **buttons:** 38px

## Components

### Playing Card (Core Content Unit)
**Role:** The fundamental content container — white rectangle with black text, used for both product cards and content blocks

White (#ffffff) background, 13–20px border-radius, 2px black (#000000) inset border, 20px padding. Black text at weight 800. Functions as both literal product imagery and as the site's content card metaphor. When used as decorative background elements, cards are rotated at various angles and offset to create a scattered-table composition.

### Outlined Pill Button (Primary)
**Role:** Main action button on dark backgrounds

Transparent fill on #000000 surface. White (#ffffff) 2px border, 38–64px border-radius (pill shape). Text: Helvetica Neue LT weight 800, 14–16px, #ffffff. Padding: 12px vertical, 32px horizontal. The 2px inset shadow creates the border — no stroke property used. Sits as a physical object, not a flat UI element.

### Outlined Pill Button (On Light)
**Role:** Action button on white card surfaces

Transparent fill on #ffffff surface. Black (#000000) 2px inset border, 38–64px radius. Text: #000000, weight 800, 14–16px. Same padding and geometry as the dark variant — only the color polarity inverts.

### Bordered Accent Card
**Role:** Featured card with chromatic border for emphasis

White or transparent fill with 2px border in one of the three brand accent colors (Signal Red #fe2f2f, Royal Violet #7333f1, or Antique Gold #d7b73b). 13–20px radius. Used to draw the eye to specific cards in the scattered background or to highlight featured content.

### Pastel Card
**Role:** Colored playing card surface used in the scattered background composition

Filled card with one of the seven accent surface colors (Lemon, Lavender, Cobalt, Sky, Bubblegum, Mint, Tangerine). 13–20px radius, black text at weight 800. Functions purely as decorative atmosphere in the card-scatter background pattern.

### Cookie/Modal Dialog
**Role:** Overlay consent interface

Centered on the page with a darkened scrim behind. Black (#000000) background, white text, 13–20px radius. Contains a bold heading ("Cookie Settings"), descriptive body copy, checkbox controls, and a row of outlined pill buttons (Accept All / Reject All / Confirm My Choices). The dialog itself follows the card aesthetic — it looks like a card dealt face-up on the table.

### Top Navigation Bar
**Role:** Site header with brand and nav links

Transparent or dark (#000000) background, white text. Brand name "Cards Against Humanity" at left in weight 800, ~24px. Nav items (Shop, About) at right with small dropdown carets. Minimal — no background fill, no border-bottom. Sits cleanly on the dark canvas.

### Section Display Heading
**Role:** Hero-level typography for section openers like "Buy the game."

Helvetica Neue LT weight 800, 55–80px, line-height 0.98–1.05. Color inverts by section: white on dark sections, black on light sections. Extremely tight leading at this scale — words stack into an impactful block. No letter-spacing manipulation.

### Checkbox Control
**Role:** Form input within the cookie settings dialog

Small square checkbox (~16–18px), 2px white border on the dark dialog surface. Unchecked state is transparent fill; checked state shows white fill with black checkmark. Sits inline with label text at 14px weight 400.

### Badge / Tag
**Role:** Small accent labels, potentially for product variants or tags

One of the three brand accent colors as 2px border (Signal Red, Royal Violet, Antique Gold), transparent or matching-tinted fill. 38px border-radius (pill). Text in matching color, weight 800, 12–14px. Padding: ~10–20px horizontal.

## Do's and Don'ts

### Do
- Use weight 800 for all headings and display text — the heavy Helvetica is the brand's voice
- Apply the 2px inset shadow as border treatment on all interactive elements instead of stroke or drop-shadow
- Use pill shapes (38–64px radius) for all buttons and badges
- Compose backgrounds with scattered white cards at varied rotations to reinforce the game-table atmosphere
- Restrict chromatic color to the three brand accents (Signal Red, Royal Violet, Antique Gold) used as borders only, not fills
- Set display text line-height to 0.98–1.07 at 55px+ sizes for tight, impactful stacking
- Invert color polarity (black on white / white on black) at section boundaries rather than introducing new colors

### Don't
- Don't use weight 400 for anything above 16px — the site's voice is uniformly heavy
- Don't apply drop shadows for elevation — the 2px inset border system is the only depth treatment
- Don't fill large areas with chromatic color — accent colors are outlines, not backgrounds
- Don't use border-radius below 13px on cards or below 32px on buttons — the geometry must read as physical cards
- Don't add gradient fills — the palette is strictly flat, the only complexity comes from scattered card composition
- Don't use letter-spacing tricks — the raw Helvetica geometry at weight 800 is the entire typographic system
- Don't introduce blues, greens, or pinks as UI chrome — those colors exist only as card face fills in decorative scatter

## Elevation

- **Outlined Pill Button:** `rgb(0, 0, 0) 0px 0px 0px 2px inset`
- **Outlined Pill Button (on light surface):** `rgb(255, 255, 255) 0px 0px 0px 2px inset`

## Surfaces

- **Table Felt** (`#000000`) — Primary page background, the dark surface cards are dealt onto
- **Card Face** (`#ffffff`) — Playing card surfaces and content blocks that read as physical cards
- **Pastel Card** (`#ede5ff`) — Soft accent card surfaces for featured or decorative playing cards

## Imagery

The site is dominated by playing card imagery — white rectangular cards with black sans-serif text, some bordered in the three brand accent colors (red, violet, gold), others filled in pastel card colors (lemon, lavender, mint, sky, etc.). Cards are arranged in scattered, overlapping compositions at various rotation angles against the black canvas, creating a sense of a game mid-play. Card content includes both product cards (the actual game) and quote/headline cards that function as typographic display elements. The card IS the imagery — there are no photographs, no illustrations, no abstract graphics. Everything visual is either a card, a card border, or negative space between cards. Iconography is minimal or absent from the visible chrome.

## Layout

Full-bleed sections that alternate between black (#000000) and white (#ffffff) backgrounds, creating stark contrast boundaries. Hero section opens on black with massive display text (55–80px) and scattered card background elements. Content sections switch to white backgrounds with black text for readability, then return to black for CTA sections like "Buy the game." Content is max-width contained (~1200px) and centered within each section. Navigation is a minimal top bar with brand left, links right. The scattered card pattern fills negative space in hero and transition areas, creating visual texture without competing with foreground copy. Section gaps are generous (~50px) but the large display type sizes keep vertical density high.

## Similar Brands

- **Walmart's 'Black Friday Deals' landing pages** — Same scattered card/tile composition at varied angles on near-black canvas, same heavy display sans-serif, same stark black-to-white section inversions
- **Exploding Kittens** — Same product-as-decorative-imagery approach with card-shaped elements scattered across a dark background, same irreverent tone reflected in bold typographic voice
- **What Do You Meme?** — Same party-game brand energy expressed through scattered card-like content blocks, same high-contrast black/white palette with accent color pops
- **UNO brand site** — Same card-product-first visual language where the game's visual identity (colorful card faces, scattered arrangement) IS the website's design system
- **NYC brand sites (e.g. BBC's brutalist moments)** — Same anti-soft aesthetic: heavy Helvetica-weight typography, no drop shadows, thick outlined buttons, stark section polarity inversions
