# Leonid Kostetskyi — Style Reference
> Wine-stained editorial gallery — oversized typographic statements floating on a white gallery wall, every mark a deliberate negative space.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Leonid Kostetskyi's site is a single-canvas editorial spread: a near-white gallery wall dominated by oversized Neue Haas Display headlines set in a muted dark-wine accent. The system runs on extreme contrast — one chromatic color (#472425, a desaturated oxblood) does all the brand work against pure white, with black and near-black handling secondary text and hairlines. Typography is the product: display faces reach 188px with negative tracking, sitting beside 8–15px uppercase utility labels. Spacing is expansive and editorial, with massive vertical breathing room between elements and no decorative ornamentation beyond one small radial starburst mark. The feel is Swiss-poster meets personal portfolio — confident, restrained, slightly austere, and unmistakably authored.

## Colors

| Name | Value | Role |
|------|-------|------|
| Oxblood | `#472425` | The singular chromatic identity — display headlines, nav links, body text, borders, and the active theme toggle. This muted dark-wine red carries all brand presence; the system is monochrome with this one warm, desaturated red as the only color |
| Paper White | `#ffffff` | Page canvas and card surfaces. The background that the typography sits on; it reads as gallery white, not pure technical white |
| Carbon Black | `#000000` | Secondary text, decorative borders, and structural hairlines. Used as the neutral companion to Oxblood when chromatic emphasis isn't needed |
| Graphite | `#121212` | Tertiary text and body borders. A softer near-black for inline content where pure black feels too harsh |
| Ash | `#999999` | Muted helper text, the inactive theme toggle label, and low-emphasis annotations |
| Crimson | `#e73737` | Red outline accent for tags, dividers, and focused UI edges. Use as a supporting accent, not as a status color |

## Typography

### Neue Haas Display — The display face used for the nameplate and role titles. Sits at 135–188px with tight negative tracking (-0.025em to -0.020em) — the oversized scale is the signature; there is no intermediate heading tier, just utility text and then this monumental display.
- **Substitute:** Inter, Helvetica Neue, or Suisse Int'l at matching weight
- **Weights:** 400
- **Sizes:** 11px, 12px, 15px, 27px, 135px, 143px, 165px, 188px
- **Line height:** 0.86–1.00
- **Letter spacing:** -0.0250em at 188px, -0.0200em at 135px

### SFUIDisplay — Body and utility type. Weight 300 whispers at body sizes for a quiet, label-like reading voice; weight 400 carries the uppercase tracked annotations (8–12px) that label sections and form microcopy. The narrow range (8–21px) confirms this is a system with two voices: monumental display or quiet label.
- **Substitute:** Inter, SF Pro Text, or system-ui
- **Weights:** 300, 400
- **Sizes:** 8px, 9px, 11px, 12px, 15px, 18px, 19px, 20px, 21px
- **Line height:** 1.00–1.60

### Arial — Rare fallback for button labels where the custom faces aren't available — not a designed choice, a system safety net.
- **Substitute:** system-ui
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.6 | — |
| body | — | — | 19px | 1.4 | — |
| subheading | — | — | 21px | 1.1 | — |
| heading | — | — | 27px | 1 | — |
| heading-lg | — | — | 135px | 0.86 | -2.7px |
| display | — | — | 165px | 0.86 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 200px
- **Card padding:** 12px
- **Element gap:** 16px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Nameplate Headline
**Role:** Primary identity statement — the personal name at hero scale

Neue Haas Display weight 400 at 165–188px, color Oxblood (#472425), letter-spacing -0.025em, line-height 0.86. Sits flush-left at the canvas edge. No other element competes at this scale.

### Role Display Title
**Role:** Professional title, secondary hero element

Neue Haas Display weight 400 at 135–143px, color Oxblood, letter-spacing -0.020em, line-height 0.86. Mirrors the nameplate in scale and treatment, creating a typographic diptych.

### Editorial Caption Block
**Role:** Small uppercase body annotation — manifesto or description copy

SFUIDisplay weight 300 at 11–12px, uppercase, color Oxblood, line-height 1.6. Tracks tightly, sits in narrow left-aligned columns beneath or beside the display type. The quiet voice that contrasts the monumental headlines.

### Top-Right Navigation
**Role:** Primary site navigation

Vertical stack of text links: Home, About, Projects, Awards, Contacts. SFUIDisplay weight 400 at 11–12px, color Oxblood, no bullets, no borders. Right-aligned, floats in the upper-right corner with the theme toggle below.

### Theme Toggle
**Role:** Light/dark mode switcher

Two stacked labels — DARK THEME (active option in Oxblood or Carbon) and LIGHT THEME (inactive in Ash #999999). SFUIDisplay weight 400 at 8–9px, uppercase. No checkbox, no switch UI — pure typographic toggle.

### Starburst Mark
**Role:** Decorative personal signature

Small radial line illustration (sun/starburst pattern) in Oxblood, approximately 40px diameter, placed in the lower-left near the editorial caption. The only illustration in the system — a visual autograph.

### Project Card
**Role:** Portfolio work tile

White surface with 1px border in Oxblood or Carbon Black, 12px internal padding, 0px radius. Image or content fills the frame; the border is the only container treatment. No shadow, no rounded corners.

### Hairline Divider
**Role:** Structural separation between content blocks

1px line in Oxblood (#472425) or Carbon (#000000), full-width or section-width. The primary mechanism for breaking up the white canvas.

### Inline Link
**Role:** Navigable text link within body copy

SFUIDisplay weight 400 at body size, color Oxblood, underline offset 2px or none. No button chrome — links live as chromatic words in a monochrome stream.

## Do's and Don'ts

### Do
- Use Oxblood (#472425) for all display headlines, nav links, and body text — it is the sole chromatic voice
- Set display type at 135–188px in Neue Haas Display weight 400 with -0.025em letter-spacing and 0.86 line-height
- Use SFUIDisplay weight 300 at 11–15px for body and caption copy; reserve weight 400 for navigation and active labels
- Maintain 200px minimum vertical gap between major sections to preserve the editorial gallery rhythm
- Separate content blocks with 1px Oxblood or Carbon hairlines — never with shadows, fills, or rounded containers
- Keep all corners square (0px radius) across cards, buttons, and inputs — the system has no soft edges
- Place the starburst mark once per page in the lower-left zone as a signature element

### Don't
- Never introduce a second chromatic color — Oxblood is the only hue, with Crimson reserved exclusively for hover/error states
- Don't use intermediate heading sizes between 27px and 135px — the system jumps from body text to monumental display with nothing in between
- Don't apply box-shadows, glows, or drop effects to any element — hierarchy comes from scale and space, not depth
- Don't round corners on cards, buttons, or images — 0px radius everywhere maintains the editorial sharpness
- Don't use color blocks or filled backgrounds behind text — content sits directly on white with hairline borders at most
- Don't center body copy or long-form text — the layout is flush-left and asymmetric, magazine-spread style
- Don't add decorative gradients, blurs, or atmospheric effects — the visual language is flat, printed, and graphic

## Elevation

No shadows. Elevation is expressed through generous negative space and 1px hairline borders in Oxblood or Carbon Black. Cards and content blocks sit flush on the white canvas — the system trusts typography and whitespace to create hierarchy rather than depth.

## Surfaces

- **Canvas** (`#ffffff`) — Full-bleed page background — the gallery wall
- **Card** (`#ffffff`) — Project cards and content blocks sit flush on the same white, separated only by 1px borders in Oxblood or Carbon

## Imagery

The system is overwhelmingly text-dominant. Imagery is not present in the hero or structural regions — the nameplate and role title ARE the hero. Where project work appears, it will be contained within square-cornered frames bordered by 1px Oxblood hairlines, sitting flush on white. The only decorative graphic is a small radial starburst line illustration in Oxblood, used once as a signature mark. Photography or project visuals, if introduced, should be treated as gallery prints: full-bleed within the card frame, no rounded corners, no overlays, no captions integrated into the image itself.

## Layout

Full-bleed editorial spread with no max-width container. The hero is a single screen composed of four zones: nameplate flush-left at 188px occupying the upper-left quadrant; vertical nav stack in the upper-right; a small uppercase manifesto caption in the lower-left; and a 135px role title ('CREATIVE DIRECTOR') flush-left in the lower-right. The composition is deliberately asymmetric — weight is distributed diagonally from upper-left (name) to lower-right (role). Section rhythm is built on 200px vertical gaps with 1px Oxblood hairlines marking transitions. Content blocks stack as full-width bands rather than columns; project work would be a single-column vertical flow. Navigation is minimal text links in the top-right corner, with a typographic theme toggle below. No sticky header, no sidebar, no card grids visible in the hero — the first screen is a typographic poster.

## Similar Brands

- **Tobias van Schneider** — Same oversized editorial typography as the sole hero element, single-color brand identity, and aggressive negative space
- **Pentagram partner sites** — Swiss-poster typographic approach with monumental name-as-headline and minimal color palette
- **Locomotive (agency portfolio)** — Editorial full-bleed spreads with display-scale typography and no card grids or conventional UI chrome
- **Arnold St. (creative director portfolio)** — Asymmetric single-screen compositions where the name and role title function as the entire page design
