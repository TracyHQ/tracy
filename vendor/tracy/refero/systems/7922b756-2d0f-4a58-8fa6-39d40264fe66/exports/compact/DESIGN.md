# COS — Style Reference
> white-walled fashion gallery

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

COS speaks in the visual grammar of a contemporary art gallery: vast white walls, oversized monochrome photography, and typography that stays out of the model's way. The interface is nearly colorless — 97% achromatic — using a near-black (#080808) on pure white (#ffffff) as the only structural contrast, with a single red (#c80000) held in reserve as a whisper-quiet accent for moments that must feel urgent without being loud. Spacing is generous and editorial, section padding reaches 135px, and components dissolve into the page: hairline borders at #dadada, no shadows, no gradients, no rounded corners. Typography (SuisseIntl) is the only ornament — a single grotesque family that stays consistent from 12px micro-labels to 35px category statements, tracking slightly positive to feel like printed gallery placards.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canvas White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Ink Black | `#080808` | Primary text, icons, links, navigation type, button borders, logo, footer text — softer than pure black so photography does not feel clipped against it |
| True Black | `#000000` | Hero text overlays on dark imagery, body copy, button labels — the true-zero black reserved for highest-contrast typographic moments |
| Mist Gray | `#dadada` | Hairline borders, input underlines, subtle dividers, disabled-state outlines — the quietest neutral, only visible by what it separates |
| Signal Red | `#c80000` | Red supporting accent for decorative details and low-frequency emphasis |

## Typography

### SuisseIntl — Sole typeface across the entire interface — used for navigation, body, headlines, buttons, and product copy. The positive tracking (0.01–0.04em) is unusual for a screen face and reinforces the printed-catalogue feeling; 700 weight is reserved for category statements, 500 for navigation and buttons, 400 for everything else. The single-family commitment and tiny size range (12–35px) is the signature — type never shouts.
- **Substitute:** Neue Haas Grotesk Display, Inter, Helvetica Neue
- **Weights:** 400, 500, 700
- **Sizes:** 12, 13, 16, 35
- **Line height:** 1.0 (micro-labels), 1.4 (small body), 1.45 (body), 1.5 (hero/headline)
- **Letter spacing:** 0.01em at 12px → 0.02em at 13px → 0.03em at 16px → 0.04em at 35px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | 0.12px |
| body | — | — | 16px | 1.5 | 0.48px |
| heading | — | — | 35px | 1 | 1.4px |

## Spacing & Layout

**Base unit:** 8px

**Density:** compact

- **Section gap:** 135px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 0px
- **badges:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Editorial Hero — Split Frame
**Role:** Above-the-fold brand statement for category landings (Mujer / Hombre)

Full-viewport 50/50 split between two large editorial portraits. No overlay chrome, no card containers. The only interface element is a single all-caps category label in SuisseIntl 35px weight 700, letter-spacing 0.04em, color #ffffff, anchored to the bottom-left of the left image (Mujer) — text is what floats, photography is what stays.

### Utility Announcement Bar
**Role:** Top-of-page promotional strip above the logo

Single thin black band at #080808, full-bleed, containing centered SuisseIntl 12px weight 400 in #ffffff with 1px top/bottom padding. Marquee-style scroll. No close button visible by default.

### Centered Logo Navigation
**Role:** Primary site header

Pure white background (#ffffff), COS wordmark centered in SuisseIntl 16px weight 500, letter-spacing 0.03em, color #080808. Locale selector right-aligned in same weight/size. No horizontal category bar on the landing frame shown — navigation is iconographic and minimal.

### Ghost Button — Outlined
**Role:** Secondary actions and account-creation CTAs

Transparent fill, 1px solid #080808 border, square corners (0px radius), 15px vertical / 24px horizontal padding. Label in SuisseIntl 12px weight 500, letter-spacing 0.01em, uppercase, color #080808. No hover fill change — ghost stays ghost, the border weight is the only signal.

### Newsletter Modal / Slide-In
**Role:** First-visit email capture

White card surface (#ffffff) anchored to bottom-right, ~360px wide, no border, no shadow — separated from page only by the empty space around it. Title in SuisseIntl 13px weight 700, body in 12px weight 400, both #080808. Close icon top-right. Outlined ghost button (#080808 border) as the sole action.

### Primary Nav Link
**Role:** Category and utility links in the header

Inline text, no underline, no background. SuisseIntl 13–16px weight 400–500, color #080808, letter-spacing 0.02–0.03em. Active state communicated by weight shift to 500 only — no color change, no underline, no pill.

### Product Card
**Role:** Category and product-listing grid items

Square or 3:4 photography fills the card edge-to-edge (no padding, no border). Product name and price sit immediately below the image in SuisseIntl 13px weight 400, #080808, line-height 1.45. No badge, no hover overlay, no quick-add — the card is a print, not a tile.

### Footer
**Role:** Site-wide link directory and legal

Inverted dark surface (#080808), generous vertical padding (~135px top/bottom). Column headings in SuisseIntl 12px weight 700 uppercase #ffffff, link lists in 13px weight 400 #ffffff. No dividers between columns — whitespace is the only separator, matching the overall system.

### Locale Selector
**Role:** Region/language picker in the top-right

Plain text trigger (e.g. 'ES/ES') in SuisseIntl 12px weight 400, #080808, with a small chevron. No flag icons, no decorative chrome. Opens to a text-only menu.

## Do's and Don'ts

### Do
- Use 0px border-radius on every button, card, input, and modal — squareness is the geometry of the brand.
- Reserve #c80000 for fewer than 2% of pixels on any given screen; it must read as punctuation, not decoration.
- Use SuisseIntl weight 700 only for category statements and section titles, weight 500 for navigation and buttons, weight 400 for body — the weight ladder is the entire hierarchy.
- Apply 135px top/bottom section padding for major editorial bands, 8–24px for in-component rhythm.
- Separate surfaces with whitespace and #dadada 1px hairlines, never with box-shadow or color fill.
- Let photography bleed full-bleed edge-to-edge; never wrap product imagery in padded cards with borders.
- Set letter-spacing positively: 0.01em at 12px, scaling up to 0.04em at 35px — the wider tracking at larger sizes is what makes headlines feel like gallery wall text.

### Don't
- Don't introduce gradients, drop shadows, or blur effects on any component — the system is flat by design.
- Don't round corners on buttons, inputs, or cards — 0px radius is non-negotiable.
- Don't use the red accent for primary CTAs, hover states, or button fills — it is reserved for error/promotional whisper moments.
- Don't add a second typeface family; SuisseIntl alone must carry both 12px labels and 35px headlines.
- Don't place text inside bordered cards with backgrounds; text floats directly on white or directly on photography.
- Don't add icons, badges, or quick-action overlays to product cards — the image is the product.
- Don't use saturated backgrounds for footer or modals; invert with #080808 and let #ffffff do all the work.

## Elevation

Elevation is deliberately absent. The system relies entirely on scale, whitespace, and hairline borders at #dadada to separate planes. Any shadow would break the gallery-wall metaphor — surfaces sit on the page the way a print sits in a matte, not the way a card floats above it.

## Surfaces

- **Canvas** (`#ffffff`) — Page background, full-bleed white ground
- **Ink Plane** (`#080808`) — Inverted sections (footer, promotional bars, occasional dark bands) where type inverts to white

## Imagery

Large-format editorial fashion photography dominates the page — full-bleed portraits and 3/4-length model shots in controlled studio lighting, predominantly neutral and desaturated with selective warm tones. Images are tight crops that fill their containers edge-to-edge with no rounded corners, no decorative masks, and no overlay frames. The two-up hero frame (MUJER / HOMBRE) is the signature pattern: two equally weighted portraits side by side, each anchored by a single bottom-left category label. Photography is treated like a gallery print — object-first, context-stripped, human-scaled, monochrome-leaning. No lifestyle scenes, no props, no textural backgrounds.

## Layout

Full-bleed page model — the canvas extends edge-to-edge with no max-width container, and content is anchored by image split ratios and whitespace rather than by a centered column. The hero is a 50/50 vertical split of two full-viewport-tall editorial portraits, a pattern so dominant it functions as the brand's structural signature. Below the hero, sections alternate between white-ground text blocks (centered, single-column) and additional full-bleed imagery. Vertical rhythm is spacious: 135px section padding creates museum-wall breathing room between bands. Navigation is a single thin white strip with a centered wordmark and a right-aligned locale selector — no horizontal category bar, no mega-menu visible in the primary frame. Information density is low: one statement per section, one image per idea.

## Similar Brands

- **Everlane** — Same editorial fashion-photography-dominant landing with monochrome white canvas and minimal text overlay
- **Toteme** — Same Scandinavian restraint: full-bleed model photography, zero rounded corners, near-black-on-white, single grotesque typeface
- **Arket** — Sibling-minimalist retail aesthetic with gallery-style layout, hairline-bordered UI, and image-as-section-divider approach
- **The Row** — Identical luxury-quiet palette: pure white, no chrome, serif-free grotesque, photography as the only ornament
