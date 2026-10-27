# OPX Studio — Style Reference
> Dark gallery monolith — a near-black exhibition hall where monumental white type and full-bleed photography do all the talking, and borders whisper at #292a2c.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

OPX Studio operates as a black void gallery: a near-pure #020202 canvas where the only voices are stark white type and full-bleed project photography. The system is aggressively monochrome — zero brand color, zero accent, zero semantic hues — letting the project imagery provide all visual variation. Typography is the sole brand signature: a single-weight (400) custom display face (OPX-Medium) scales from 18px body text to 111px editorial statements with extremely tight leading, giving the page a typographic confidence that fills the dark space. Components are flat, borderless on canvas, and rely on hairline #292a2c dividers and white-stroke pill buttons (45px radius) rather than shadows or fills. Navigation reduces to two words ("Projects", "Studio") set as oversize display type — the page itself is the brand mark. Generous 100–200px vertical breathing room between sections reinforces a slow, editorial pace rather than a dense product feel.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#020202` | Page canvas — the base background across all sections |
| Surface Black | `#000000` | Section surfaces and image containment backgrounds, barely distinguishable from canvas to keep elevation flat |
| Charcoal Hairline | `#292a2c` | Structural dividers and borders — the only mid-tone in the system, carrying 900 occurrences as the skeleton between sections and elements |
| Bone White | `#ffffff` | Primary text, nav labels, project titles, and 1px pill-button borders — the sole signal of interactivity |
| Ash Gray | `#9b9b9b` | Muted helper text and secondary metadata in footer and supporting copy — recedes against the void |

## Typography

### OPX-Medium — Primary brand display and text face — a single weight (400) scaling across body, nav, subheadings, and monumental display. Custom face with a humanist-geometric tension; the anti-convention of using weight 400 (not bold) at 111px display size lets the headline dominate through scale alone rather than visual weight
- **Substitute:** Söhne, Inter, or a custom neo-grotesque like ABC Diatype Mono
- **Weights:** 400
- **Sizes:** 18px, 20px, 26px, 35px, 50px, 80px, 111px
- **Line height:** 1.00–1.73 (tightens inversely with size: 1.00 at 111px, 1.73 at 18px)

### Open Sans — Secondary supporting copy — used in hero subtext and longer descriptive passages where a more relaxed, open-licensed humanist is desired
- **Substitute:** Source Sans 3, Noto Sans
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.67

### Untitled — Small label text for pill buttons and tag-like links (e.g. "View case study") — the only weight-500 usage in the system, giving micro-UI slightly more presence
- **Substitute:** Inter, Söhne
- **Weights:** 500
- **Sizes:** 14px
- **Line height:** 1.67

### Helvetica — System fallback for incidental body text and metadata
- **Substitute:** system-ui, Arial
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.67

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.67 | — |
| body | — | — | 18px | 1.67 | — |
| subheading | — | — | 20px | 1.67 | — |
| heading-sm | — | — | 26px | 1.42 | — |
| heading | — | — | 35px | 1.4 | — |
| heading-lg | — | — | 50px | 1.38 | — |
| display | — | — | 80px | 1.07 | — |
| display-xl | — | — | 111px | 1 | — |

## Spacing & Layout

**Density:** comfortable

- **Section gap:** 100-200px
- **Element gap:** 30px

### Border Radius

- **cards:** 0px
- **links:** 45px
- **images:** 0px
- **buttons:** 45px

## Components

### Display Navigation Link
**Role:** Primary top-bar nav item ("Projects", "Studio")

OPX-Medium 400 at ~26–35px in #ffffff, left-aligned in nav container, set with 50px vertical padding. No underline, no active state styling — navigation is a typographic gesture, not a control.

### Editorial Hero Headline
**Role:** Opening statement on the home canvas

OPX-Medium 400 at 80–111px in #ffffff, line-height 1.00–1.07, left-aligned with 50–100px page padding. Uses weight 400 (not bold) — authority through scale and tightness, not weight. Sits in generous 200px top padding against the #020202 void.

### Featured Project Block
**Role:** Single full-bleed project case study (e.g. KB&Co)

Full-width photograph (no border, no radius) occupying the visual center, followed by 20px gap, then project title in OPX-Medium 400 at ~26–35px #ffffff, then 30px gap, then a 'View case study' pill button. Image bleeds to container edges.

### Project Card (Grid Item)
**Role:** Individual case study tile in the 3-column project grid

Full-bleed photograph (0px radius) filling the card width, 30px gap, then OPX-Medium 400 at ~20–26px #ffffff for the project title, 15px gap, then a pill 'View case study' button. Cards have no visible border or background — they are defined by the image and the void around them.

### Pill CTA Button ('View case study')
**Role:** Primary call-to-action linking to a case study

1px solid #ffffff border, transparent fill on #020202 canvas, 45px border-radius (pill-like), padding 7px vertical × 15px horizontal. Label in Untitled 500 at 14px #ffffff. The button is outline-only — no filled state exists in the system.

### Section Heading
**Role:** Mid-page editorial section titles

OPX-Medium 400 at 35–50px in #ffffff, line-height 1.38–1.40, left-aligned, with 30px gap to following content. No decorative elements — pure type.

### Footer Column Block
**Role:** Structured contact and meta information at page bottom

3-column grid of text blocks. Each column starts with a 18–20px OPX-Medium 400 #ffffff label (e.g. 'OPX Studio', 'Project enquiries', 'Social'), then 20px gap, then body lines in OPX-Medium 400 at 18px #9b9b9b (muted).

### Body Paragraph
**Role:** Supporting descriptive copy

Open Sans or OPX-Medium 400 at 18px, line-height 1.67, #ffffff. Relaxed leading for readability against the dark canvas — contrasts with the display text's tight leading.

### Social/External Link
**Role:** Footer or inline outbound link

OPX-Medium 400 at 18px in #9b9b9b, no underline by default. On hover or context: shifts to #ffffff. Sits inline within body text without a bullet or icon.

### Section Divider
**Role:** Horizontal separator between major content bands

1px solid #292a2c hairline spanning full width. The only structural separator in the system — replaces shadows, fills, and whitespace demarcation. Spans appear between the hero, featured project, project grid, and footer.

## Do's and Don'ts

### Do
- Use OPX-Medium 400 at 80–111px for display headlines with line-height locked at 1.00–1.07 — never bold the display
- Apply the #292a2c 1px hairline as the only divider between sections and around interactive elements
- Set all CTA buttons as 1px white-stroke pills at 45px radius with 7px/15px padding — no filled buttons
- Let photography fill its container edge-to-edge at 0px radius — never frame or round project imagery
- Maintain 100–200px vertical padding between major sections to preserve the editorial pacing
- Use #9b9b9b exclusively for muted metadata and helper text; reserve #ffffff for all primary content
- Keep the navigation to two-word labels set in OPX-Medium — the page is the navigation

### Don't
- Do not introduce a brand color, accent, or gradient — the system is monochrome by design
- Do not use box-shadows, glows, or any drop-shadow elevation
- Do not bold the display type — authority comes from size (80–111px), not weight
- Do not round the project imagery or apply a card background — images sit on the void directly
- Do not use #9b9b9b on a #ffffff surface — it fails contrast (2.8:1); it's only valid on the dark canvas
- Do not add icons, bullets, or decorative glyphs to the nav or links — type is the only ornament
- Do not tighten body line-height below 1.67 — the relaxed leading is the only counterpoint to the display text's compression

## Elevation

- **All elements:** `none — the design system deliberately avoids box-shadows`

## Surfaces

- **Void Canvas** (`#020202`) — Base page background — the entire site sits on this near-black
- **Surface Black** (`#000000`) — Section bands and image containers — nearly identical to canvas; elevation is implied by content rather than tonal shift
- **Hairline** (`#292a2c`) — 1px structural dividers between sections and around interactive elements — the only visual layering device

## Imagery

Photography and 3D-rendered product/device shots dominate the visual language. Project tiles are full-bleed editorial photography — hands holding devices, lifestyle objects, designed products in context. Treatments are diverse per project (moody dark product photography, saturated color brand campaigns, natural-light lifestyle) but always presented at full scale without overlay text or treatments. The images are the only source of color in the entire system. Icons are absent from the navigation and UI; the two-word nav labels ("Projects", "Studio") function as the icon system. Decorative graphics: none.

## Layout

Edge-to-edge dark canvas with no maximum content width — sections bleed to the viewport edges while internal type holds generous left padding (50–100px). Hero is a centered-or-left-aligned display headline over the void, no hero image. Featured project is a single full-width photographic block followed by a 3-column project grid (3 tiles per row, equal width, equal gap). Footer is a 3-column text block (address / enquiries / social + tagline). Section rhythm is monolithic: 100–200px vertical breathing room between bands, separated by #292a2c hairlines. Navigation is a minimal two-item top bar, not a full menu — the page itself does the navigation work. No sidebar, no mega-menu, no sticky behavior implied. Overall density is sparse and editorial, not product-dense.

## Similar Brands

- **Pentagram** — Same editorial-agency monochrome dark mode, oversize display type as the only ornament, and photography-led project tiles with no card chrome
- **Resn** — Edge-to-edge full-bleed project photography on near-black canvas with minimal typographic navigation
- **Manual (manual.tv)** — Two-word navigation, monumental display type, and project-grid layout that lets the photography carry all the color
- **Locomotive (locomotive.ca)** — Dark agency homepage with custom single-weight display face, hairline dividers, and pill-outline CTAs
