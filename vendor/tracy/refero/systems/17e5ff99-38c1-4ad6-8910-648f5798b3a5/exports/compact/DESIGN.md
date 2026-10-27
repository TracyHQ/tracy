# Norgram — Style Reference
> white-walled art gallery

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Norgram operates as an editorial design studio: a pristine white canvas, zero chromatic color, and typography as the sole protagonist. The system is ruthlessly monochrome — every screen reads as a black-on-white publication layout, with imagery providing the only relief. Helvetica Now Display carries the entire voice: whisper-tight tracking at headline sizes (87px at -0.02em), compact 12px metadata, and generous line-height restraint (1.0–1.17). Components are flat, borderless or hairline-bordered, and reduced to their typographic skeleton. There are no fills, no accents, no shadows of consequence — the discipline is in what is omitted. Page rhythm comes from alternating hero-sized image plates against dense text columns, and a persistent bottom info bar that anchors every section like a museum placard.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Primary text, dominant border ink, iconography, link default |
| Charcoal | `#141414` | Body text, card surface, dark UI block on white canvas |
| Paper White | `#ffffff` | Page canvas, card surface, inverse text on dark blocks |
| Bone | `#efefef` | Hairline borders, dividers, input outlines, and card edges on light surfaces. Do not promote it to the primary CTA color |
| Smoke | `#cecece` | Light dividers, secondary borders on cards |
| Ash | `#b2b2b2` | Disabled button fill, inactive controls |
| Pewter | `#999999` | Muted link surface, inactive background |
| Iron | `#777777` | Secondary body text, metadata, muted links, supporting borders |
| Graphite | `#5e5e5e` | Tertiary text, micro-copy |
| Onyx | `#1f1f1f` | Dark mode surface (project case blocks), inverse hero panel |

## Typography

### Helvetica Now Display — Display and primary voice — used at all scales from 10px micro-labels through 87px hero headlines. The custom geometric sans is the entire typographic identity.
- **Substitute:** Inter (variable), Neue Haas Grotesk Display, Helvetica Neue
- **Weights:** 400, 500
- **Sizes:** 10, 12, 36, 87
- **Line height:** 1.00–1.17
- **Letter spacing:** -0.0200em at 87px, -0.0080em at 36px, -0.0050em at 12px, -0.0060em at 12px (Medium)
- **OpenType features:** `No detected font-feature-settings; rely on tight default tracking`

### Times — Secondary serif for card descriptions, footer text, editorial body copy — a deliberate contrast voice to the sans display
- **Substitute:** Times New Roman, EB Garamond, Source Serif Pro
- **Weights:** 400
- **Sizes:** 14, 16
- **Line height:** 1.43–1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 10px | 1.1 | -0.02px |
| caption | — | — | 12px | 1.17 | -0.006px |
| body-sm | — | — | 14px | 1.43 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 36px | 1.17 | -0.008px |
| display | — | — | 87px | 1.1 | -0.02px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 68px
- **Card padding:** 12px
- **Element gap:** 8px

### Border Radius

- **tags:** 10px
- **cards:** 4px
- **large:** 26px
- **buttons:** 7px

## Components

### Hero Display Headline
**Role:** Page-defining typographic statement

Helvetica Now Display 400 at 87px, line-height 1.10, letter-spacing -0.02em, color #141414. Left-aligned, sits directly on white canvas with no decorative chrome.

### Project Image Plate
**Role:** Full-bleed case study image

Large photographic surface with no border and no radius. Bleeds to canvas edges, 1:1 or generous aspect ratio. No overlay, no caption inside the image.

### Museum Placard
**Role:** Section metadata strip

Compact bar below each image: 12px Helvetica Now Display, 1.17 line-height, color #141414 for project name, #777777 for category. Padded 8px top/bottom, no border above, a thin 1px #000 divider in some contexts.

### Dark Info Block
**Role:** Inverse panel for project intro and crediting

Background #1f1f1f, padding ~40–60px. Text in #ffffff (Helvetica Now Display 36–87px) for statement, 12px #777 or #efefef for credits. Includes a 3D-styled camera icon rendered in #ff2a2a red/black in the corner — the only chromatic moment.

### Top-left Brand Mark
**Role:** Persistent identity anchor

'Norgram®' in Helvetica Now Display 400, 12–14px, #ffffff on dark blocks / #141414 on light. Top-left of every section, never repeated elsewhere.

### Secondary Text Button
**Role:** Quiet action control

12px Helvetica Now Display Medium, 1.67 line-height, 7px horizontal padding, 5px vertical padding. Color #000 with no background, underline on hover only.

### Link Row
**Role:** Inline text navigation between sections

12px Helvetica Now Display, 8–12px row gap, color #141414 default / #777 muted. No bullets, no separators — just stacked text rows.

### Case Study Card
**Role:** Index entry for projects

Flat tile with 4px radius. Image area is borderless and full-bleed. Below the image: project name in 12px Helvetica Now Display Medium, year right-aligned in same weight.

### Footer Colophon
**Role:** Bottom-of-page attribution

Times 14–16px, 1.43–1.50 line-height, color #141414. Centered or left-aligned, generous breathing room above.

### Push Notification Toast
**Role:** System overlay for product updates

Dark rounded surface (#000 or #1f1f1f), ~10px radius, white text in Helvetica Now Display 12px. 2-line layout: timestamp + headline / body. Sits top-right with minimal padding.

### Index Grid
**Role:** Multi-project overview

Two-column asymmetric grid mixing tall and short project plates. 8–12px gutter, 68px vertical section gap. No card chrome around images — they touch directly.

## Do's and Don'ts

### Do
- Use Helvetica Now Display 400 at 87px for display headlines with letter-spacing -0.02em — this is the only acceptable display size
- Keep all UI strictly monochrome: use only #000, #141414, #777, #efefef, and #fff
- Set border-radius to 4px on cards, 7px on buttons, 10px on tag/toast surfaces
- Maintain 8px element gap and 68px section gap as the spatial rhythm
- Place full-bleed product photography on the white canvas with no border, overlay, or shadow
- Use Times 14–16px for any prose longer than a single line (footer, card descriptions, credits)
- Anchor every section with the top-left 'Norgram®' wordmark and a bottom metadata strip

### Don't
- Do not introduce any chromatic color — no blue, green, red, or brand hue in the interface
- Do not use shadows on cards, images, or buttons; reserve the drop shadow for the system toast only
- Do not use weights above 500 in Helvetica Now Display — 400 carries the voice
- Do not exceed 4px radius on cards or fall below 7px on buttons; the flatness is intentional
- Do not use bordered buttons — all actions are ghost text links or underline-on-hover
- Do not add background fills behind text blocks; let type sit directly on the canvas
- Do not mix the serif Times into headlines or navigation — confine it to editorial body copy

## Elevation

- **Toast:** `0 8px 24px rgba(0,0,0,0.12)`

## Surfaces

- **Paper White** (`#ffffff`) — Default page canvas and most section backgrounds
- **Bone** (`#efefef`) — Secondary surface wash, subtle differentiation within light sections
- **Onyx** (`#1f1f1f`) — Dark hero block for project statements and credited context
- **Charcoal** (`#141414`) — Card surface, dense text block background

## Imagery

Photography is the system's only color. Full-bleed, high-resolution, product-focused crops — eyewear, pianos, wood grain, paint swatches — treated like museum objects on a white wall. No lifestyle staging, no people, no decorative gradients. Images are unmasked, sharp-cornered, and touch each other directly in the grid with no gutter styling. The dark Onyx block introduces the only 3D-rendered object: a glossy red-and-black camera icon that breaks the photographic rule to act as a brand signature. Iconography elsewhere is line-art monochrome in #000 or #fff.

## Layout

Full-bleed page model with content anchored to a 1440px max-width column. Each section is an alternating image plate: a large photograph on one side, a tight text block on the other, with the museum placard strip running the full width below. The dark Onyx hero block breaks the white rhythm and houses the case study's display headline in 87px type. Navigation is minimized to a top-left wordmark and right-aligned section text links — no menu bar, no sidebar, no footer chrome. Vertical rhythm is established by 68px section gaps and 8px micro-gaps between text lines, creating the tight editorial density of a printed catalog.

## Similar Brands

- **Pentagram** — Same wordmark-in-corner identity, black-on-white editorial layout, and zero-chromatic restraint for a design agency
- **Manual (manualcreative.com)** — Identical Swiss-grid approach: full-bleed monochrome photography, hairline metadata strips, and Helvetica display at extreme sizes
- **Studio Dumbar** — Same flat, borderless, image-first composition with type doing all the structural work
- **Bureau Cool** — Editorial design agency aesthetic with white canvas, single-serif voice, and project plates that hang like gallery prints
