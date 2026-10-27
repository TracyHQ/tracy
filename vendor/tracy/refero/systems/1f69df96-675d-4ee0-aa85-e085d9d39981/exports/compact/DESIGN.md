# Splice — Style Reference
> midnight recording studio — a dark, weightless space where the only thing that ever gets loud is the music.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Splice operates as a midnight recording studio: deep charcoal canvases, near-borderless surfaces, and a single electric blue accent that cuts through the darkness like a signal light. Typography splits between SoehneBreit at whisper-weight for editorial headlines and Inter Variable as the dense workhorse, creating a deliberate contrast between performance and utility. Components stay flat and weightless — cards sit on near-identical surface tones, shadows are replaced by hairline inset strokes, and elevation comes from the photography itself. Color is rationed: one blue carries links and interactive elements, a saturated yellow-green appears as rare text punctuation, and everything else recedes into grayscale. The product — sound — is the only thing that ever gets loud.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Blue | `#528fff` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Button Blue | `#1253ff` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Voltage Yellow | `#f1f607` | Rare text accent — highlight punctuation, featured labels, emphasis. Used sparingly, only when a word needs to flash against the dark canvas. Never on backgrounds |
| Carbon | `#121214` | Primary page canvas, card surfaces, input fields, footer. The dominant working surface at 425 occurrences across every context |
| Obsidian | `#000000` | Deepest dark — image containers, nav surface, full-bleed backgrounds. Creates the bottom of the surface stack |
| Platinum | `#ffffff` | Primary text, inverted button text, icon fills. The only true white in the system; appears 1506 times across every text context |
| Graphite | `#232426` | Dominant canvas background, secondary button surface. Sits one step lighter than Carbon, used when a surface needs to feel like a different plane without using shadow |
| Fog | `#a6a8ad` | Muted text, nav items, secondary labels, inactive links. The first step down from white in the type hierarchy |
| Ash | `#c8c9cc` | Button borders, icon strokes, hairline dividers, ghost control outlines. The border that doesn't feel like a border |
| Slate | `#63656d` | Borders, dividers, inactive controls. Darker than Ash for when a divider needs to recede further |
| Iron | `#45464d` | Elevated surfaces, button borders, nav separators. The highest dark in the stack — used for the 1px inset stroke that replaces shadows |

## Typography

### InterVariable (custom) — Workhorse for all UI text — body, nav, buttons, inputs, cards, footer. The variable axis allows weight shifts (400→500→600→700) within a single family. Universal -0.015em tracking creates a compact, efficient reading rhythm across every size.
- **Substitute:** Inter
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12, 13, 14, 16, 18, 20, 26
- **Line height:** 1.20, 1.25, 1.43, 1.50
- **Letter spacing:** -0.0150em

### SoehneBreit (custom) — Editorial display headlines. The wider, geometric cut of SoehneBreit at weight 400 creates a distinctive voice — headlines don't shout, they announce with quiet authority. The 0.071em tracking (applied at 14px) appears on uppercase eyebrow labels, creating the system's only wide-tracked text. Weight 400 only — bold is never used.
- **Substitute:** Inter (with +2% horizontal scaling and 0.071em tracking on uppercase)
- **Weights:** 400
- **Sizes:** 14, 28, 36, 48, 54
- **Line height:** 1.25, 1.43
- **Letter spacing:** -0.0150em, 0.0710em

### Soehne (custom) — Subheadings — bridges the gap between SoehneBreit display and Inter body. Used at 20px for secondary headings that need editorial weight without display scale.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 20
- **Line height:** 1.25
- **Letter spacing:** -0.0150em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | -0.18px |
| body-sm | — | — | 14px | 1.43 | -0.21px |
| body | — | — | 16px | 1.5 | -0.24px |
| subheading | — | — | 20px | 1.25 | -0.3px |
| heading-sm | — | — | 28px | 1.25 | -0.42px |
| heading | — | — | 36px | 1.25 | -0.54px |
| heading-lg | — | — | 48px | 1.25 | -0.72px |
| display | — | — | 54px | 1.25 | -0.81px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 80px
- **Card padding:** 20-32px
- **Element gap:** 8-16px

### Border Radius

- **nav:** 1440px
- **cards:** 4px
- **images:** 4px
- **inputs:** 4px
- **buttons:** 8px
- **pill-buttons:** 60px

## Components

### Promotional Banner
**Role:** Top-of-page announcement strip

Full-width #528fff background, centered white text at 14px Inter weight 400, with an inline link. Padding 8-14px vertical. Sits above the navigation as a separate band.

### Navigation Bar
**Role:** Primary site navigation

Black (#000000) background, sticky to top. Logo left, link group center (Fog #a6a8ad, 14px Inter, 16-20px horizontal spacing), utility actions right. Inner pill elements use 1440px radius (fully rounded). Height approximately 60px.

### Filled Button (Primary)
**Role:** Interactive action trigger

#1253ff background, #ffffff text, 8px border-radius, 16px vertical / 20px horizontal padding. Inter weight 500-600 at 14px. The system's solid interactive element — deeper and more grounded than the Signal Blue links.

### Ghost Button
**Role:** Secondary interactive trigger

Transparent background, #c8c9cc or #ffffff border (1px), #ffffff text, 8px border-radius, 8px vertical / 20px horizontal padding. Inter weight 400-500 at 14px. Used for actions that should not compete with the filled button.

### Pill Button
**Role:** Rounded utility button

60px border-radius, compact padding (8-10px vertical, 16-20px horizontal). Used for tag-like actions, filter pills, and small interactive chips. Typically #ffffff fill with #000000 text when inverted, or transparent with #ffffff text on dark.

### Hero Section
**Role:** Full-bleed landing visual

Full-viewport-width photograph (no radius, edge-to-edge). Overlaid text sits left-aligned, 48-54px SoehneBreit weight 400 in #ffffff with -0.72 to -0.81px letter-spacing. Body text at 16-18px Inter in #ffffff or rgba white. A filled blue button sits below the headline at 20px from the last line.

### Content Card
**Role:** Grouped content surface

#121214 background, 4px border-radius, 20-32px padding, optional 1px #232426 or #45464d hairline border. No drop shadow. Content sits flat on the canvas, separated only by the surface tone shift and border line.

### Input Field
**Role:** Text input control

#121214 background, 1px #45464d border, 4px border-radius, 12-14px vertical / 16px horizontal padding. Inter weight 400 at 14px. Placeholder text in Fog #a6a8ad. No focus glow — the border simply shifts to Signal Blue #528fff on focus.

### Inline Link
**Role:** Text-level navigation

#528fff color, Inter weight 400-500 at 14-16px, no underline by default. Underline appears on hover at 1px offset. The system's most-used color — 351 occurrences.

### Footer
**Role:** Site-bottom content

#000000 background, 48px+ vertical padding, Inter 12-14px in Fog #a6a8ad for body text. Links in #ffffff. Minimal visual weight — the footer recedes.

## Do's and Don'ts

### Do
- Use #528fff Signal Blue for all links and interactive text — it is the system's only persistent color voice
- Apply -0.015em letter-spacing to all text at all sizes for the compact reading rhythm
- Use SoehneBreit weight 400 for headlines — never bold, the whisper-weight is the voice
- Separate surfaces with 1px borders in #45464d or #232426, never with drop shadows
- Use 8px radius for standard buttons and 60px for pill-shaped interactive elements
- Apply 0.071em tracking to uppercase SoehneBreit labels at 14px for the editorial eyebrow pattern
- Let photography provide all visual elevation — full-bleed images carry the weight that shadows would

### Don't
- Never use #f1f607 Voltage Yellow on backgrounds — it is text-only punctuation
- Don't add drop shadows to cards or panels — the system is intentionally flat
- Never set SoehneBreit to bold weight — it only exists at 400 in this system
- Don't introduce new accent colors — the palette is grayscale plus two signals (blue, yellow-green)
- Avoid pure white backgrounds — the canvas is always Carbon #121214 or Graphite #232426
- Don't center-align body text — left-align for editorial reading rhythm
- Never use more than one chromatic color per component — the system rations color

## Elevation

Elevation is intentionally absent. The only shadow in the system is a 1px inset stroke (rgba(0,0,0,0.07) 0px 0px 0px 1px inset) used to create hairline separation on dark surfaces. Cards don't float — they sit on near-identical tones, differentiated only by the 1px border between Carbon and the slightly lighter Iron. This creates a flat, weightless feel appropriate for a creative tool that needs to stay out of the way of the work. If something needs to feel important, it gets a photograph, not a shadow.

## Surfaces

- **Graphite Canvas** (`#232426`) — Page background — the dominant working surface
- **Carbon** (`#121214`) — Card surfaces, sections, input fields
- **Obsidian** (`#000000`) — Deepest dark — full-bleed images, nav surface
- **Iron** (`#45464d`) — Elevated borders, inset strokes, the system's only 'raised' element

## Imagery

Photography is the hero: full-bleed, atmospheric, and moody. The signature treatment is interior spaces — rooms, studios, domestic environments — captured in dramatic colored light (the green-tinted room in the hero is characteristic). Photography is high-key in color but low-key in contrast, creating a cinematic, almost editorial feel. Images are edge-to-edge with 4px radius or no radius at all, never contained in rounded cards. Product screenshots and illustrations are absent — the photography IS the product communication. The visual density is image-heavy at the hero level, transitioning to text-dominant in body sections.

## Layout

Full-bleed layout with no content max-width constraint — the nav, hero, and footer all span the full viewport. The hero is a single full-bleed photograph with left-aligned text overlaid in the lower-left quadrant, following a classic editorial pattern. Body content sits centered or left-aligned within the full-width canvas. The promotional banner at the very top is a separate full-width band. Section rhythm is spacious — 80px between major sections, with breathing room around photography. Navigation is a dark sticky top bar with a separated promotional strip above it. The grid is not rigidly columnar at the page level; content blocks are positioned with generous margins, and the only grid structure appears in card clusters and feature lists.

## Similar Brands

- **Spotify** — Dark-mode media platform with a near-monochrome palette and a single green accent — the same rationed-color approach where the product (audio) is the only loud element
- **Bandcamp** — Dark music marketplace with editorial typography and full-bleed album photography — similar weightless surface treatment with hairline separation instead of shadows
- **Native Instruments** — Music production tools with dark UI, condensed type, and minimal chrome — the same professional-tools-meets-creative-tool balance
- **Ableton** — Dark-mode creative software with weightless surfaces and photography-led marketing — the same philosophy of letting the medium (sound/light) do the visual heavy lifting
