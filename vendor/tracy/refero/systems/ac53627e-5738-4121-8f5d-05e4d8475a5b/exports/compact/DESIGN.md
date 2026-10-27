# Bose — Style Reference
> Coastal soundstage. A wind-swept campaign image fills the frame while sharp black-and-white commerce controls sit like precision hardware around it.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Bose — coastal soundstage pairs commanding, condensed display type with expansive fashion-editorial photography and quiet white retail surfaces. Near-black #131317 carries nearly all interface weight, while white and #f8f8f8 keep product cards, navigation, and purchase controls deliberately spare. Large 900-weight Bose Headline titles sit low over immersive imagery; compact Bose Text and hairline rules handle the dense commerce layer without competing with the product.

## Colors

| Name | Value | Role |
|------|-------|------|
| Soprano White | `#ffffff` | Page canvas, header and footer surfaces, image-overlay text, bordered purchase controls |
| Studio Mist | `#f8f8f8` | Product-tile surfaces, category controls, search field, and pale action surfaces |
| Warm Porcelain | `#f1efee` | Quiet secondary navigation and transitional surface bands |
| Bass Black | `#131317` | Primary text, navigation, icons, hairline borders, dark purchase fills, and inverse badges |
| Countertenor Gray | `#b4bec7` | Announcement-strip field, subdued controls, and inactive control treatment |
| Steel Gray | `#949494` | Fine separators and low-emphasis form borders |
| Charcoal Helper | `#40464b` | Footer links, supporting links, and subdued utility text |
| Pure Black | `#000000` | Search and utility icon strokes, input text, and high-contrast micro-details |
| Quiet Placeholder | `#545454` | Search placeholder and inactive input copy |
| Chord Blue | `#005bff` | Inline learning links — a single electric-blue interruption in an otherwise monochrome retail interface |

## Typography

### Bose Headline — Condensed display voice for section titles and campaign headlines. The 900 weight at 60px and 96px is compressed vertically rather than made airy, making the headline read like a bold audio-equipment mark; the 400 weight supplies quieter 32px service headings.
- **Substitute:** Dosis
- **Weights:** 400, 900
- **Sizes:** 32px, 60px, 96px
- **Line height:** 0.88, 1.20
- **Letter spacing:** 0.96px at 32px, 1.2px at 60px, 1.44px at 96px

### Bose Text — Interface, product metadata, navigation, links, and campaign support copy. Regular 15px uppercase navigation stays restrained; 500-weight 16px labels and 24px campaign support text provide the controlled step-up beneath the headline.
- **Substitute:** Arial, Helvetica Neue, sans-serif
- **Weights:** 400, 500
- **Sizes:** 12px, 14px, 15px, 16px, 18px, 21px, 22px, 23px, 24px, 26px
- **Line height:** 1.00, 1.13, 1.14, 1.20, 1.33, 1.43, 1.50, 1.63, 1.71, 2.50
- **Letter spacing:** -0.32px at 16px, 0.16px at 16px, 0.70px at 14px, 0.80px at 16px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| microcopy | Bose Text | 400 | 12px | 1.33 | 0px |
| nav | Bose Text | 400 | 15px | 1.2 | 0px |
| body | Bose Text | 400 | 16px | 1.5 | 0px |
| button-label | Bose Text | 500 | 16px | 1.5 | 0px |
| body-strong | Bose Text | 500 | 18px | 1.5 | -0.36px |
| campaign-support | Bose Text | 500 | 24px | 1.5 | 0px |
| heading | Bose Headline | 400 | 32px | 1.2 | 0.96px |
| display | Bose Headline | 900 | 60px | 0.88 | 1.2px |
| hero-display | Bose Headline | 900 | 96px | 0.88 | 1.44px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 120px
- **Card padding:** 40px
- **Element gap:** 16px

### Border Radius

- **cards:** 0px
- **links:** 2px
- **pills:** 9999px
- **badges:** 88px
- **inputs:** 9999px
- **buttons:** 2px
- **iconButtons:** 100%

## Components

### Announcement Strip
**Role:** Full-width launch or collection message above the main header

Use Countertenor Gray #b4bec7 as a shallow full-width band with centered Bose Text at 12px/16px weight 400 in Bass Black #131317. Place a compact close icon at the far edge; keep the treatment flat with no radius or shadow.

### Utility Header
**Role:** Persistent public navigation and account utilities

Use a Soprano White #ffffff bar with Bass Black #131317 15px/18px uppercase Bose Text navigation. Center the Bose wordmark, keep navigation left-aligned and utility icons right-aligned, and separate the bar from content with a 1px rule rather than elevation.

### Pill Search Field
**Role:** Header product search

Set the field on Studio Mist #f8f8f8 with a 9999px radius and 16px vertical / 24px horizontal padding. Use Quiet Placeholder #545454 for placeholder copy and a Pure Black #000000 search icon; do not add a visible box shadow.

### Campaign Image Hero
**Role:** Full-width collection or product-story launch panel

Use uncropped-edge photography as the panel surface, with a darkened lower image area supporting Soprano White #ffffff copy. Set the campaign title in Bose Headline 96px weight 900, 84px line-height, 1.44px tracking; pair it with Bose Text 24px weight 500 at 36px line-height. Keep the panel square-cornered.

### White Hero Explore Button
**Role:** Image-overlay route into a featured collection

Use Soprano White #ffffff fill, Bass Black #131317 text and border, 2px radius, and 12px vertical / 24px horizontal padding. Set its label in uppercase Bose Text at 16px weight 500 with 0.8px tracking.

### Inline Hero Shop Link
**Role:** Secondary image-overlay destination beside the filled hero control

Render as transparent with Soprano White #ffffff uppercase text; use no padding and no radius. Pair it with a thin directional arrow and keep it visually lighter than the bordered white button.

### Trending Product Tile
**Role:** Carousel card for a purchasable product

Use a square-cornered Studio Mist #f8f8f8 surface with no shadow and 1px white separators between neighboring tiles. Product image occupies the upper field; product title, price, color label, swatches, badge, and rating remain in Bass Black #131317 below with compact 12px and 16px Bose Text.

### Product Status Badge
**Role:** Exclusive, availability, or preorder status

Use Bass Black #131317 fill with Soprano White #ffffff Bose Text, 88px radius, and 4px vertical / 12px horizontal padding. Keep badges compact and confined to product metadata.

### Outlined Product Purchase Button
**Role:** Product-card purchase route

Use Soprano White #ffffff fill with a 1px Bass Black #131317 border, Bass Black label, 2px radius, and 12px vertical / 24px horizontal padding. Use uppercase Bose Text at 16px weight 500 with 0.8px tracking.

### Product Color Swatch
**Role:** Selectable finish choice in product cards

Use circular 50% swatches inside a 50px padded Studio Mist #f8f8f8 disc treatment. Mark the selected finish with a 1px Bass Black #131317 ring; keep inactive outlines in Steel Gray #949494.

### Carousel Arrow Control
**Role:** Product rail navigation

Use a Soprano White #ffffff circular control with 100% radius and a 1px Bass Black #131317 border. Keep the arrow icon Bass Black #131317 and avoid filled dark circles.

### Feedback Edge Tab
**Role:** Persistent vertical feedback affordance

Use Bass Black #131317 as a narrow vertical tab fixed to the viewport edge with Soprano White #ffffff rotated label text. Keep corners at 0px and use no shadow.

## Do's and Don'ts

### Do
- Use Soprano White #ffffff as the default page canvas and Studio Mist #f8f8f8 for product-card fields.
- Set campaign display headlines in Bose Headline weight 900: 60px/53px with 1.2px tracking, or 96px/84px with 1.44px tracking.
- Set public navigation in uppercase Bose Text 15px/18px weight 400.
- Use Bass Black #131317 for primary text, icon strokes, 1px action borders, dark fills, and inverse badges.
- Use 2px corners for rectangular purchase controls and 88px or 9999px only for status badges and pill fields.
- Give product-card purchase controls 12px vertical and 24px horizontal padding.
- Use Chord Blue #005bff only for inline learning links; keep commerce controls monochrome.

### Don't
- Do not use rounded card corners; product and campaign panels use 0px card radii.
- Do not add drop shadows to cards, headers, search, or buttons; separate layers with #ffffff rules and surface changes.
- Do not replace Bose Headline with a wide geometric sans or use it below 32px.
- Do not make all buttons dark-filled; use Soprano White #ffffff bordered controls over imagery and product-card surfaces.
- Do not use Chord Blue #005bff as a filled action background.
- Do not introduce gradients into page surfaces or controls.
- Do not use Steel Gray #949494 for body copy; reserve it for fine borders and inactive outlines.

## Elevation

Surfaces remain flat: no card or header shadows. A 1px solid rule, a #ffffff gutter, or a shift from Soprano White #ffffff to Studio Mist #f8f8f8 establishes separation; this makes the product imagery and heavy condensed headlines carry the visual depth.

## Surfaces

- **Soprano White** (`#ffffff`) — Page canvas, header, footer, white overlay controls
- **Studio Mist** (`#f8f8f8`) — Product tiles, category controls, search field
- **Warm Porcelain** (`#f1efee`) — Secondary navigation and subdued transitional bands

## Imagery

Photography is the dominant expressive layer: fashion-campaign portraits and close product-worn scenes are tightly cropped, color-graded toward muted coastal neutrals or saturated studio backdrops, and used as large rectangular story panels. Hero images run edge to edge with copy directly over the darker lower portion; contained campaign panels use split-image compositions with no decorative frame. Product imagery is isolated against pale neutral tile backgrounds, with the object presented as the content rather than surrounded by illustration. Utility icons are thin, monochrome black outlines; imagery occupies more visual space than text in campaign sections, while product rails become information-dense below the image.

## Layout

The page is a white, centered retail composition framed by a slim announcement strip and a two-sided public header with the logo held at center. The first screen is a full-bleed photographic campaign panel with copy anchored in the lower left; subsequent content returns to broad white breathing room and square product-carousel tiles. Promotional stories repeat the same image-led pattern at a contained large scale, using side-by-side fashion photography with lower-left white copy rather than floating cards. Product browsing uses a four-column rail at the captured desktop view, with small pagination dots and circular next/previous controls below; footer content returns to a dense white utility zone.

## Similar Brands

- **Bang & Olufsen** — Large product photography, restrained monochrome commerce surfaces, and editorial image-first product storytelling.
- **Aesop** — Sparse retail chrome, narrow utility typography, and product presentation that lets photography and material surfaces dominate.
- **Nike** — Full-bleed campaign photography with oversized condensed headline type and direct white overlay controls.
- **Sonos** — White audio-retail canvas, isolated product imagery, thin monochrome controls, and dense product comparison metadata.
