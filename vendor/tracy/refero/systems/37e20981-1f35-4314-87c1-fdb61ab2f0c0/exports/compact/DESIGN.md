# Modern companies are built on Capital — Style Reference
> midnight editorial gallery with ember accent. Pure black rooms the size of gallery walls, enormous weight-300 serif-like sans type floating in negative space, a single warm red button glowing like a small fire against the matte black.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Capital reads as a high-end editorial spread rendered in dark mode: true black canvases alternating with warm cream sections, enormous light-weight Muoto display type, and a single vivid red ember (#ed5145) used sparingly as functional punctuation. Type carries the entire weight of the design — weight 300 at 90–115px with tight negative tracking whispers authority rather than shouts it, and uppercase GT America Mono labels in wide tracking act as section markers above each headline. The layout alternates between dramatic full-bleed dark sections with centered editorial typography and lighter cream sections that feel like magazine pages, with product mockups and portrait photography breaking the rhythm. Surfaces stay flat and matte; the only warmth comes from the cream neutrals and the red accent, never from gradients or decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Page canvas for dark sections, hero backgrounds — the true black that swallows surrounding UI |
| Bone | `#efece6` | Primary text on dark sections, pill-badge fills, light-section canvas — warm off-white that softens the pure black without going clinical |
| Charcoal | `#1a1a1a` | Elevated surface above obsidian (card backgrounds, product mockup shells), heading borders on light sections |
| Carbon | `#131413` | Intermediate dark surface — product UI panels, modals nested inside the black canvas |
| Smoke | `#8e8c87` | Muted body text, secondary metadata, helper labels on both dark and light backgrounds |
| Ash | `#bfbcb7` | Muted borders, divider lines on cream sections, low-emphasis form fields |
| Graphite | `#302f2f` | Button borders, link borders on dark sections — the visible edge of a ghost control against obsidian |
| Ink | `#0d0d0c` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Ember | `#ed5145` | Red action color for filled buttons, selected navigation states, and focused conversion moments. |
| Ember Glow | `#ff7a70` | Outer-glow halo on the ember button — lifts the red off pure black so it feels lit from within rather than pasted on |
| Ember Deep | `#82403a` | Inner shadow / pressed state for the ember button — darkens the red when active |

## Typography

### Muoto — Primary display and body. Weight 300 at 72–115px is the editorial signature — light enough to feel like print type rather than screen type. Weight 400 for body, 500 for emphasis. Sizes step aggressively from 32px body-large directly to 72px display, skipping 48–64px to keep the contrast between running text and headlines extreme.
- **Substitute:** Inter, GT Walsheim, Söhne (all share geometric humanist proportions and the same weight-300 display quality)
- **Weights:** 300, 400, 500
- **Sizes:** 12px, 14px, 16px, 20px, 28px, 32px, 72px, 90px, 115px
- **Line height:** 1.15, 1.20, 1.40, 1.43, 1.50, 1.67
- **Letter spacing:** -0.0200em at 72–115px, -0.0120em at 28–32px, -0.0100em at 16–20px

### GT America Mono — Uppercase section labels, pill badges, eyebrow tags above headlines. Always at 12px, always uppercase, always with 8% tracking — these act like magazine kickers sitting above the Muoto display type, labeling each section's topic.
- **Substitute:** JetBrains Mono, IBM Plex Mono (any geometric monospace at weight 400 works)
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.15, 1.60
- **Letter spacing:** 0.0800em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.15 | 0.96px |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.67 | -0.16px |
| subheading | — | — | 20px | 1.43 | -0.2px |
| heading-sm | — | — | 28px | 1.4 | -0.336px |
| heading | — | — | 32px | 1.2 | -0.384px |
| heading-lg | — | — | 72px | 1.15 | -1.44px |
| display | — | — | 115px | 1.15 | -2.3px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 40px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 16px
- **pills:** 24px
- **badges:** 8px
- **inputs:** 8px
- **buttons:** 8px

## Components

### Eyebrow Pill Badge
**Role:** Section label sitting above each major headline

Uppercase GT America Mono 12px, letter-spacing 0.08em. Dark variants: Bone (#efece6) fill, Obsidian text, 24px radius, 6px 12px padding. Light variants: transparent or Charcoal fill with Bone text. Contains a trailing arrow icon (↗) as a 12px right-side glyph. Used once per section, centered above the display heading.

### Ember CTA Button
**Role:** The only filled chromatic action in the entire system

Ember (#ed5145) fill, Bone (#efece6) text, Muoto weight 500 at 14px, 8px radius, 10px 16px padding. Outer glow via Ember Glow (#ff7a70) at 0.3 opacity with 20px blur. Pressed state swaps to Ember Deep (#82403a) with a 0px 3px 0px Ink (#0d0d0c) inset shadow. This is the only red element allowed on any given screen — it should feel like a single ember against the matte black.

### Ghost Text Button
**Role:** Secondary navigation in the footer toolbar and inline links

No background, Graphite (#302f2f) 1px border, Bone text at 14px Muoto weight 400, 8px radius, 8px 16px padding. Hover: border lightens to Smoke (#8e8c87). Used for 'Twitter', 'Founders', 'Team', 'Support' in the persistent bottom bar.

### Product Mockup Shell
**Role:** Container for embedded product UI screenshots in hero sections

Charcoal (#1a1a1a) background, 16px radius, 1px Graphite border, 0 8px 24px rgba(26,26,26,0.4) shadow. Inner device chrome is Carbon (#131413) with the actual product UI rendered in a white/cream card inside. Always presented as a laptop or tablet frame, never a raw screenshot.

### Editorial Display Heading
**Role:** Hero and section H1s

Muoto weight 300 at 72–115px, line-height 1.15, letter-spacing -0.02em (≈ -2.3px at 115px, -1.44px at 72px). Bone (#efece6) on dark sections, Obsidian on Bone sections. Always centered, always breaks across two lines. No bold weight exists at this size — the design trusts negative space and tracking to carry the message.

### Section Subtitle
**Role:** Supporting paragraph below the display heading on cream sections

Muoto weight 400 at 20px, line-height 1.43, letter-spacing -0.01em. Smoke (#8e8c87) color, max-width 560px, centered. One sentence, no more.

### Portrait Founder Card
**Role:** Founder feature in the 'Banking services for founders' section

Raw photographic portrait, 16:9 or 3:4 aspect ratio, no border, no radius — the image edge meets the black canvas directly. No captions, no overlays. Arranged in a 3-column grid with 16px gaps. The portrait's natural color temperature provides the only warm-cool contrast in the section.

### Partner Logo Row
**Role:** Customer/partner logos beneath value propositions on cream sections

Smoke (#8e8c87) single-color logo lockups, horizontally centered, 40px row gap above and below, 24px gap between logos. Logos are rendered in one uniform neutral — no brand colors — to read as a single band of quiet credibility rather than a billboard.

### Persistent Footer Toolbar
**Role:** Bottom utility bar visible across all sections

Carbon (#131413) background, 1px top border in Graphite (#302f2f), full-bleed, 48px height. Left: tool icons (camera, palette, image, layers, settings) in 8px radius square buttons. Center-right: Ghost Text Buttons for Twitter/Founders/Team/Support. Far right: Ember CTA Button. Stays anchored to the viewport bottom.

### Banking Detail Card
**Role:** Product UI surface shown inside the hero mockup

Bone (#efece6) fill inside a Carbon (#131413) device frame. Balance number at 72px Muoto weight 300 in Obsidian. 'CARBON FI' API tag in uppercase GT America Mono 12px with 0.08em tracking on a transparent background. Account details as label-value pairs in Muoto 16px, Smoke for labels, Obsidian for values. Send-a-payment button is a dark ghost: Charcoal fill, Bone text, 8px radius.

### Nav Pill Link
**Role:** Inline links within body copy

Bone (#efece6) text with a 1px Graphite (#302f2f) bottom border that animates to Smoke (#8e8c87) on hover. No underline, no color change — the border IS the link affordance.

## Do's and Don'ts

### Do
- Use weight 300 Muoto at 72–115px for every display heading — this is the system's signature and no other weight reads as on-brand
- Place a single GT America Mono uppercase eyebrow badge centered above every section heading, at 12px with 0.08em tracking
- Use the Ember red (#ed5145) for exactly one CTA per screen, with the Ember Glow halo to lift it off the black
- Alternate sections between Obsidian (#000000) and Bone (#efece6) canvases to create the editorial rhythm
- Keep cards and surfaces flat — use 1px borders in Graphite or Ash, never drop shadows on light sections
- Set product mockups inside a Charcoal device frame with 16px radius rather than presenting raw screenshots
- Use 24px radius for all pill-shaped badges and 8px for all rectangular buttons

### Don't
- Never use Muoto weight 500 or 600 at display sizes — the light-weight whisper is the entire point
- Never introduce a second chromatic accent — no blue, green, or purple; the red ember stands alone
- Never use gradients — the system is deliberately flat with the red glow as the only luminance effect
- Never use drop shadows on cream sections — Bone backgrounds stay matte; reserve shadows for elements on Obsidian
- Never center-align body paragraphs longer than two lines — subtitles are centered, body copy is left-aligned
- Never stack the ember button next to another chromatic element — it needs matte black or matte cream around it to glow
- Never use letter-spacing wider than 0.08em or set type above 12px in GT America Mono — the mono is a label tool, not a display tool

## Elevation

- **Ember button:** `0 6px 20px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 122, 112, 0.3)`
- **Product mockup shell:** `0 8px 24px rgba(26, 26, 26, 0.4)`
- **Light section floating card:** `0 8px 24px rgba(26, 26, 26, 0.4)`

## Surfaces

- **Obsidian Canvas** (`#000000`) — Base canvas for hero, dark editorial sections, footer
- **Carbon Panel** (`#131413`) — Product UI mockups, embedded device screens, nested dark surfaces
- **Charcoal Card** (`#1a1a1a`) — Elevated cards and modals floating above the obsidian canvas
- **Bone Section** (`#efece6`) — Light editorial section — magazine-page alternate that breaks the dark rhythm

## Imagery

Photography is portrait-only and editorial in tone: tight head-and-shoulders crops of real founders in natural environments (street, whiteboard, studio). Color treatment is documentary — no duotone, no desaturated filter, no overlay. The portraits are the only color-bearing element on dark sections, so they read as warm-cool counterpoints to the Bone text. Product UI is shown as device-framed mockups (laptop/tablet) rendered in a Charcoal device chrome, never as floating screenshots. Partner logos are stripped to single-color Smoke gray — brand color is removed so the row reads as a unified band of credibility. There are no illustrations, no abstract graphics, no 3D renders, no icons beyond functional UI glyphs.

## Layout

The page is a full-bleed editorial scroll with no max-width constraint on the canvas itself — sections stretch edge-to-edge. Each section is vertically self-contained: eyebrow badge, centered display heading (1–2 lines), optional centered subtitle, then a 3-column or single-element content block. The rhythm is dark→light→dark, like turning pages in a magazine. The hero is pure black with the display heading floating in the upper third and a large product mockup filling the lower two-thirds. Light sections flip to a Bone canvas with the same centered typographic structure but replace the mockup with a partner logo row or a 2-column value-prop block. Dark sections later in the page use 3-column portrait grids. The persistent footer toolbar is the only fixed element, anchored to the viewport bottom. Section gaps are 40px; horizontal content is centered with ~1200px effective content width inside the full-bleed canvas.

## Similar Brands

- **Linear** — Same editorial-display approach with weight-300 headlines on dark canvas, single accent color, and matte surfaces — though Capital pushes the type much larger and the accent red rather than purple
- **Arc Browser** — Same alternating dark/light editorial sections, product mockups as the visual hero, and a single warm accent color used sparingly
- **Plaid** — Same fintech confidence through large light-weight display type on dark, with founder/team portrait photography as social proof
- **Ramp** — Same banking-product category with alternating dark editorial sections and product UI mockups, though Ramp uses a green accent where Capital uses ember red
- **Pitch** — Same magazine-spread layout rhythm with enormous centered display type and alternating section backgrounds
