# A-WARE — Style Reference
> Apothecary editorial on warm parchment. A alpine athlete's apothecary spread: cream paper, black ink, one bronze seal, and dark glass canisters floating in generous whitespace.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

A-WARE speaks in the quiet language of an editorial apothecary: vast off-white parchment surfaces, black ink typography, and a single warm bronze accent that only appears as functional punctuation. The interface is almost entirely achromatic — cream canvas, near-black text, hairline rules — letting the product photography (dark matte canisters against bright void) carry the visual weight. A condensed display face whispers authority rather than shouting it; body text uses a clean grotesk with generous tracking on labels (0.10em uppercase) to evoke pharmaceutical precision. Components are spare and geometric: ghost pill buttons, thin black dividers, product cards that float as if pinned to the page, and almost no elevation. Every screen should feel like a page torn from a premium sports-science magazine.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian Ink | `#000000` | Primary text, hairline borders, icon strokes, button outlines — the near-total absence of color in the UI makes pure black the structural backbone |
| Paper White | `#ffffff` | Primary canvas, card surfaces, button text on dark fills |
| Parchment | `#f7f5ee` | Warm off-white surface layer above the page — hero overlays, section backgrounds, and elevated product zones |
| Linen | `#ece9df` | Subtle surface step for footers and the deepest background band — barely darker than Parchment, used to create quiet zone separation |
| Graphite | `#403e3c` | Body text secondary, form field borders — a soft black that softens dense body copy |
| Stone | `#888783` | Medium-contrast borders, control outlines, and structural separators. |
| Mist | `#b9b8b3` | Disabled borders and ultra-subtle dividers |
| Bronze Seal | `#a77a41` | Sole chromatic accent — product award seals, premium badges, decorative icon strokes. Warm against matte black, evokes a pharmacist's stamp on a label |
| Alpine Forest | `#205f4b` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content |

## Typography

### plantin — Display and hero headlines. The condensed proportions with extreme negative tracking (-0.43em at display sizes) create a fashion-editorial compression — a custom-feeling face that is the brand's signature. Weight 300 dominates to keep display type quiet and sophisticated rather than loud
- **Substitute:** Playfair Display, Cormorant Garamond, or Bodoni Moda at tight tracking
- **Weights:** 300, 400
- **Sizes:** 24px, 38px
- **Line height:** 1.05–1.33
- **Letter spacing:** -0.43em at display sizes (extreme tightening), -0.02em at body display sizes

### practice — The workhorse sans — body copy (18px/400), sub-headlines (23–25px/600), section titles (36–38px/600), and the massive 88px hero lockup. All-caps labels use 0.10em tracking to read as pharmaceutical or sports-science signage
- **Substitute:** Inter, Söhne, or Neue Haas Grotesk
- **Weights:** 400, 600
- **Sizes:** 14px, 16px, 18px, 23px, 25px, 36px, 38px, 88px
- **Line height:** 1.00–1.45
- **Letter spacing:** -0.02em (body), 0.02em (small caps), 0.04em (buttons), 0.10em (uppercase labels)

### lab-mono — Micro-labels, tag prefixes (NEU, VEGAN-HYBRID), ingredient metadata, footer fine print. The monospaced face reads as laboratory notepad, reinforcing the scientific-formulation angle
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Space Mono
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.33
- **Letter spacing:** -0.0200em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | 0px |
| body-sm | — | — | 14px | 1.4 | 0.4px |
| body | — | — | 16px | 1.45 | -0.32px |
| subheading | — | — | 23px | 1.2 | -0.46px |
| heading-sm | — | — | 25px | 1.19 | -0.5px |
| heading | — | — | 38px | 1.05 | -16.34px |
| display | — | — | 88px | 1 | -37.84px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1400px
- **Section gap:** 96px
- **Card padding:** 32px
- **Element gap:** 24px

### Border Radius

- **cards:** 12px
- **badges:** 6px
- **images:** 6px
- **inputs:** 6px
- **buttons:** 32px

## Components

### Ghost Pill Button
**Role:** Primary action (CTA, navigation to shop, learn more)

32px border-radius, 12px vertical / 24px horizontal padding, 1px Obsidian Ink border, transparent fill, practice 600 at 16px with 0.04em tracking uppercase, Obsidian Ink text. Arrow icon appended. The pill geometry with thin black outline is the brand's signature interactive element.

### Outlined Image Card (Product Category)
**Role:** Hero product showcase — Protein, Hydration lines

Two-column split with 50/50 division, no border or shadow on the container itself. Each side features a centered product image (dark canister) floating on Parchment surface, oversized plantin wordmark (PROTEINE, HYDRATION) behind/around the product, bulleted feature list in practice 400/16, ghost pill 'MEHR' button below.

### Announcement Bar
**Role:** Top-of-page shipping/notice strip

Alpine Forest (#205f4b) full-width bar, 8–12px vertical padding, practice 400/12–14px white text, centered. Delivers operational information without competing with the hero.

### Product Canister Card
**Role:** Individual product showcase in collection grids

Three-column row on Parchment background. Canister image rendered at ~200px wide with a soft diffuse shadow (rgba(0,0,0,0.08) 20px blur, 8px y-offset), angled diagonally tag (lab-mono 12px uppercase, 0.10em tracking), product name in practice 600/16px below.

### Editorial Header (IAG. Lockup)
**Role:** Centered section header with custom wordmark

Stacks the brand mark (A-WARE) above a bold fragment (IAG.) in plantin or practice 600/38px, followed by a centered serif-style intro sentence at 23–25px/1.4 max-width ~640px. All centered, max-width 720px container.

### Minimal Top Nav
**Role:** Primary site navigation

Transparent over hero, white background on scroll. Three left-aligned links (SHOP, ABOUT, BLOG), brand mark centered, three right-aligned icons (LOGIN, search, cart). Practice 600/14px uppercase with 0.04em tracking. No background fill when over hero photography.

### Diagonal Category Tag
**Role:** Annotation badge for new or special products

lab-mono 12px uppercase, 0.10em tracking, rotated -8 to -12 degrees, positioned at top-left of product image. No background — just rotated text. Signals 'NEU' or 'VEGAN-HYBRID' with editorial restraint.

### Hero Photography Block
**Role:** Full-bleed brand imagery backdrop

Full viewport width, 60–80vh height, dark-treated outdoor photography. Massive practice 88px white wordmark (A-WARE) overlaid at slight angle or left-aligned, practice 600/36–38px sub-headline at bottom-left, ghost pill button at bottom-right. No gradient overlay — the text sits directly on the photograph.

### Feature Bulleted List
**Role:** Product benefits and specs inline

Unordered list with custom checkmark prefix in Obsidian Ink. Practice 400/16px, -0.02em tracking, line-height 1.45. Items prefixed by a small geometric tick (√ or +). No background, tight vertical rhythm at 8px row gap.

### Footer
**Role:** Site footer

Linen (#ece9df) background, simple column structure with practice 400/14px links, lab-mono 12px copyright. Generous vertical padding (64–80px). Hairline Obsidian Ink 1px top border.

## Do's and Don'ts

### Do
- Use 32px border-radius for all interactive elements (buttons, tags) — the pill shape is the brand's interactive signature
- Keep 0.10em letter-spacing on all uppercase labels (lab-mono 12px or practice 14px) — this tracking reads as pharmaceutical signage
- Reserve #a77a41 Bronze Seal exclusively for award badges and product seals on the product itself — never use it for UI buttons, text, or backgrounds
- Set body text to practice 400/16–18px with -0.02em tracking — the slight tightening is essential to the editorial feel
- Use #f7f5ee Parchment for any section that introduces a product or feature set — white is for content, parchment is for showcase
- Apply the diagonal lab-mono tag (-10° rotation) to any product labeled new, limited, or vegan-hybrid
- Let product photography carry the color and mood — never overlay gradients, tints, or color washes on hero images

### Don't
- Don't use filled colored buttons — every action is a Ghost Pill with black outline, including CTAs
- Don't introduce additional accent colors — the entire system is achromatic plus one Bronze Seal
- Don't use heavy drop shadows on cards or containers — products float with a soft diffuse shadow only
- Don't set headlines in bold weights above 600 — the brand whispers authority through plantin 300 and practice 600
- Don't break the two-tone surface system (white and Parchment) with grays for backgrounds — use only these two for content zones
- Don't use the Bronze Seal on text, links, or hover states — it is a physical-seal metaphor, not an interactive accent
- Don't use centered or right-aligned body paragraphs — editorial body copy is always left-aligned and max-width 640–720px

## Elevation

Elevation is achieved through product photography and generous whitespace, not drop shadows. The only consistent shadow is a soft diffuse beneath product canister images, giving the impression of objects floating on the page rather than sitting inside a card.

## Surfaces

- **Page Canvas** (`#ffffff`) — Base background for most product and content sections
- **Parchment Zone** (`#f7f5ee`) — Warm cream band used for product showcases, category dividers, and elevated content blocks
- **Linen Band** (`#ece9df`) — Footer and deepest background tier — used sparingly for zone separation
- **Alpine Bar** (`#205f4b`) — Top announcement strip only

## Imagery

Photography is the dominant visual element — dark, moody, outdoor lifestyle imagery (cyclists, mountain landscapes) treated at full-bleed with no overlay, allowing the natural lighting to create contrast against white type. Product photography features matte black cylindrical canisters (PRO, ELITE, ADD+) shot straight-on on pure Parchment surfaces with soft directional shadows that make the containers feel pinned to the page. No illustration, no 3D renders, no abstract graphics. The single chromatic accent (#a77a41 Bronze Seal) appears only as a circular award badge on the ELITE Hydration canister — otherwise the system is purely photographic and typographic.

## Layout

Full-bleed editorial layout: hero photography stretches edge-to-edge at 60–80vh, then transitions to centered max-width 1400px content sections on Parchment or white. Product showcases use 50/50 two-column splits rather than grid systems. Below the fold, three-column product rows introduce rhythm. Navigation is a minimal transparent bar that becomes white on scroll. Generous vertical section gaps (80–120px) between major bands create a magazine-spread pace. Content alternates between full-bleed image bands, centered editorial blocks, and split text+product sections — never repeating the same layout twice in succession.

## Similar Brands

- **On Running** — Same premium athletic aesthetic — full-bleed dark outdoor photography, all-caps minimalist nav, single-color product line, and editorial restraint
- **Aesop** — Apothecary-philosophy design with off-white surfaces, serif display type, monochrome product photography, and pill-shaped ghost buttons
- **Maap** — Cycling-apparel brand with massive condensed display type overlaid on dark photography and ultra-minimal achromatic product UI
- **Eight Sleep** — Premium hardware brand using ghost outlined CTAs, cream surfaces, condensed display serif, and single accent color discipline
