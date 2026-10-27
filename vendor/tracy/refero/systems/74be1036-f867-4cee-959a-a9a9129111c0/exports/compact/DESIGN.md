# Moonli — Style Reference
> Electric lime on white canvas — one vivid room carved out of monochrome space, framed by generous rounded edges.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Moonli runs on radical color minimalism: a white canvas, black type, and one electrifying lime accent that appears as a single massive atmospheric block rather than scattered UI elements. The lime (#b8ff65) functions as a room, not a highlight — it floods the hero entirely and reappears in section backgrounds, never as a button fill or icon tint. Everything else is pure black-on-white, anchored by generous 30-40px border radii that soften the stark monochrome contrast. DM Sans carries the entire typographic system across a wide weight range, with tight letter-spacing that scales aggressively negative at display sizes (-0.05em at 58px). Line illustrations in black on the green surfaces add personality and warmth without breaking the two-color discipline. The result reads as confident, almost poster-like — like a single bright object in a gallery of white walls.

## Colors

| Name | Value | Role |
|------|-------|------|
| Lime Voltage | `#b8ff65` | Atmospheric section backgrounds, hero block — the single chromatic voice of the system, used at full-section scale rather than as UI accent |
| Obsidian | `#000000` | Primary text, all borders, all icons, scroll-indicator fill, logo mark |
| Paper White | `#ffffff` | Page background, card surfaces, nav element fills |
| Fog White | `#f3f3f3` | Secondary card surface, alternating section backgrounds |
| Ash Border | `#e2e2e2` | Card borders, hairline dividers on white surfaces |
| Smoke | `#757575` | Muted helper text, secondary metadata, caption-level information |

## Typography

### DM Sans — Sole typeface — weight 700 for display and headings, 500 for navigation and subheadings, 400 for body and captions. The aggressive negative tracking at display sizes (-0.05em at 58px) is signature: DM Sans becomes a compressed, poster-like headline tool rather than a neutral body face. At body sizes tracking relaxes to -0.01em, giving copy a natural rhythm without feeling mechanical.
- **Substitute:** Inter, Satoshi, General Sans
- **Weights:** 400, 500, 700
- **Sizes:** 14px, 16px, 24px, 38px, 48px, 58px
- **Line height:** 1.08 (display), 1.13–1.17 (large headings), 1.26 (subheadings), 1.45–1.50 (body), 1.75 (body-sm/captions)
- **Letter spacing:** -0.05em at 58px, -0.03em at 38–48px, -0.01em at 14–24px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.75 | — |
| body-sm | — | — | 16px | 1.5 | — |
| subheading | — | — | 24px | 1.26 | — |
| heading-sm | — | — | 38px | 1.17 | — |
| heading | — | — | 48px | 1.13 | — |
| display | — | — | 58px | 1.08 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 40-70px
- **Card padding:** 30-40px
- **Element gap:** 20-25px

### Border Radius

- **nav:** 40px
- **cards:** 30px
- **buttons:** 40px
- **circles:** 9999px

## Components

### Lime Hero Block
**Role:** Primary hero — full-width atmospheric section

Full-width #b8ff65 background, 30px border-radius, padded 40-70px. Black DM Sans 58px/1.08/weight 700/letter-spacing -0.05em headline centered or left-aligned. Black line illustrations flanking the text on left and right. Black body copy at 16px/1.5 underneath.

### White Content Card
**Role:** Standard surface for information blocks

#ffffff background, 1px #e2e2e2 border, 30px border-radius, 30-40px padding. Contains black headings at 38-48px and body at 16px.

### Network Logo Card
**Role:** Horizontal scroll card showing a blockchain network

#ffffff background, 1px #e2e2e2 border, 30px border-radius, 20px padding. Network name in DM Sans 500 at 24px, logo icon as circular 48-56px element on the right side.

### Charity Circle
**Role:** Circular badge for charity/cause logos in the Giving Back section

Perfect circle (9999px radius), #f3f3f3 background, black logo inside at ~50% fill. Arranged in grid.

### Nav Pill Button
**Role:** Primary navigation CTA (Stake Now)

#ffffff background, 1px #e2e2e2 border, 40px border-radius, 12px vertical / 20px horizontal padding. Text in DM Sans 500 at 16px, #000000.

### Ghost Nav Link
**Role:** Standard navigation text item

No background, no border. DM Sans 500 at 16px, #000000. Horizontal spacing 25px between items.

### Scroll-Down Indicator
**Role:** Floating circular button prompting scroll

#000000 fill, perfect circle (~48px), white chevron icon centered. Positioned overlapping section boundary.

### Two-Column Feature Section
**Role:** Giving Back and similar split layouts

Lime green left column (#b8ff65) paired with Fog White right column (#f3f3f3), both 30px border-radius. Left holds heading + body + illustration; right holds logo grid + supporting copy.

### Logo Mark
**Role:** Brand identity in nav and footer

Black circular icon (~36px) containing a white abstract curve mark, followed by 'moonli' wordmark in DM Sans 500 at ~20px, #000000.

### Line Illustration Block
**Role:** Decorative visual on green surfaces

Black single-weight line art depicting 3D objects (books, coins, monitors, crystals). Drawn at ~1.5px stroke, no fill. Positioned at edges of lime sections.

## Do's and Don'ts

### Do
- Use #b8ff65 only as a full-section or full-card background — never as a button fill, text color, or icon tint
- Apply 30px border-radius to all cards and 40px to all nav-pill elements
- Use DM Sans 700 with letter-spacing -0.05em for any text at 48px or above
- Keep all icons, borders, and text #000000 — the system is binary between black and white, with lime as the only third voice
- Use line illustrations (single-weight black strokes, no fill) to add personality on lime surfaces
- Pair sections as adjacent rounded blocks rather than separating with dividers — the 30px radius and color contrast create the structure
- Center the page at ~1200px max-width; let white margins breathe

### Don't
- Never use #b8ff65 as a CTA button background or link color — the lime is atmospheric, not interactive
- Avoid introducing additional chromatic colors — no blues, purples, or status hues. The system is two-tone plus lime
- Don't apply shadows or gradients — the design is strictly flat with border-defined elevation
- Avoid sharp corners below 30px on cards or containers — small radii break the system's softness
- Don't use letter-spacing looser than -0.01em at body sizes or tighter than -0.05em at display
- Never place lime text on white or white text on lime at small sizes — keep it large to preserve the 17.5:1 contrast
- Avoid photographic imagery, gradients, or filled illustrations — line art in black is the only visual language

## Elevation

No shadows. Elevation is expressed through border color (1px #e2e2e2) and surface color shifts (white → fog → lime). The system is strictly flat; depth comes from layering rounded blocks, not from drop shadows.

## Surfaces

- **Paper White** (`#ffffff`) — Page canvas, nav background
- **Fog White** (`#f3f3f3`) — Secondary card surface, alternating sections
- **Lime Voltage** (`#b8ff65`) — Atmospheric hero and feature block backgrounds

## Imagery

No photography. All visuals are hand-drawn line illustrations in single-weight black strokes (approximately 1.5px) depicting geometric 3D objects — monitors, coins, books, crystals, pyramids, coins on stacks. Illustrations sit on lime backgrounds and function as atmospheric decoration rather than explanatory content. Third-party logos (network chains, charities) appear as small monochrome marks inside circular or pill containers. The visual density is low — illustrations occupy generous negative space and never overlap or crowd the typography.

## Layout

Centered, max-width ~1200px contained layout. The hero is a full-width lime block with centered headline and flanking line illustrations. Below, a horizontally scrolling row of network cards (#ffffff, 30px radius) sits inside a fog-white container. Two-column sections follow a repeating pattern: one lime column paired with one fog-white column, each 30px radius, creating a yin-yang rhythm. Generous vertical spacing (40-70px between sections). Navigation is a minimal top bar with a pill-shaped CTA on the right. The overall density is spacious — white space dominates, with content blocks floating as discrete rounded cards rather than filling the page edge-to-edge.

## Similar Brands

- **Linear** — Same ultra-minimal palette discipline with one accent color, generous rounded corners, and tight letter-spacing on display headings
- **Evervault** — Similar poster-like hero blocks with full-bleed color washes and bold sans-serif display type
- **Ledger (corporate site)** — Same crypto/blockchain domain with stark monochrome UI and rounded card surfaces
- **Cove** — Shared two-tone aesthetic (white + single vivid accent) with large border-radius and confident display type
