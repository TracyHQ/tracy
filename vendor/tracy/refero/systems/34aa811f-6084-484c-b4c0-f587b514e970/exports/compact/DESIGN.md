# Charlie — Style Reference
> Monastery stone-cut typography on obsidian. A portfolio that uses one red wall to make silence deafening.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Charlie Le Maignan's portfolio is a brutalist editorial canvas: pure black void as the page, oversized white type as the only architecture, and one punishing red slab that detonates against the monochrome. The visual language is a collision of a custom sliced display face (Brasparz) at absurd scale against a restrained neo-grotesque (NeueHaas) doing the quiet labor. Everything is allowed to be massive — line-height compressed to 0.70, letter-spacing driven to -0.079em — so type bleeds across the viewport rather than sitting inside it. The single red hero block functions as the only color punctuation in the entire system; everything else stays achromatic. Surfaces are flat with no elevation, no gradients, no decorative shadow — the design communicates through scale, contrast, and a single chromatic detonation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Page canvas, deep surface — the void everything floats on |
| Bone White | `#ffffff` | Primary type, nav pill borders, active state fill, hairlines, iconography |
| Ash Gray | `#838383` | Muted secondary text, inactive nav labels, tertiary metadata |
| Alarm Red | `#ed1c24` | Hero detonation block — the only chromatic moment, used as full-bleed surface against black. Makes monochrome feel like a held breath before a shout |

## Typography

### Brasparz Variable — Signature display face for hero detonations and the wordmark. Used at extreme viewport-bleeding sizes with line-height crushed to 0.70 so letterforms overlap vertically. The aggressive negative tracking (down to -0.079em at 360px) tightens characters into a single sculptural mass. Custom stylistic sets ss01 and ss02 are explicitly DISABLED (set to 0) — the raw geometric forms are the brand, no alternates allowed
- **Substitute:** Druk Wide, Antonio
- **Weights:** 400
- **Sizes:** 145px, 360px
- **Line height:** 0.70
- **Letter spacing:** -0.079em at 360px scaling to -0.020em at 145px
- **OpenType features:** `"ss01" 0, "ss02" 0`

### NeueHaas — Body, navigation, UI labels. The 40px weight 700 serves as mid-scale editorial heading. Weight 400 at 19-20px carries paragraph and caption duties. Features calt, case, liga, ss01, ss02 all active — the only font allowed to flex stylistic alternates
- **Substitute:** Neue Haas Grotesk, Inter, Helvetica Neue
- **Weights:** 400, 700
- **Sizes:** 19px, 20px, 40px
- **Line height:** 1.08, 1.25, 1.32
- **Letter spacing:** normal
- **OpenType features:** `"calt", "case", "liga", "ss01", "ss02"`

### Trajan-style serif (editorial credits, not in extracted data but visible) — Small-caps credit lines under the display block — classical serif at tiny size creates editorial gravitas against the brutalist type
- **Substitute:** Cormorant SC, EB Garamond small caps
- **Weights:** 400
- **Sizes:** 
- **Line height:** 1.3
- **Letter spacing:** 0.05em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 19px | 1.32 | 0px |
| subheading | — | — | 40px | 1.08 | 0px |
| display | — | — | 145px | 0.7 | -29px |
| display-xl | — | — | 360px | 0.7 | -28.4px |

## Spacing & Layout

**Base unit:** 6px

**Density:** spacious

- **Section gap:** 59px
- **Card padding:** 20px
- **Element gap:** 15px

### Border Radius

- **cards:** 0px
- **pills:** 100px
- **buttons:** 100px
- **surfaces:** 0px

## Components

### Outlined Pill Nav Button
**Role:** Primary navigation items (Work, Type, About)

100px border-radius, 1px solid #ffffff border, transparent background, #ffffff text. Padding 7px vertical × 20px horizontal. Font: NeueHaas 19px weight 400. 15px right margin between pills. Inactive state — the border does the visual work

### Active Filled Pill Nav Button
**Role:** Current/selected navigation item

Same 100px radius, but #ffffff fill with #000000 text. Same 7px/20px padding, same NeueHaas 19px. The inversion is the only differentiator — no color, no border emphasis, just figure-ground flip

### Display Wordmark (Brasparz Massive)
**Role:** Brand name and hero detonation text

Brasparz Variable at 145-360px, line-height 0.70, letter-spacing -0.079em at 360px scaling to -0.020em at 145px. White on black, or black on red. No max-width — bleeds beyond container edges intentionally. The crushed line-height causes letterforms to nearly touch vertically

### Red Detonation Hero Block
**Role:** The singular chromatic moment — full-bleed hero/cover

#ed1c24 background, no border, 0px radius, full viewport width. Houses a black Brasparz display at maximum scale. Vertical padding generous (50px+). The block is a wall, not a card

### Editorial Credit Line
**Role:** Small-caps attribution beneath display type

Classical serif (Trajan-style), ~14px, letter-spacing 0.05em, white on red or black on red. Sets the tone shift from brutalist to editorial-museum

### Caption Stack
**Role:** Small descriptive text (e.g., 'A COLLECTION OF INDEPENDENT & STUDIO WORK')

NeueHaas 19px weight 700, uppercase, #ffffff or #000000 depending on surface. Tight line-height 1.25. Functions as a label, not body copy

### Floating Social Icon Stack
**Role:** Persistent utility icons (heart, info, share) anchored to hero edge

Right-aligned vertical stack at hero block right edge. 1px #000000 borders on circular or square containers, #000000 icons. No background fill — icons float on the red

### Project Tile (implied from spacing tokens)
**Role:** Portfolio work entries

Full-bleed or large image containers, 0px radius, no shadow. Generous internal padding ~30px. Image-first, no card chrome

## Do's and Don'ts

### Do
- Use Brasparz Variable only at 145px or larger with line-height 0.70 — smaller and it loses its sculptural impact
- Keep letter-spacing on display type at -0.06em to -0.08em; tighter as size increases
- Set ss01 and ss02 to 0 on Brasparz — the raw forms are non-negotiable
- Use 100px border-radius on all interactive elements (buttons, tags, nav)
- Let the red hero block run full-bleed at viewport width — never contain it in a card
- Keep all text either #ffffff (on black/red) or #000000 (on red) — no mid-gray body type
- Use NeueHaas 19-20px for all UI; never set body below 19px

### Don't
- Don't introduce gradients, shadows, or any depth-cueing — the system is flat by doctrine
- Don't use Brasparz for body text or UI labels — it is display-only and will collapse at small sizes
- Don't add a second accent color — red is the sole chromatic vocabulary
- Don't use mid-gray (#838383) for anything larger than caption — it fails contrast on the black canvas at 3.8:1
- Don't contain the display type in a max-width box — let it bleed to viewport edges
- Don't apply card-style padding, borders, or radius to content surfaces — only nav pills get the 100px radius
- Don't use uppercase letter-spacing tighter than -0.02em on NeueHaas body — the tracking pattern belongs only to Brasparz

## Elevation

Zero shadow. Zero elevation. The design communicates through scale contrast and chromatic detonation, not depth. Surfaces meet at hard edges with no softening — the only rounding in the system is the 100px pill radius on nav buttons.

## Surfaces

- **Obsidian Void** (`#000000`) — Page canvas — the baseline that all white type and red detonations sit on
- **Alarm Red** (`#ed1c24`) — Sole chromatic surface — full-bleed hero blocks, the system's one emotional release valve

## Imagery

The visible screenshot shows no photography or illustration — the design IS typography as image. The 'imagery' is the sliced geometric letterforms of Brasparz rendered at architectural scale, functioning as both content and visual. Any future imagery (project thumbnails, case study photos) should be treated with the same brutalist containment: full-bleed, no rounded corners, no decorative framing, image-as-wall not image-as-illustration.

## Layout

Full-bleed, no max-width container. The page is a vertical stack of viewport-spanning sections: nav pills centered at top with generous breathing room, then the wordmark in Brasparz at hero scale, then a full-viewport red detonation block with massive display type, followed by content sections that continue the 100% width rhythm. Section gaps of ~59px create pauses between detonations. Navigation is minimal — three pill buttons horizontally centered, no sticky behavior visible, no sidebar. The layout grammar is: silence, white type, detonation, silence, white type, detonation. Content never lives in a contained column — it always addresses the viewport edge.

## Similar Brands

- **Pentagram** — Same full-bleed editorial blocks, oversized display type addressing viewport edges, minimal nav, black/white/red chromatic restraint
- **Hattie Molloy (or other indie type designer portfolios)** — Same sliced/custom display face at architectural scale, crushed line-heights, no card chrome, type-as-image
- **Bureau Cool** — Same dark canvas, custom display typography, single chromatic detonation block, zero shadow/depth
- **Wieden+Kennedy editorial** — Same brutalist editorial portfolio language — flat surfaces, aggressive scale contrast, no decorative warmth
