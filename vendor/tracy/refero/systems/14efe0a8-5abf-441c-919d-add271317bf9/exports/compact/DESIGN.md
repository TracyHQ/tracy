# Hartzler Family Dairy — Style Reference
> Creamery billboard at golden hour — the products are the type and the type is the room.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Hartzler Family Dairy uses a sunlit country-creamery aesthetic where product photography is the hero and display type does the branding. Massive Work Sans 900 headlines (290–333px) at 0.70 line-height stretch behind and around product photos, acting as architectural color blocks — teal 'DAIRY' and butter-yellow 'FRESH' alternate as section identifiers while a single deep forest green anchors all chrome, logos, and interactive borders. The interface is intentionally sparse: white canvas, minimal nav (just a 'MENU' link), no decorative gradients, no shadows — the bottles, butter sticks, and ice cream scoops are the visual content. Accent colors appear ONLY in oversized display text and small category tags; everything else is charcoal text and forest-green outlines, creating the feel of a vintage dairy billboard stripped of clutter.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Heritage | `#035542` | Teal accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Billboard Blue | `#2b7bb9` | Outlined link and button borders, secondary decorative strokes on product imagery. Never a filled background — always a 1–2px stroke that reads as an old-school printed link underline |
| Cream Teal | `#56dddb` | Teal outline accent for tags, dividers, and focused UI edges. |
| Butter Yellow | `#f9e9a9` | Yellow outline accent for tags, dividers, and focused UI edges. |
| Charcoal Press | `#333333` | Primary text, all UI borders, image outlines. This is the workhorse neutral — the 644 border usages show that almost every edge in the system is charcoal, giving the site a hand-printed, ink-stamped quality |
| Cream White | `#ffffff` | Page canvas, card surfaces, button fills when a neutral surface button is needed. The interface is unapologetically blank — white lets the product photography and oversized colored type do all the work |

## Typography

### Work Sans — The entire visual identity runs on a single Work Sans family. Weight 400 carries body, captions, and category tags. Weight 500 is used for slightly emphasized labels and the nav 'MENU' word. Weight 900 at 290–333px with 0.70 line-height is the signature move — this is not a 'big headline' UI, it's a typographic billboard where letters stack into color blocks that frame product photography. The slight -0.0100em tracking (-2.9px at 290px, -3.3px at 333px) tightens the massive type so it feels inked, not airy.
- **Substitute:** Inter (for 400/500), Archivo Black or Anton (for 900 display alternative)
- **Weights:** 400, 500, 900
- **Sizes:** 14px, 17px, 18px, 40px, 290px, 333px
- **Line height:** 0.70 (display) / 1.00–1.06 (headings) / 1.45 (body)
- **Letter spacing:** -0.0100em across all sizes (≈-0.14px at 14px, -2.9px at 290px, -3.3px at 333px)

### Font Awesome 5 Brands — Font Awesome 5 Brands — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 40px
- **Line height:** 1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.45 | -0.14px |
| body-sm | — | — | 17px | 1.45 | -0.17px |
| subheading | — | — | 40px | 1.06 | -0.4px |
| display | — | — | 290px | 0.7 | -2.9px |
| display-xl | — | — | 333px | 0.7 | -3.33px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1400px
- **Section gap:** 50px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **body:** 4px
- **tags:** 0px
- **buttons:** 20px
- **pillButtons:** 100px

## Components

### Billboard Display Headline
**Role:** Section-identifying typographic hero

Massive Work Sans 900 at 290–333px, line-height 0.70, letter-spacing -0.01em. Fill alternates between #56dddb (teal) and #f9e9a9 (butter yellow) depending on the section's category word. Sits as a background color block behind/around product photography — the text is architecture, not just a heading. No drop shadow, no gradient — flat color type.

### Product Hero Panel
**Role:** Showcase for a single product line (milk bottle, butter box, ice cream)

White background (#ffffff), product photo centered or left-aligned, overlaid with a small category tag. No card border, no shadow — the product image IS the card. Pair with a 3-product grid layout where each product gets equal horizontal space.

### Category Tag
**Role:** Short product-category label (CHOCOLATE MILK, CLASSIC MILK, ICE CREAM, BUTTER)

Work Sans 500 at 14px, uppercase, Forest Heritage #035542 text on white #ffffff, no border, no background fill. Padding 10px vertical, 0px horizontal. Sits as a small text block adjacent to the product, often with a chevron or simple horizontal line as a visual anchor.

### Circular Featured Seal
**Role:** Featured-content stamp

Circular badge ~120px diameter, Forest Heritage #035542 outline (2px), Forest Heritage text 'FEATURED' set in a curve or stacked, serif-free, all-caps Work Sans 500 at 12–14px. Centered icon or mark. No fill — outlined stamp that reads as a rubber-stamp impression.

### Outlined Link Button
**Role:** Primary interactive element across the site

Work Sans 500 at 14–17px, Forest Heritage #035542 text, 1–2px Forest Heritage border, 20px border-radius, 20px horizontal padding × 10–12px vertical padding. White #ffffff background. No fill state, no shadow — the border IS the button. Billboard Blue #2b7bb9 may appear as an alternate outlined link color for secondary actions.

### Pill Button
**Role:** Secondary round-ended button for prominent CTAs

Work Sans 500 at 14–17px, 100px border-radius (fully pill), Forest Heritage #035542 text, transparent or white fill, 1–2px Forest Heritage border, 20px vertical × 24px horizontal padding. Used sparingly for the most important page-level action.

### Brand Wordmark
**Role:** Site logo in script-style mark

Hartzler rendered in a flowing italic/script face (or italicized Work Sans 900 as substitute) at 40–60px, Forest Heritage #035542. Always paired with small-caps 'FAMILY DAIRY' sub-label in Work Sans 500 at 10–12px tracked out. The wordmark is the only ornate typographic element — everything else is geometric sans.

### Section Caption Label
**Role:** Small all-caps descriptor under a product

Work Sans 400 at 14px, uppercase, letter-spacing 0.05em, Charcoal Press #333333. Padding 20px top. Centered or left-aligned under the product image. Example style: 'WORLD'S BEST CHOCOLATE MILK' or 'HAND-SCOOPED IN WOOSTER OHIO'.

### Minimal Nav
**Role:** Site navigation

Top-right anchored 'MENU' word in Work Sans 500 at 17px, Forest Heritage #035542, with a simple three-line hamburger icon. No background bar, no sticky shadow — just a floating word and icon on the white canvas.

### Three-Product Row
**Role:** Layout component for the dairy showcase

Three equal-width columns across the page max-width, each containing a centered product photo, a Category Tag, and a Section Caption beneath. No dividers between columns — the white space does the separation. 20px gap between columns.

### Decorative Wave Glyph
**Role:** Inline brand flourish

Small repeating chevron/wave mark in Cream Teal #56dddb or Forest Heritage #035542, used as a decorative element between sections or as a divider. Geometric, no curves — angular hand-drawn line quality.

## Do's and Don'ts

### Do
- Set section-identifying display headlines at 290–333px in Work Sans 900, line-height 0.70, alternating between #56dddb and #f9e9a9 — the teal/yellow swap signals a new product category.
- Use Forest Heritage #035542 for every outlined button border, link text, logo, and category tag — it is the only interactive color in the system.
- Pair every product photo with a small all-caps Section Caption in Work Sans 400 at 14px, Charcoal #333333, 20px padding-top.
- Render the brand wordmark 'Hartzler' in an italic/script style at 40–60px in #035542 with a tracked-out 'FAMILY DAIRY' sub-label.
- Use 20px border-radius for standard buttons and 100px for pill buttons — never mix intermediate values like 50px or 8px.
- Keep the page canvas pure #ffffff with no decorative gradients, textures, or background patterns.
- Stamp the circular 'FEATURED' seal in 2px Forest Heritage outline on top-left of any featured content block.

### Don't
- Never use filled colored buttons with #2b7bb9 or #035542 as a solid background — all interactive elements are outlined or text-only with borders.
- Don't apply drop shadows, glows, or elevation to cards or buttons — depth comes from type and photo scale, not from CSS shadows.
- Don't use display sizes (290–333px) for body UI text — these sizes are reserved exclusively for the billboard-style section identifier words.
- Never pair teal #56dddb or butter yellow #f9e9a9 with UI text under 40px — these colors are display-only accents, not functional UI colors.
- Don't introduce gradients, glassmorphism, or modern SaaS conventions like sticky shadow-on-scroll headers.
- Don't use intermediate border-radius values like 8px, 12px, or 50px — the system has exactly 4px (body), 20px (buttons), 100px (pill), 0px (tags).
- Don't add illustration, icon sets, or abstract graphics to product sections — the bottle photography and oversized type carry the entire visual identity.

## Elevation

The design intentionally avoids drop shadows. Depth and hierarchy are built through oversized colored type acting as background blocks, product photography scale, and generous white-space separation — not through lifted cards or glowing buttons. This keeps the aesthetic flat, printed, and billboard-like.

## Surfaces

- **Cream White Canvas** (`#ffffff`) — Page background — pure white, untextured, lets the oversized colored type and product photos carry the visual weight.
- **Forest Heritage Surface** (`#035542`) — Occasional inverted surface for the circular seal stamps and any dark moment — appears in small concentrated areas, never as a full section background.

## Imagery

Product photography is the entirety of the visual language: glass milk bottles with metal caps, a stick of butter in its printed wrapper, a pint cup overflowing with hand-scooped ice cream. Photos are shot on pure white, no lifestyle context, no hands, no kitchen — the product IS the hero. Treatment is high-key, bright, with crisp detail (you can see condensation and texture on the ice cream). The wordmark, category tags, and section captions sit flat on top with no overlap effects. No illustration, no abstract graphics, no 3D renders — the bottle photography carries all atmosphere.

## Layout

Full-bleed white canvas with no fixed page max-width constraint; the three-product row visually caps around 1400px but the type bleeds beyond. The hero pattern is a three-column product showcase with massive billboard display type stretching behind the products. Sections alternate by switching the display-type color (teal 'DAIRY' → yellow 'FRESH' → teal 'ICE CREAM') — the type color IS the section divider. A 'FEATURED' circular seal stamps the top-left of any featured block. No alternating light/dark bands, no card grids beyond the product row, no sidebar. Navigation is a single floating 'MENU' in the top-right corner. Vertical rhythm: 50px section gaps, 20px element gaps, with the oversized type creating visual breathing room on its own.

## Similar Brands

- **Jeni's Splendid Ice Creams** — Same product-photography-as-hero approach with oversized display type and a single warm accent color used in large flat blocks behind the products.
- **Tillamook** — Heritage dairy brand aesthetic with deep green primary color, clean white canvas, and minimal UI chrome that lets the products dominate.
- **Straus Family Creamery** — Small-batch dairy brand using a single deep brand color for logo and links, paired with generous white space and minimal decorative UI.
- **King Arthur Baking** — Heritage food brand combining a script wordmark, all-caps serif-free labels, and billboard-style display type alternating between warm accent colors per section.
