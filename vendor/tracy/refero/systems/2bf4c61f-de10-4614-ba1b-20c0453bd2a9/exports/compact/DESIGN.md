# Notion — Style Reference
> warm paper notebook under afternoon sun

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Notion reads like a well-loved paper notebook under afternoon light: a warm off-white canvas (#f6f5f4) that feels tactile rather than clinical, generous sans typography that gives editorial weight to product copy, and color used as sparse punctuation — peachy pills highlight verbs, a single blue anchors the primary action, and a rotating cast of accent hues (coral, amber, sky, midnight) paints the feature card backgrounds like sticky notes. Cards sit on the canvas with 1px hairline borders and 12px corners — no shadows, no chrome — like ruled sections in a Moleskine. Motion is playful and springy, with 200ms ease transitions and bouncy character-mark animations that make the interface feel alive without ever being decorative.

## Colors

| Name | Value | Role |
|------|-------|------|
| Notion Blue | `#0075de` | Primary CTA fill, active nav accent, filled action buttons — the single chromatic commitment in a near-monochrome system, saturated enough to read as a switch |
| Paper Warmth | `#f6f5f4` | Page canvas, hero background, section backgrounds — warm off-white gives the system its tactile analog feel |
| Pure White | `#ffffff` | Card surfaces, elevated panels, logo-wall background, contrast text on dark cards |
| Ink Black | `#000000` | Primary text, nav links, headings — deployed at varying alpha (100%, 95%, 90%, 60%, 40%, 20%) to build hierarchy without adding new colors |
| Charcoal | `#111111` | Dark text variant for specific UI moments where pure black would feel too harsh |
| Stone | `#757575` | Secondary nav text, muted helper text, deactivated button labels — the 60% alpha of ink |
| Graphite | `#615d59` | Body text with warm cast — the brown-tinted gray that harmonizes with the warm canvas |
| Slate | `#696969` | Card body text, secondary content within cards — slightly lighter than Stone |
| Sky Tint | `#e6f3fe` | Ghost CTA background, soft blue wash for secondary actions, tinted hover states |
| Marigold | `#ffb110` | Hero pill highlights, Agent feature card background, warm accent for callouts — the first color the eye finds |
| Coral | `#f64932` | Decorative card backgrounds, hero pill alternates, warm-to-hot accent in the rotating cast |
| Saffron | `#e89d01` | Body-section accent panels, secondary warm yellow for background washes |
| Vermillion | `#e32d14` | Deep coral for saturated body-section backgrounds, signal-warm accent |
| Mocha | `#b18164` | Warm brown accent for body-section panels — the earthy member of the accent cast |
| Signal Blue | `#097fe8` | Decorative card backgrounds, hero decorative highlights, secondary blue for visual variety |
| Sky Wash | `#62aef0` | Lightest blue in the cast — decorative backgrounds, heading accent highlights, airy washes |
| Midnight Ink | `#02093a` | Violet wash for highlight backgrounds, decorative bands, and soft emphasis behind content. |

## Typography

### NotionInter — Primary sans-serif — geometric humanist with slight quirks, deployed at 400 for body, 500 for nav/UI, 600-700 for display headings. The type-scale uses aggressive negative letter-spacing at large sizes (-4.6px at 96px, -2px at 72px) that tightens the headline to feel confident and compact rather than airy.
- **Substitute:** Inter
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 14px, 16px, 20px, 22px, 24px, 40px, 42px, 48px, 54px, 72px, 96px
- **Line height:** 0.83, 1.00, 1.04, 1.14, 1.21, 1.27, 1.33, 1.40, 1.43, 1.50
- **Letter spacing:** -0.048em at 96px, -0.036em at 42px, -0.035em at 54px, -0.028em at 72px, -0.011em at 22px, +0.01em at 12px, normal at body sizes
- **OpenType features:** `"lnum", "locl" 0`

### Lyon Text — Editorial serif reserved for specific body-text moments and section intros — used sparingly (4 instances) to give voice a literary weight, like a pull-quote in a magazine layout. Functions as a system accent, not a parallel hierarchy.
- **Substitute:** Source Serif Pro
- **Weights:** 400
- **Sizes:** 18px, 32px
- **Line height:** 1.25, 1.56

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | 0.12px |
| body-sm | — | — | 14px | 1.43 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1 | — |
| heading-sm | — | — | 22px | 1.27 | -0.242px |
| heading | — | — | 40px | 1.5 | — |
| heading-lg | — | — | 48px | 1.5 | — |
| display-sm | — | — | 54px | 1.04 | -1.89px |
| display | — | — | 72px | 1.21 | -2.016px |
| display-lg | — | — | 96px | 1.04 | -4.608px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 12px
- **pills:** 9999px
- **small:** 4px
- **buttons:** 8px

## Components

### Primary CTA Button
**Role:** Filled blue action button for the main conversion goal

Background #0075de, text #ffffff at 14px NotionInter weight 500, border-radius 8px, padding 6px 15px. The only chromatic filled button in the system — every other action defers to ghost or text styles.

### Ghost CTA Button
**Role:** Secondary action with a subtle blue tint

Background #e6f3fe (sky tint), text #0075de at 14px weight 500, border-radius 8px, padding 6px 15px. Pairs beside the primary CTA as the lower-commitment alternative.

### Ghost Text Button
**Role:** Minimal action button with no fill or border

Background transparent, text #000000 at 95% alpha, border-radius 8px, padding 6px 15px. The default for tertiary actions in the hero and feature cards.

### Outlined Text Button
**Role:** Bordered button with no fill for mid-priority actions

Background transparent, text #000000 at 90% alpha, 1px border at same color, border-radius 4px, padding 5px 10px. Used for compact inline actions like view-all links.

### Muted Nav Link
**Role:** Low-emphasis navigation item

Background transparent, text #000000 at 54% alpha, border-radius 8px, padding 12px 16px. The default nav-item state — text darkens to full alpha on hover, never gets an underline.

### Pill Tag
**Role:** Category label or status indicator

Background colored fill (varies), text #000000 or #ffffff, border-radius 9999px, padding 4px 12px. Used for status labels like 'In progress', 'To do', 'Complete' in product mockups.

### White Feature Card
**Role:** Standard content card on warm canvas

Background #ffffff, border-radius 12px, padding 24px, 1px solid border at rgba(0,0,0,0.08), no shadow. The default card — sits on the warm canvas like a sticky note.

### Accent Feature Card
**Role:** Full-bleed colored card for feature blocks

Background one of the accent hues (#ffb110, #f64932, #62aef0, #e6f3fe, etc.), border-radius 12px, padding 24px, no border. Functions as a colored panel that paints the canvas — text inside uses #000000 or #ffffff depending on contrast.

### Dark Feature Card
**Role:** Inverted card for dark-on-light contrast moments

Background #02093a (midnight), text #ffffff, border-radius 12px, padding 24px. The system uses this sparingly as a 'dark mode island' on the light page — not as a full dark theme.

### Hero Highlight Pill
**Role:** Colored pill placed behind a verb in hero copy

Background accent color (peach #f6d5b8, yellow #ffb110, or coral #f64932), text #000000, border-radius 9999px, padding 8px 24px. The signature typographic device — wraps a single word in a sentence to draw the eye and give it weight.

### Avatar Character Mark
**Role:** Decorative illustrated character in a circle

40-48px circle with 2px colored border (blue, red, yellow), flat illustration inside, white background. Used in hero arrangements and scattered as decorative marks with squiggle/sparkle companions.

### Kanban Task Card
**Role:** Product UI task item in the embedded product mockup

Background #ffffff, border-radius 8px, padding 8px 12px, 1px border at rgba(0,0,0,0.08), small status text and emoji. Replicates the real Notion task card aesthetic inside the marketing screenshot.

### Section Header
**Role:** Large heading that opens a new content section

NotionInter weight 500-700, 48-54px, line-height 1.04-1.5, letter-spacing -1.89 to -2.016px. Color #000000. Followed by an optional Lyon Text subhead at 18px for editorial voice.

### Logo Wall Item
**Role:** Greyscale partner/client logo

SVG logo at native proportions, color desaturated to near-black (#000000 at 60% alpha), no individual borders or backgrounds. Centered grid layout with generous spacing — logos are treated as typography, not imagery.

## Do's and Don'ts

### Do
- Use #f6f5f4 as the page canvas and #ffffff for card surfaces — never invert this hierarchy by putting a warm card on a white page
- Reserve #0075de for the single primary action per screen; all secondary actions should use ghost (#e6f3fe bg) or text styles
- Apply negative letter-spacing to all display sizes: -4.6px at 96px, -2px at 72px, -1.9px at 54px — body text stays at normal tracking
- Use 1px solid borders at rgba(0,0,0,0.08) instead of shadows to separate cards from the canvas
- Use 12px border-radius for cards and 8px for buttons; reserve 9999px for pills and hero highlight pills only
- Paint feature-block backgrounds with accent hues (#ffb110, #f64932, #62aef0, #02093a) rather than adding borders or shadows to create visual variety
- Keep motion at 200ms with ease timing for hovers and transitions; reserve spring/bounce animations for character marks and hero elements

### Don't
- Do not use pure #ffffff as the page background — the warm #f6f5f4 canvas is the system's signature warmth
- Do not add shadows to content cards — the system uses hairline borders only, shadows appear only on the product UI mockup and nav bar
- Do not use multiple chromatic button colors in the same view — #0075de is the only filled button; color variety belongs in card backgrounds
- Do not use #000000 at 100% for all text — build hierarchy through alpha (100%, 95%, 60%, 40%) on the same color
- Do not use Lyon Text for UI labels or navigation — it is reserved for editorial body copy moments at 18px
- Do not apply border-radius larger than 12px to rectangular content — pills (9999px) and cards (12px) are the two shapes
- Do not use gradients — the system is strictly flat fills; visual depth comes from the warm-to-white surface contrast and accent card backgrounds

## Elevation

- **Nav (sticky):** `0px 0.7px 1.462px 0px rgb(0% 0% 0%/0.015), 0px 3px 9px 0px rgb(0% 0% 0%/0.03)`
- **Product UI Mockup:** `0px 4px 12px rgba(0, 0, 0, 0.1)`

## Surfaces

- **Page Canvas** (`#f6f5f4`) — Warm off-white base for the entire page — the analog-paper feel starts here
- **Card Surface** (`#ffffff`) — White cards on warm canvas — pure white is reserved for surfaces that need to read as 'on top of the page'
- **Accent Card Surface** (`#ffb110`) — Colored card backgrounds (yellow, coral, blue, midnight) — feature blocks paint the canvas with single-hue fills
- **Dark Card Surface** (`#02093a`) — Deep navy panels for dark-mode-style feature blocks — inverting the surface stack with white text on midnight

## Imagery

Illustration-first, photography-free. The visual language is built from flat illustrated character marks (round faces in 2px colored circles), abstract decorative elements (hand-drawn squiggles, sparkles, arrows, flower shapes), and product UI mockups. Character marks appear in the hero as a horizontal row of 7 avatars and scatter across the page as playful punctuation. Product screenshots are the only 'real' visuals — they show the actual Notion interface (kanban boards, document views, AI agent panels) with full chrome and real data. The product mockup in the hero is large, centered, and casts a single drop-shadow to separate it from the canvas. There are no lifestyle photos, no stock imagery, no abstract 3D renders.

## Layout

Centered, max-width contained at ~1440px. The hero is a centered stack: character-mark row → large two-line headline with an embedded colored pill → subhead → two-button CTA row → large product UI mockup. Below the hero, sections alternate between white-card grids and full-bleed colored accent panels. The logo wall is a centered single-row grid of greyscale partner logos. Feature blocks use a 2-column layout (text left, colored panel right) that alternates left-right between sections. The 'Ask your on-demand assistants' section uses a 2×2 card grid where the top card is full-width and the bottom row splits into two equal columns. Section gaps are generous (~80px) creating a calm vertical rhythm. Navigation is a fixed top bar at 64px height with centered nav items and right-aligned action buttons.

## Similar Brands

- **Linear** — Same monochrome-light approach with a single accent color, hairline-border cards, generous display typography with negative tracking, and zero shadows on content surfaces
- **Stripe** — Same editorial use of serif+sans pairing, large display headlines with tight letter-spacing, and color reserved for functional emphasis rather than decoration
- **Figma** — Same playful illustrated character marks as decorative punctuation, warm light canvas, and rotating accent hues for section variety
- **Craft Docs** — Same paper-warm aesthetic with off-white canvas, restrained color palette, and a focus on the document-as-surface metaphor
