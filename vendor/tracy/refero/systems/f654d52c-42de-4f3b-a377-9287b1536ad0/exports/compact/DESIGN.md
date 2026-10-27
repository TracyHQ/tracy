# NCDA — Style Reference
> Architectural monograph in negative space. The NCDA wordmark at 62px is cropped by the viewport edge, turning a logo into a wall.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

NCDA operates as a printed monograph translated to the web: paper-white canvas, a single near-black ink, zero chromatic noise, and type that does the structural work that color usually does. The signature move is the wordmark itself — rendered at architectural scale and cropped by the viewport edge, it turns the brand mark into a layout device rather than a logo. Navigation is reduced to essentials: a live dual-city clock in the corner, a single 'Menu' trigger, and a tight gray description block. The system alternates between vast white negative space and occasional full-bleed black bands, creating an exhibition-catalogue rhythm. Components are sparse and unornamented — no shadows, no rounded corners, no buttons — just hairline rules, generous margins, and type that whispers through tight negative tracking at display sizes and slightly positive tracking at caption sizes.

## Colors

| Name | Value | Role |
|------|-------|------|
| Onyx | `#191919` | Primary text, hairline borders, full-bleed dark surface bands — the near-black ink of the system |
| Pure Black | `#000000` | Secondary text fills, deepest borders, and image overlays where maximum contrast against white is required |
| Paper | `#ffffff` | Page canvas, surface backgrounds, inverse text on dark bands |
| Concrete | `#808080` | Secondary descriptive text, muted link borders, subdued meta-information — the gray of footnotes and captions |

## Typography

### TWK Everett — All interface and display type — a neo-grotesque with tall x-height and geometric openness. The sole weight (400) across the entire range from 11px captions to 62px display creates a monolithic typographic voice. At 62px it receives aggressive negative tracking (-0.05em) that pulls the letterforms into a continuous architectural band; at 11px it switches to slight positive tracking (+0.04em) for utilitarian legibility in timestamps and labels.
- **Substitute:** Neue Haas Grotesk Display, Inter, Helvetica Neue
- **Weights:** 400
- **Sizes:** 11px, 15px, 21px, 32px, 62px
- **Line height:** 0.80–1.44
- **Letter spacing:** -0.05em at 62px, -0.01em at 21–32px, +0.04em at 11px

### TWK Everett Mono — Monospaced companion for data and technical annotations — used sparingly in body contexts where tabular alignment or code-like precision is needed. Single size at 21px with -0.01em tracking.
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400
- **Sizes:** 21px
- **Line height:** 0.80
- **Letter spacing:** -0.0100em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.44 | 0.44px |
| body | — | — | 15px | 1.44 | -0.15px |
| subheading | — | — | 21px | 1.4 | -0.21px |
| heading | — | — | 32px | 1.35 | -0.32px |
| display | — | — | 62px | 0.8 | -3.1px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Section gap:** 64-150px
- **Card padding:** 0px
- **Element gap:** 15px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Architectural Wordmark Display
**Role:** Brand identity rendered as a full-width layout device

The 'NCDA' letterform set in TWK Everett Regular at 62px, line-height 0.80, letter-spacing -0.05em (#3.1px). The string is sized to overflow the viewport horizontally and is allowed to bleed off both edges — the crop is intentional. No margin, no padding, sits flush against the page boundaries. Color: #000000 on white, or #ffffff when placed on a #191919 band.

### Dual-City Live Clock
**Role:** Persistent header utility — time stamps in two zones

Two monospaced time displays in the top-left corner, formatted as 'HH:MM:SS CITY'. TWK Everett 11px, weight 400, letter-spacing +0.04em, color #000000. Separated by a horizontal gap of ~53px. The mono treatment and tabular spacing make the seconds tick without jitter.

### Menu Trigger
**Role:** Sole navigation element — top-right anchor

Plain text 'Menu' in TWK Everett 15px, weight 400, color #000000, no border, no background. Aligned flush to the right edge of the viewport. No icon, no chevron, no affordance decoration.

### Studio Description Block
**Role:** Identity statement on the landing canvas

Three-line paragraph set in TWK Everett 15px, line-height ~1.44, max-width approximately 400px. The studio name 'NC Design and Architecture Ltd.' is bolded or given a slight emphasis. Remainder in #808080 Concrete gray, with the brand name in #000000. Positioned in the upper-right quadrant, approximately 59px from the left edge of its column, creating a deliberate asymmetric counterweight to the cropped wordmark below.

### Full-Bleed Dark Band
**Role:** Section break / project image container

A 100vw × full-height band filled with #191919, no border, no radius, no shadow. Image or video content fills the band edge-to-edge. The transition from white to this band is abrupt — no gradient, no fade. Acts as a visual exhale between white pages.

### Hairline Rule Link
**Role:** Inline link or navigation divider

Text link in TWK Everett 15px, color #000000, with a 1px #808080 bottom border acting as underline. No hover state color change specified — the border is the link, not the text color.

### Time-Indexed Label
**Role:** Metadata / project reference tag

Small caption text at 11px in #808080, letter-spacing +0.04em, used for project numbers, dates, or category labels. No background, no border, no badge shape — just spaced gray type.

## Do's and Don'ts

### Do
- Use TWK Everett Regular (400) at every size from 11px to 62px — never introduce bold or medium weights, the single-weight system is the signature
- Set the wordmark or any display text at 62px with -0.05em letter-spacing and line-height 0.80 to create the continuous architectural band effect
- Apply +0.04em letter-spacing to all text at 11px and below — the positive tracking is what makes captions read as technical annotations rather than body type
- Crop type and imagery at the viewport edge — the bleed is structural, never add padding to prevent it
- Use #191919 Onyx for all borders and dark surface bands; reserve #000000 Pure Black for text fills where maximum contrast is critical
- Separate content sections with full-bleed #191919 bands — no gradients, no soft transitions between white and dark
- Keep interactive elements text-only — no buttons, no icons, no filled rectangles; use 1px #808080 hairline rules to indicate links

### Don't
- Do not introduce any chromatic color — the system is 0% colorfulness by design, any hue breaks the monograph language
- Do not add border-radius to any element — all corners are sharp 0px, rounded shapes would undermine the architectural print language
- Do not use drop shadows or elevation effects — depth comes from scale and negative space, not from shadow stacks
- Do not set body or paragraph type at 62px — that size is reserved for the wordmark and display headlines that function as layout architecture
- Do not use more than two type sizes on a single screen — the system relies on extreme size contrast (15px body vs 62px display), intermediate sizes dilute the rhythm
- Do not add icons, arrows, or decorative glyphs to the Menu trigger or any navigation — the plain text label is the entire affordance
- Do not center-align body text — left-align everything; centering is reserved for the wordmark, everything else hangs from a left edge

## Elevation

The system intentionally avoids all shadow and elevation effects. Depth and hierarchy are achieved exclusively through scale contrast (62px display against 15px body), color inversion (white pages alternating with #191919 bands), and negative space. No box-shadows, no blurs, no z-axis layering. The only 'elevation' is the literal dark band that interrupts the white page sequence.

## Surfaces

- **Paper White** (`#ffffff`) — Primary canvas — the page itself
- **Onyx Black** (`#191919`) — Full-bleed dark bands for project showcases and section breaks — image or video containers, not decorative

## Imagery

The visual language is type-first and textural rather than photographic. The hero is pure typography — no image, no illustration, no decorative element. The dark band functions as a container for project photography or video, but the photography itself is not visible in the provided frames. The expected treatment, based on the architectural-studio genre and the monochrome system, is high-contrast interior photography: sharp geometric compositions of spaces, materials, and light, presented uncropped and full-bleed within the #191919 bands. No illustrations, no abstract graphics, no icons visible in the interface. The wordmark itself is the primary visual asset.

## Layout

Full-bleed page with no max-width container. The hero section is an asymmetric composition: the studio description block sits in the upper-right quadrant (approximately 59px from its left edge, aligned to roughly the 45% mark horizontally), while the cropped 'NCDA' wordmark dominates the lower 60% of the viewport, bleeding off the left and right edges. The top edge holds a thin utility row: dual-city clock at top-left, Menu trigger at top-right, with vast white space between. Section rhythm alternates between white canvas pages and full-bleed #191919 dark bands — each band likely a project showcase or image set. Content within white pages is left-aligned and column-based rather than centered. Navigation is minimal: a single Menu trigger, no visible nav bar, no breadcrumbs, no footer structure visible in the frames.

## Similar Brands

- **Vitra** — Same architectural-monograph language: vast white space, monochrome type-driven layouts, full-bleed dark image bands, zero decorative color
- **M/M Paris** — Extreme typographic scale, cropped wordmarks, and gallery-catalogue negative space applied to a creative studio site
- **Pentagram** — Editorial minimalism with a single weight type system, hairline rules, and a full-bleed image grid that breaks white pages
- **Dieter Rams archive sites** — Swiss-design influence: sharp corners, no shadows, single-weight neo-grotesque type, and information density through spacing rather than decoration
- **Schiattarella Associati** — Architecture studio sites that lead with a massive cropped wordmark at display scale and let project photography carry the dark bands
