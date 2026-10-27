# Savee — Style Reference
> Black canvas for visual curators

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Savee operates in near-total darkness: an almost pure black canvas (#050505) where the only chromatic element is a single electric indigo (#1500ff) that punctuates the interface like a neon gallery light. Typography does all the heavy lifting — a single custom sans-serif used at every level, from 96px display headlines with 0.96 line-height and -0.04em tracking down to 13px captions, creating a confident editorial rhythm that feels more like a museum wall than a SaaS dashboard. Surfaces are barely distinguishable: the page canvas, elevated cards (#151515), and deeper overlays (#1e1e1e) form a near-invisible hierarchy that lets imagery and type carry the experience. The lone violet accent on the primary CTA is the only visual noise the system permits — everything else is white type on black, pill-shaped controls, and generous 64px section breathing room.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Indigo | `#1500ff` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Obsidian | `#050505` | Page canvas, deepest background — the void that all content sits on |
| Charcoal | `#151515` | Elevated surface, product preview frames, secondary panels |
| Graphite | `#1e1e1e` | Deeper overlay surface, hover states on dark cards, input fields |
| Paper | `#fdfdfd` | Primary text, inverted surface, button text, high-contrast foreground |
| Silver | `#e5e5e5` | Hairline borders, dividers, subtle structural edges |
| Pearl | `#d4d4d4` | Secondary text, subdued headings, placeholder body copy |
| Slate | `#2f2f2f` | Footer borders, low-contrast dividers between dark zones |
| Ash | `#a3a3a3` | Muted helper text, inactive icons, de-emphasized metadata |
| Stone | `#737373` | Tertiary text, timestamps, supplementary labels |

## Typography

### Savee Font — The sole typeface — a custom geometric sans used at every scale. Weight 400 carries the editorial body and nav; weight 500 appears on buttons and emphasized labels. The 96px display at 0.96 line-height with -0.04em tracking is the system's signature: it compresses into a dense confident block rather than stretching vertically, making the headline feel sculptural.
- **Substitute:** Inter, DM Sans, or Satoshi (geometric sans-serifs with similar x-height proportions and tight default tracking)
- **Weights:** 400, 500
- **Sizes:** 13, 14, 16, 18, 21, 24, 30, 36, 60, 96
- **Line height:** 0.96, 1.00, 1.11, 1.13, 1.23, 1.25, 1.29, 1.33, 1.38, 1.50
- **Letter spacing:** -0.04em at 96px, -0.02em at 60px, -0.01em at 36-30px, normal at 24-18px, +0.01em at 16px, +0.015em at 14-13px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.5 | 0.195px |
| body | — | — | 16px | 1.5 | 0.16px |
| body-lg | — | — | 18px | 1.38 | 0px |
| subheading | — | — | 21px | 1.33 | 0px |
| heading-sm | — | — | 24px | 1.29 | -0.24px |
| heading | — | — | 30px | 1.25 | -0.3px |
| heading-lg | — | — | 36px | 1.13 | -0.36px |
| display | — | — | 60px | 1 | -1.2px |
| display-lg | — | — | 96px | 0.96 | -3.84px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 9999px
- **cards:** 14px
- **pills:** 9999px
- **inputs:** 9999px
- **buttons:** 9999px

## Components

### Primary Pill Button
**Role:** The sole filled action in the system

Electric Indigo (#1500ff) background, Paper (#fdfdfd) text at 14-16px weight 500, fully rounded 9999px radius, 12px 24px padding. This is the only place the brand color lives — every other interactive element defers to it. Appears once per viewport maximum to preserve its impact.

### Ghost Pill Button
**Role:** Secondary action that doesn't compete with the primary

Transparent background, 1px Paper (#fdfdfd) border at ~30% opacity or full opacity, Paper text at 14px weight 500, 9999px radius, 10px 20px padding. Used for 'Sign up' and 'Join over 1M users' — the outlined variant lets the primary indigo button own the hierarchy.

### Navigation Bar
**Role:** Minimal top-level site navigation

Transparent background floating on the Obsidian canvas. Logo at left in Paper white, text-only nav links (Features, Marketplace, What's new, Reviews) centered in Pearl (#d4d4d4) at 14px, auth actions (Log in, Sign up) at right. No background fill, no shadow, no border — the nav exists purely as type on the void.

### Display Headline
**Role:** Hero-level typography that defines the page

96px Savee Font weight 500, Paper (#fdfdfd), line-height 0.96, letter-spacing -0.04em. The extreme tightness and massive scale make it read as a single sculptural block. Centered horizontally with generous top/bottom breathing room (64-80px). The hero is centered single-column — no split layout, no side imagery.

### Editorial Body Block
**Role:** Long-form persuasive text at unusual scale

36px Savee Font weight 400, Paper (#fdfdfd), line-height 1.13, letter-spacing -0.01em. This is body copy at headline scale — 36px is massive for prose, creating a magazine-like reading experience. Left-aligned, max-width ~800px, sits below the hero with 48-64px separation.

### Partner Logo Strip
**Role:** Social proof band

Single horizontal row of grayscale brand logos (Apple, Google, Nike, Adobe, Pentagram, Airbnb, MWS) in Ash (#a3a3a3) or Pearl (#d4d4d4), evenly distributed across the full content width. Preceded by a small caption in Stone (#737373) at 13px. No logos colored, no hover effects — the strip is quiet authority.

### Product Preview Frame
**Role:** Large product screenshot or video container below the hero

Charcoal (#151515) background surface filling most of the viewport width, 14px border-radius, no border, no shadow. The subtle lift from canvas (#050505) to surface (#151515) is the only elevation cue — no drop shadows are used anywhere in the system.

### Text Link
**Role:** Inline navigation within body copy

Inherits body color (Paper or Pearl) with underline on hover only. No chromatic links — even interactive text stays in the neutral palette, reserving Electric Indigo exclusively for the primary CTA.

### Subhead Caption
**Role:** Descriptive subtext under headlines

16-18px Savee Font weight 400, Pearl (#d4d4d4), centered, line-height 1.50. Sits 16-24px below the display headline. The muted color creates a clear visual step-down from the headline without using a different size or weight.

### Full-Width Section Spacer
**Role:** Vertical rhythm between page sections

64-80px of pure Obsidian canvas with no visual element. Sections breathe into the void — no dividers, no background color shifts, no gradient transitions. The darkness itself is the separator.

### Footer Divider
**Role:** Low-contrast structural edge

1px horizontal line in Slate (#2f2f2f) or Silver (#e5e5e5) at ~10% opacity, spanning the content width. The only structural border in the entire system — used to separate the footer from the page body.

## Do's and Don'ts

### Do
- Use #1500ff Electric Indigo exclusively for the single primary CTA on any given screen — never for secondary actions, links, icons, or decorative elements
- Set display headlines at 96px with line-height 0.96 and letter-spacing -0.04em so the type compresses into a confident sculptural block rather than stretching
- Apply 9999px border-radius to every button, tag, and pill — the pill shape is the system's only control geometry
- Use 14px radius for card and product preview surfaces, and nothing else — keep the shape vocabulary to exactly two radii
- Let the Obsidian canvas (#050505) be the separator between sections — add 64-80px of empty space rather than lines, color shifts, or gradient transitions
- Set body prose at 36px when it needs to carry editorial weight; drop to 18px for functional descriptions. Never use 14-16px for primary page copy
- Keep all text in the neutral palette (#fdfdfd, #d4d4d4, #a3a3a3) — the only chromatic color is the CTA indigo

### Don't
- Never use #1500ff for anything other than the primary CTA fill — not for links, not for icons, not for hover states, not for badges
- Never add drop shadows or elevation glows to cards — the system uses surface color shifts (#050505 → #151515 → #1e1e1e) for hierarchy, not shadows
- Never set body text below 16px for primary content — captions and metadata can go to 13-14px, but main copy stays large
- Never introduce additional accent colors, even in illustrations or partner logos — the partner strip stays grayscale to preserve the indigo's dominance
- Never use border-radius values between 0px and 9999px for buttons — the system is binary: fully rounded pills or 14px card corners, nothing in between
- Never apply gradients to backgrounds, buttons, or text — the system is flat monochrome with one solid color exception
- Never use line-height above 1.50 for any text size — the tight line-heights (0.96-1.38) are the system's editorial signature

## Elevation

The system deliberately avoids drop shadows entirely. Hierarchy is expressed through surface color steps (#050505 canvas → #151515 elevated panel → #1e1e1 deep overlay) and through type scale alone. The absence of shadows is a signature choice — it keeps the interface feeling like a flat gallery wall rather than a layered software product.

## Surfaces

- **Canvas** (`#050505`) — Full-page background, the void surface
- **Elevated Panel** (`#151515`) — Product preview frames, image containers, card surfaces
- **Deep Overlay** (`#1e1e1`) — Input fields, nested interactive elements, hover states

## Imagery

Imagery is product-first and user-curated. The hero shows a large product preview frame in Charcoal (#151515) suggesting a dark-mode app interface. Partner logos are rendered in flat grayscale — no color, no depth, no backgrounds. The overall visual density is text-dominant: the 96px headline and 36px body copy occupy far more visual space than any imagery. When user content appears (bookmarks, mood boards), it is presented as raw crops on the Obsidian canvas without decorative frames or treatments.

## Layout

The page is centered single-column with a max content width around 1200px. The hero opens with a centered display headline, subtext, and single CTA — no split layout, no side imagery. Below the hero, a large product preview frame (Charcoal rectangle) occupies the full content width. A partner logo strip follows as a single horizontal row. Then large left-aligned editorial body text at 36px. Navigation is a floating text-only bar with no background fill. Sections are separated by 64-80px of pure Obsidian canvas — no dividers, no color bands. The rhythm is: massive centered type → large dark product frame → quiet logo strip → oversized prose → void.

## Similar Brands

- **Are.na** — Same near-black canvas, oversized editorial typography, single-color or minimal palette, text-dominant hero with no decorative imagery
- **Linear** — Same dark-mode product UI with one vivid accent color (Linear uses #5e6ad2 indigo, Savee uses #1500ff), pill-shaped controls, tight line-heights, and surface color stepping instead of shadows
- **Pitch** — Same confident use of large-scale display type (90px+) with tight tracking on dark backgrounds, minimal color, and generous vertical breathing room between sections
- **VSCO** — Same dark gallery aesthetic for creative tools, pill-shaped CTAs, and the strategy of reserving color exclusively for the single most important action
- **Things 3 (Cultured Code)** — Same near-black background, pure white type, single blue accent for primary action, pill controls, and the philosophy that restraint in color creates confidence in the product
