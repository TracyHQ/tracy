# MAKR — Style Reference
> Museum vitrine for crafted leather. A quiet, paper-white gallery where warm-black ink labels float beneath large editorial photographs of leather objects held in hands or placed in landscapes, with one muted sage band as the only chromatic interruption.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

MAKR is an editorial e-commerce gallery for crafted leather objects, built on an almost completely achromatic palette where photography is the protagonist. A single near-gray banner tone (with a barely-there sage cast) punctuates the top announcement strip, while everything else — surfaces, text, dividers, links — lives in deep warm-black ink on paper-white. Typography is the Sohne neo-grotesque at its most restrained: small sizes, generous line-height, and positive tracking on uppercase labels read as gallery-wall text, not web UI copy. The layout is image-dominant, asymmetric, and museum-sparse: product objects are photographed on hands, in landscapes, in natural light, with tiny caption links beneath. Components are nearly invisible — underlined text links, ghost inputs, no shadows, no rounded buttons — letting the leather and the photography carry the brand weight.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian Ink | `#1c1717` | Primary text, all text links, body copy, headings, icon strokes, hairline borders across the entire UI. This is the load-bearing color — 17.7:1 on white, used for 5,000+ instances. Its very slight warm cast (not pure black) gives the entire interface a printed-catalog feel rather than a screen feel |
| Paper | `#ffffff` | Hairline borders, dividers, input outlines, and card edges on light surfaces. Do not promote it to the primary CTA color |
| Bone | `#f0f0f0` | Secondary surface for alternating sections, subtle panel backgrounds, and inline borders/separators. Creates the faintest warm-gray tier between paper-white and the sage announcement band |
| Eucalyptus Mist | `#a9aea9` | Top announcement banner background, muted section washes, tertiary border. Reads as near-gray in isolation but carries a barely-perceptible sage cast when used full-width — a single chromatic breath in an otherwise monochrome system |

## Typography

### Sohne Web — The entire interface voice — body, nav, links, headings, buttons, inputs, badges, image captions. Sohne at 400 only (no bold weights detected) gives MAKR its whisper-quiet authority: information is communicated through size and tracking, never through weight contrast. Substitute: Inter, Söhne, or Untitled Sans.
- **Substitute:** Inter, Untitled Sans, or Neue Haas Grotesk
- **Weights:** 400
- **Sizes:** 11, 12, 13, 14, 16, 18, 20, 32px
- **Line height:** 1.15, 1.35, 1.40, 1.45, 1.80
- **Letter spacing:** 0.0150em, 0.0300em

### CircularXXMonoWeb — Reserved for rare technical or product-spec callouts — a monospaced whisper that breaks the neo-grotesque rhythm. Use sparingly: a product code, a material specification, nothing more. Substitute: JetBrains Mono or IBM Plex Mono.
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400
- **Sizes:** 13, 20px
- **Line height:** 1.15
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.35 | 0.33px |
| body-lg | — | — | 14px | 1.45 | 0.21px |
| heading-sm | — | — | 18px | 1.45 | 0.27px |
| heading | — | — | 20px | 1.15 | 0.3px |
| display | — | — | 32px | 1.15 | 0.48px |

## Spacing & Layout

**Base unit:** 6px

**Density:** compact

- **Section gap:** 80-120px
- **Card padding:** 12px
- **Element gap:** 5-8px

### Border Radius

- **cards:** 0px
- **inputs:** 0px
- **modals:** 0px
- **banners:** 0px
- **buttons:** 0px

## Components

### Top Announcement Banner
**Role:** Full-bleed sage band promoting sales or new releases

Full-width strip spanning the entire viewport, background #a9aea9 (Eucalyptus Mist), text in #1c1717 (Obsidian Ink) at 13–14px Sohne weight 400, centered. Three columns of text: a label (

### Minimal Header Navigation
**Role:** Primary site navigation and utility links

White (#ffffff) bar over the announcement strip. Logo \"MAKR\" left-aligned in 13–14px uppercase Obsidian Ink. Nav items (Shop, Info, Journal) left-of-center, Search/Account/Cart right-aligned, all as text-only links in Sohne 400. No background fills, no borders, no icons. Vertical padding ~12–16px. The entire nav reads as a printed colophon, not a web navbar.

### Text Link (Underlined)
**Role:** Default interactive text element used for navigation, product CTAs, and inline references

Obsidian Ink (#1c1717) at body sizes (12–16px), Sohne 400, with a 1px underline by default. On hover, the underline can thicken or the text can become the sage accent #a9aea9. This is the primary action style for the entire site — there are no filled CTA buttons.

### Newsletter Subscription Modal
**Role:** Email capture overlay shown on first visit

Fixed-position panel, bottom-left corner. White (#ffffff) or near-white surface with no shadow, no border, no radius. Heading in 13–14px Sohne 400 Obsidian Ink, email input below as a single bottom-bordered line (1px Obsidian Ink border-bottom), placeholder \"your@email.com\" in muted gray. Submit button is a text link \"SUBMIT\" in uppercase 12–13px with positive tracking, no background fill. Close (×) icon top-right in 14px Obsidian Ink.

### Email Input Field
**Role:** Text input for email capture and other form fields

Transparent background, 1px bottom border in Obsidian Ink (#1c1717), no left/right/top border, no radius. Padding: ~1px top/bottom, ~2px left/right (extremely compact). Placeholder text in a muted gray. Font: Sohne 400 at 13–14px. The input is a single ruled line on the canvas, echoing a form field in a printed catalog.

### Text Submit Button
**Role:** Form submission trigger styled as plain text

Uppercase Sohne 400 at 12–13px, Obsidian Ink, letter-spacing 0.0300em, no background, no border, no radius. Sits inline with the input field. Padding: 12px horizontal, ~6px vertical. On hover, the text becomes the sage #a9aea9 or shifts to a 2px underline.

### Bottom Subscription Bar
**Role:** Persistent site-wide promotional strip with dismiss

Thin full-width white bar at the very bottom of the viewport. Single line of centered uppercase text in 11–12px Sohne 400 Obsidian Ink, letter-spacing ~0.0300em. Close (×) icon right-aligned in 14px. No background fill, no border-top (or a 1px hairline in #f0f0f0).

### Editorial Product Image Grid
**Role:** Primary content display for products and journal stories

Multi-column image grid (typically 2–3 columns on desktop) with zero gaps or very small gaps between images. Images fill their grid cells edge-to-edge with no radius, no borders, no shadows. Mix of black-and-white product-on-hands photography and full-color lifestyle shots. Captions are placed below in the white margin, not overlaid on images.

### Product Caption Link
**Role:** Short descriptive link beneath a product image

Obsidian Ink 12–13px Sohne 400, centered or left-aligned beneath the image, with an underline. Example pattern: \"Zip Luxe 'V' Now Available in Black and Bark Chromexcel\" followed by a second-line text link \"Shop Bags and Totes\" as a secondary action. The product name uses no special styling — only the second-line action is underlined.

### Lifestyle Photography Block
**Role:** Full-bleed editorial imagery for product stories

Full-width images at natural aspect ratios, no radius, no border, no overlay. Photographed in warm natural light with muted earth tones. May be paired with a single line of caption text in the white space below. Images do the storytelling; UI chrome stays out of the way.

### Black-and-White Product Photography
**Role:** Tight object shots used in product grids

High-contrast monochrome photographs of leather objects held in hands or placed on neutral surfaces. Cropped tight to the object, often square or 3:4. No color treatment, no duotone — pure grayscale. The juxtaposition with full-color lifestyle shots creates the system's only visual rhythm.

### Close (×) Icon Button
**Role:** Dismiss control for modals, banners, and overlays

Simple × glyph in 14px Obsidian Ink, no background, no border, no radius. Click target should be padded to ~24px. Used in the newsletter modal, bottom bar, and any dismissible overlay.

## Do's and Don'ts

### Do
- Use #1c1717 (Obsidian Ink) for all text, borders, icons, and interactive elements. It is the only structural color besides white.
- Set all type in Sohne 400 — never use a bold weight. Create hierarchy through size (11–32px) and tracking (0.0150em–0.0300em), not weight.
- Use #a9aea9 (Eucalyptus Mist) sparingly as a full-bleed banner background only. It is the system's single chromatic moment — do not use it for text, small accents, or inline elements.
- Style every interactive element as an underlined text link. Filled buttons do not exist in this system.
- Render form inputs as 1px bottom-border lines on a transparent background. No boxed inputs, no rounded fields.
- Photograph products tight to the object in natural light. Use a 2:3 or square crop with no overlays, no borders, and no radius.
- Maintain generous vertical breathing room (80–120px) between editorial sections so the layout reads as a gallery, not a feed.

### Don't
- Do not introduce bold, semibold, or any weight above 400. The system communicates through restraint, not volume.
- Do not add shadows, elevation, or z-axis depth. Surfaces are flat, separated by whitespace and the occasional hairline border.
- Do not use rounded corners on any component — inputs, modals, cards, and banners are all 0px radius.
- Do not use color for hover or active states. Use underline thickness, text color shift to #a9aea9, or opacity changes only.
- Do not add icons, badges, tags, or decorative chrome inside product photography. The image is the content.
- Do not introduce new accent colors. The system is monochrome ink-on-paper with one sage band. Any additional hue breaks the gallery language.
- Do not overlay text on product imagery. Captions, links, and labels always live in the white margin below the image.

## Elevation

MAKR uses no shadows and no z-axis elevation. Surfaces are separated exclusively by whitespace, hairline borders, and the sage announcement band. Depth is communicated through the image hierarchy itself — foreground objects photographed against neutral backgrounds create the only sense of dimensional space.

## Surfaces

- **Paper** (`#ffffff`) — Default page canvas, card surface, header/nav background, input fill, modal background
- **Bone** (`#f0f0f0`) — Secondary section surface, subtle alternating panel, hairline separator tone
- **Eucalyptus Mist** (`#a9aea9`) — Full-bleed announcement banner background — the only chromatic surface tier

## Imagery

Photography is the primary content and brand language. Two coexisting registers: (1) tight black-and-white product-on-hands shots, square or 3:4 cropped, high contrast, the object filling the frame with no lifestyle context; (2) full-color lifestyle photography in warm natural light, earth-toned landscapes, models in motion carrying bags, shot from low angles with shallow depth of field. The grayscale/full-color alternation creates the page's only visual rhythm. No illustration, no 3D renders, no abstract graphics. Images are full-bleed or edge-to-edge in grid cells with zero radius and no borders. Icons are absent or minimal — a simple × for dismiss, nothing more.

## Layout

Full-bleed, edge-to-edge layout with no maximum content width — images fill the viewport. The top announcement banner spans 100% width, followed by the header nav also full-width. The main content area uses a multi-column image grid (2–3 columns desktop) with zero or minimal gaps, letting photographs create their own visual structure. Text and links live in the white margins below images, never overlaid. Editorial sections alternate between product grids and full-bleed lifestyle photographs. Vertical rhythm is generous (80–120px section gaps) creating a gallery-walk pacing. The newsletter modal is a fixed bottom-left panel; a dismissible subscription bar sits at the very bottom of the viewport. The overall feel is a museum catalog or editorial print spread, not a typical e-commerce store layout.

## Similar Brands

- **Mismo** — Same editorial leather-goods e-commerce language: monochrome ink-on-paper palette, Sohne-adjacent neo-grotesque type, large ungated product photography, and text-link-only CTAs
- **Cuyana** — Shared quiet-luxury restraint with a nearly all-white canvas, single warm-neutral accent, and image-dominant product grids that let the objects speak
- **Aesop** — Identical gallery-walk layout philosophy — generous whitespace, small refined type, no filled buttons, and product photography treated as editorial portraiture
- **Want Les Essentiels** — Same museum-catalog pacing with monochrome surface palette, minimal nav chrome, and lifestyle photography that frames objects in hands and natural settings
