# CQCM — Style Reference
> Verdant cooperative megaphone. A vivid green slab screams a civic message across a white grid while black pill buttons ground the chromatic energy.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

CQCM radiates civic confidence through oversized uppercase display type, vivid flat chromatic blocks, and generous white space. A custom wide-tracked display face (Athletics) gives French institutional weight, while Manrope handles reading at human sizes with slightly opened tracking. Black pill buttons are the only filled action element — every other color is a decorative block, not a control. The palette is unapologetically chromatic: a dominant electric green for the hero and key stats, a saturated blue for news surfaces, a coral orange for data emphasis, and a pale mint for quiet card surfaces. Dot patterns and circular image cutouts soften an otherwise orthogonal, grid-heavy layout. The overall feel is a Quebec cooperative movement's visual identity — bold, optimistic, and declarative without ever feeling corporate.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cooperative Green | `#44d991` | Hero panel fill, primary stat block, decorative dot overlays — the loudest brand voice; the color that makes the page feel activated |
| Civic Blue | `#4c92e9` | News card surfaces, secondary stat blocks — chromatic but cooler, reserved for media/content contexts rather than primary brand expression |
| Sunset Coral | `#ff6a51` | Accent stat block only — appears once as data emphasis, treated as a single-note punctuation rather than a system color |
| Mint Whisper | `#eaf9f2` | Card and nav surface tint — a barely-there green echo of the hero green, softens white space without breaking the light theme |
| Ink Black | `#000000` | Primary text, pill button fill, all borders and dividers — does the structural work of the system, the only color used for controls |
| Paper White | `#ffffff` | Page canvas, text on filled buttons, image surfaces |
| Steel Gray | `#666666` | Muted helper text, secondary nav borders — the only mid-gray in the system, used sparingly for de-emphasis |

## Typography

### Athletics — Display and badge type — used for hero headlines (48–78px), card labels, and uppercase tags. The wide letter-spacing (0.04em) is a French institutional signature that turns every headline into a civic declaration. Custom face; substitute with Archivo Black, Anton, or Druk for similar uppercase weight and tracking, or with a wide-tracked geometric like Bebas Neue for closer feel.
- **Substitute:** Archivo Black, Anton, or Druk Wide
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 16px, 22px, 48px, 59px, 78px
- **Line height:** 1.00
- **Letter spacing:** 0.04em at 22px and above (≈1.88px at 48px, ≈2.36px at 59px, ≈3.12px at 78px); 0.004em at 16px and below

### Manrope — Body, navigation, button labels, and small text — the working font. Slightly opened tracking (0.01–0.011em) is a subtle departure from default; it keeps dense French text feeling breathable without becoming display-like. Pairs cleanly with Athletics because both share geometric, humanist proportions.
- **Substitute:** Manrope (Google Fonts)
- **Weights:** 400
- **Sizes:** 12px, 14px, 16px, 18px, 20px, 22px
- **Line height:** 1.00, 1.30, 1.40
- **Letter spacing:** 0.01em at 12–18px, 0.011em at 20–22px (≈0.12–0.24px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.3 | 0.12px |
| body-sm | — | — | 14px | 1.3 | 0.14px |
| body | — | — | 16px | 1.4 | 0.16px |
| subheading | — | — | 18px | 1.3 | 0.18px |
| subheading-lg | — | — | 20px | 1.3 | 0.22px |
| heading-sm | — | — | 22px | 1 | 0.88px |
| heading | — | — | 48px | 1 | 1.92px |
| heading-lg | — | — | 59px | 1 | 2.36px |
| display | — | — | 78px | 1 | 3.12px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **cards:** 8px
- **badges:** 4px
- **images:** 4px
- **buttons:** 100px

## Components

### Hero Green Panel
**Role:** Primary brand surface — declares the organization's mission at full volume

Solid #44d991 fill, no border, no shadow. Contains an uppercase Athletics headline at 48–78px, weight 500, letter-spacing 0.04em, color #000000. Black pill button (100px radius) sits at the bottom-left of the panel with 10px 20px padding. The panel occupies the full right half of the hero on desktop and stacks below the image on mobile.

### Pill Button (Filled)
**Role:** Primary action — the only filled button variant in the system

Background #000000, text #ffffff, Manrope 14–16px weight 400, letter-spacing 0.01em, uppercase. Border-radius 100px (full pill). Padding 10px 20px. No hover state change specified beyond color shift. Used for 'QUI SOMMES-NOUS', 'DÉCOUVRIR LE MOUVEMENT', 'LIRE', and 'PLUS' controls.

### Pill Button (Ghost)
**Role:** Secondary navigation — for less prominent calls

Background #ffffff, border 1px #000000, text #000000, Manrope 14px, uppercase. Border-radius 100px. Padding 10px 20px. Used for the 'PLUS' nav item in the top bar.

### Circular Image Frame
**Role:** Signature image treatment — softens the grid-heavy layout

Image cropped to a perfect circle (border-radius 50%), 4px subtle edge. Sits centered in a blue (#4c92e9) card surface. Diameter varies with context (approximately 240–280px). The circle shape is the only non-rectangular geometry in the system and is reserved for imagery.

### Dot Pattern Overlay
**Role:** Decorative brand texture on hero imagery

Grid of solid #44d991 circles overlaid on the hero photograph. Dots are uniform size (~30px), arranged in a regular grid, partially bleeding off the image edges. Not a component to be reused structurally — it is a single brand artifact on the hero image only.

### News Card
**Role:** Content card for articles, communiqués, and nouvelles

Background #4c92e9 (Civic Blue) on the upper image area, #ffffff on the lower text area. Border-radius 8px. No shadow. Contains a circular image frame at top, a tag badge (COMMUNIQUÉ / NOUVELLES) in uppercase Athletics 12px, a date in Manrope 12px #666666, a headline in Manrope 16–18px weight 400 #000000, a short description in Manrope 14px #000000, and a black pill 'LIRE' button at the bottom. Padding 20px on the text section.

### Stat Block
**Role:** Large data display — one color per metric, stacked for rhythm

Solid chromatic fill (rotates through #44d991, #eaf9f2, #4c92e9, #ffffff, #ff6a51) per block. Border-radius 8px. Padding 20px. Number in Athletics 48–78px weight 500 letter-spacing 0.04em, #000000. Vertical label in uppercase Athletics 12–14px #000000, rotated or stacked beside the number. Blocks are offset vertically to create a staircase composition.

### Category Tag
**Role:** Content classification — COMMUNIQUÉ, NOUVELLES, etc.

Background #ffffff, text #000000, uppercase Athletics 12px weight 400 letter-spacing 0.04em. No border, no radius (square corners) or 4px radius. Inline with a date in Manrope 12px #666666. Padding 0 or 7px vertical, 10px horizontal.

### Top Navigation Bar
**Role:** Primary site navigation

Background #ffffff, no border or a 1px #000000 bottom border. Logo (CQCM wordmark with green geometric mark) at the far left. Nav items in Manrope 14px weight 400 #000000, uppercase, separated by 20–30px horizontal gap. 'PLUS' ghost pill button at far right. Padding 15–20px vertical, 40px horizontal.

### 'See All' Link
**Role:** Section-level navigation — to full listings

Text link with a small black filled circle bullet to the left of the label. Label in uppercase Athletics 12px #000000 letter-spacing 0.04em. No underline. Used as the right-aligned companion to section headings like 'À LA UNE'.

### Section Heading
**Role:** Top-of-section title — minimalist and structural

Text in Manrope 22–24px weight 400 #000000, mixed case (e.g. 'À LA UNE'). Left-aligned. No decorative underline or accent — the type weight and size alone carry the section identity. Pairs with the 'See All' link to the right.

### Hero Image Panel
**Role:** Left half of the hero — photography with brand dot overlay

Full-bleed photographic image (a smiling person in this case). No border-radius. Overlaid with the #44d991 dot pattern. The image extends to the left edge of the viewport and meets the green panel with no gap.

## Do's and Don'ts

### Do
- Use Athletics 400–500 for all display and badge text with letter-spacing 0.04em — the wide tracking is the brand's typographic identity, not a stylistic option
- Set pill buttons at 100px radius with #000000 fill and #ffffff text in 14–16px Manrope, uppercase
- Reach for #44d991 (Cooperative Green) as the dominant chromatic surface — hero, stat blocks, and decorative dots — not for buttons or text accents
- Crop images to circles inside blue (#4c92e9) news cards; reserve the circle shape for imagery only
- Stack stat blocks in a 5-block staircase with ~30px vertical and horizontal offset between each
- Use #eaf9f2 (Mint Whisper) for soft card and nav surfaces when white feels too clinical
- Separate nav items with 20–30px horizontal gap; keep the nav a single non-sticky white bar

### Don't
- Do not use any chromatic color as a button fill — buttons are always #000000 or outlined; color is for surfaces and decoration only
- Do not add shadows to cards, buttons, or content — the system is flat by design; the only shadow is the nav bar's soft halo
- Do not mix Athletics into body copy or Manrope into hero headlines — the font split is strict: Athletics displays, Manrope reads
- Do not use letter-spacing tighter than 0.01em on Manrope or 0.04em on Athletics — the opened tracking is part of the brand's breathable French-institutional feel
- Do not use coral (#ff6a51) more than once per surface — it is a single-note punctuation, not a system color
- Do not use square corners on buttons — pill shape (100px) is the only button geometry; cards get 8px, small elements get 4px
- Do not introduce gradients, blurs, or glass effects — the system is unapologetically flat, saturated, and solid

## Elevation

- **Navigation bar:** `rgba(0, 0, 0, 0.1) 0px 0px 20px 0px`

## Surfaces

- **Paper** (`#ffffff`) — Page canvas, default reading surface
- **Mint** (`#eaf9f2`) — Soft card surface, quiet nav fill, feature panel background
- **Civic Blue** (`#4c92e9`) — News and media card surfaces, chromatically distinct content layer
- **Cooperative Green** (`#44d991`) — Hero panel, stat blocks, brand-dominant content surfaces
- **Sunset Coral** (`#ff6a51`) — Single data-emphasis block, used once for accent stat

## Imagery

Imagery is photographic, human-centered, and tightly cropped — close-up portraits and candid workplace moments, never staged stock photography. Treatment is high-key and natural-light, full-color, with no filters or duotone. The signature visual treatment is the green dot grid overlaid on the hero portrait; subsequent images appear as circular cutouts inside blue card surfaces. The system avoids decorative illustration entirely — it is a photography-and-typography system, not an illustration system.

## Layout

The page is max-width 1280px contained, with a strong split-hero pattern: photograph left, solid green panel right. Below the hero, sections flow as full-width bands separated by 60–80px vertical gaps. The stats section uses an offset staircase of chromatic blocks (5 blocks, each shifted ~30px down and to the right) — this is the page's signature compositional move. News and feature sections use a 3-column card grid with 20px gutters. The navigation is a single top bar, not sticky, with a clean white background. Content density is comfortable — sections breathe, never feel packed. The overall rhythm alternates between solid chromatic blocks (green hero, blue news cards, multicolor stat stack) and white reading surfaces, creating high-contrast visual punctuation without literal dividers.

## Similar Brands

- **Greenpeace** — Same activist-institutional confidence with a single dominant chromatic color (vivid green) used as a brand surface rather than an accent
- **Sunrise Movement** — Civic-movement identity that pairs electric chromatic blocks with bold uppercase display type and generous white space
- **Khan Academy** — Multicolor data-block compositions and a comfortable, educational-institution density with flat saturated fills
- **Mailchimp (pre-2020 rebrand)** — Brave chromatic surfaces (yellow, blue, green) used as full panels, with a custom display face and minimal shadow elevation
