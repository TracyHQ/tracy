# FRANKY'S — Style Reference
> Retro arcade kiosk on a skate-shop counter.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Franky's is a retro arcade-meets-skate-shop visual language: a warm cream canvas (#f3e5df) wrapped in hard pixel-art borders, an omnipresent black-and-white checkerboard, and a single Arcade pixel font carrying every word on the site. The palette is deliberately impoverished — only two chromatic colors survive (signal-orange #faa21f for the marquee bar and a punchy green #128e44 for the buy button), with all hierarchy expressed through the Arcade font's weight jump from 400 to 700 and through black-on-cream contrast. Surfaces stay flat and monolithic; depth comes only from a 1px inset cream line on buttons and the checkerboard's tonal play. Components feel like 1990s shopfront sprites: thick black borders, tight 6–12px radii, compact 4–8px internal padding, and 3D/AR toggles that read as pixel icons rather than chrome. New pages should preserve the arcade cabinet feel: no gradients except the orange marquee, no soft shadows, no decorative typography — just cream paper, black pixel rules, and one warm orange call.

## Colors

| Name | Value | Role |
|------|-------|------|
| Arcade Cream | `#f3e5df` | Page background, product card surfaces, inset highlights on buttons |
| Ink Black | `#000000` | Primary text, checkerboard tiles, all UI borders, card outlines, icon strokes |
| Pixel Gray | `#e5e7eb` | Hairline borders, card dividers, structural rules between grid cells |
| Charcoal | `#333333` | Secondary surface tone, checkerboard shadow squares, shadow color |
| Carbon | `#151515` | Deep neutral for illustration fills and the densest checkerboard tiles |
| Muted Gray | `#737373` | Disabled/muted text on buttons and body copy |
| Marquee Orange | `#faa21f` | Top notification bar, marquee accents, brand signature |
| Buy Green | `#128e44` | Filled ADD TO CART button — the only green purchase action |

## Typography

### Arcade — Sole typeface across the entire interface — every heading, label, price, button, body and icon is set in Arcade. The 400/700 weight jump is the only hierarchy tool; using a second typeface would shatter the kiosk illusion.
- **Substitute:** VT323, Press Start 2P (Google Fonts pixel set) — match the 8-bit, all-caps-leaning look
- **Weights:** 400, 700
- **Sizes:** 10px, 14px, 16px, 18px
- **Line height:** 1.25, 1.43, 1.50, 1.56
- **Letter spacing:** normal across all sizes — the font's bitmap grid is the rhythm, not tracking

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | — |
| body-sm | — | — | 14px | 1.43 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.56 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 43-61px
- **Card padding:** 12px
- **Element gap:** 4-8px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **buttons:** 6px

## Components

### Marquee Announcement Bar
**Role:** Top-of-page strip

Full-width band filled with the Marquee Sheen gradient (orange → cream → orange). Arcade 14px/400, letter-spacing normal, black or dark-brown text. Height ~36px, flush with the top of the viewport. It is the only decorative chromatic surface on the page.

### Header Bar
**Role:** Primary navigation

Cream (#f3e5df) background, 1px solid #000000 bottom border. Wordmark 'franky's' set in Arcade 18px/700 in #000000 with a small black cross pixel-icon. Hamburger menu on the right (three 2px black lines, 16px apart). No drop shadow, no sticky elevation — it sits flat on the cream canvas.

### Product Showcase Panel (3D/AR)
**Role:** Hero product viewer

Large left-hand panel (roughly 55% of viewport width) with a black-and-cream checkerboard floor receding in perspective. A charcoal (#333333) cap floats centered with a soft #333333 shadow. Bottom-center contains two pill toggles: '3D' and 'AR', each 6px radius, 1px inset cream highlight (#f3e5df 0px 1px 0px 0px inset), 2px 8px padding, Arcade 14px/400.

### Product Card
**Role:** Grid cell for one SKU

Cream (#f3e5df) background, 12px radius, 1px solid #e5e7eb border. Internal padding 12px. Product image fills the top ~70% of the card on a pure cream backdrop. Title (e.g. 'FRANKY'S GREEN 665') in Arcade 14px/700 #000000 at the bottom-left, price in Arcade 14px/400 #000000 at the bottom-right. Two stacked controls under the title area: ghost 'TRY IN AR' button and filled or ghost 'ADD TO CART' / 'OUT OF STOCK' button.

### Try In AR Button (Ghost)
**Role:** 3D/AR preview trigger

6px radius, transparent fill, 1px solid #000000 border, Arcade 14px/400 #000000. Padding 4px 12px. The 'AR' suffix is wrapped in a tiny pill (9999px) to read as a badge.

### Add To Cart Button (Filled Green)
**Role:** Primary purchase action

6px radius, #128e44 background, Arcade 14px/700 #ffffff (white) text, fully uppercase. Padding 8px 12px. Optional 1px inset cream highlight (#f3e5df 0px 1px 0px 0px inset) to keep the arcade-button feel. This is the only green surface in the system.

### Out Of Stock Button (Disabled Ghost)
**Role:** Depleted SKU state

6px radius, transparent fill, 1px solid #737373 border, Arcade 14px/400 #737373 text. Same dimensions as the live Add-To-Cart button so the grid stays uniform.

### Marquee Tag (Pill Badge)
**Role:** Inline label inside buttons and cards

9999px radius, 1px solid #000000 border, Arcade 10px/400 #000000, padding 2px 8px. Used for suffixes like 'AR' or sub-tags inside cards.

### Footer Strip
**Role:** Bottom-of-page info bar

1px solid #e5e7eb top border on cream. Left: '© FRANKY'S AMSTERDAM 2023' in Arcade 14px/400 #000000. Right: 'SUBSCRIBE' and 'SHIPPING' in Arcade 14px/700 #000000 acting as ghost links.

### Checkerboard Surface
**Role:** Hero texture / brand pattern

Repeating two-tone square grid in #f3e5df and #000000 (or #333333 for shadowed variants). Square size ~48px. Used as the hero panel backdrop and as decorative banding; never as a functional UI surface.

## Do's and Don'ts

### Do
- Use Arcade 400 for body, labels, prices, and captions; jump to Arcade 700 only for titles, nav items, and the footer links — the weight shift is the entire hierarchy.
- Set every CTA, tag, and toggle to a 6px radius (or 9999px for the inline 'AR' pill) and add the 1px inset cream highlight (#f3e5df 0px 1px 0px 0px inset) to keep the arcade-button bevel.
- Use Buy Green (#128e44) only for the filled Add-To-Cart button; never reuse it for links, borders, or hover states.
- Anchor the page on Arcade Cream (#f3e5df); use Pixel Gray (#e5e7eb) for 1px structural rules and card borders, Ink Black (#000000) for text and checkerboard contrast.
- Reserve Marquee Orange (#faa21f) for the top announcement bar and the optional Marquee Sheen gradient — it should never appear as a button fill or large text color.
- Keep vertical rhythm in 4px increments; element gaps live at 4–8px, card padding at 12px, and section gaps at 43–61px.
- Pair every product card with a Try-In-AR ghost button stacked above the Add-To-Cart (or Out-Of-Stock) button so the right-hand grid stays uniform.

### Don't
- Don't introduce a second typeface — no system fonts, no sans-serifs, no display scripts. Arcade is the brand.
- Don't use soft drop shadows; the only shadow allowed is the 1px inset cream highlight on buttons and the flat #333333 under the floating cap.
- Don't round cards above 12px or buttons below 6px — the 6/12/9999px triad is the only permitted radius vocabulary.
- Don't place Buy Green (#128e44) on a non-purchase element, and don't pair it with the Marquee Sheen gradient in the same component.
- Don't dilute the checkerboard — it must read as pure #000000 against #f3e5df (or #333333 for shadow tones), never as a tinted gray or blurred pattern.
- Don't use dark-mode backgrounds; the canvas is always Arcade Cream, even inside cards and modals.
- Don't exceed 18px on any text or drop below 10px — the Arcade font's bitmap grid breaks outside that range.

## Elevation

- **Add To Cart / Ghost buttons:** `inset 0 1px 0 0 #f3e5df — 1px cream pixel-highlight at the top edge`
- **Floating product cap in hero:** `flat #333333 drop, no blur, sits directly under the product`

## Surfaces

- **Arcade Cream** (`#f3e5df`) — Page canvas — warm off-white that makes the pixel font breathe
- **Pixel Gray** (`#e5e7eb`) — Grid gutter tone and product card background variation
- **Charcoal** (`#333333`) — Checkerboard shadow squares and tertiary surface
- **Carbon** (`#151515`) — Deepest checkerboard tone, near-black illustration fills

## Imagery

Photography of caps on a pure cream backdrop, centered and tightly cropped, with a soft charcoal contact shadow beneath. No lifestyle, no models, no context — the cap is the hero. The checkerboard behind the hero doubles as a graphic surface. No illustrations, no 3D renders beyond the AR toggle, no decorative icons beyond the pixel cross in the wordmark.

## Layout

Full-bleed single-screen product page on desktop, max-width 1200px centered. Top-to-bottom rhythm: orange marquee bar → cream header with black rule → two-column split (55% hero checkerboard / 45% 2-column product card grid) → cream footer strip. On mobile, the hero collapses to a full-width checkerboard and the grid becomes a single column. Cards are evenly distributed in a 2-column grid with Pixel Gray (#e5e7eb) hairline dividers between them. Section gaps are tight (43–61px) and the interface never uses full-bleed dark bands — the cream canvas runs uninterrupted.

## Similar Brands

- **Polar Skate Co.** — Same flat cream canvas, bold black-bordered product cards, and a single warm accent (Polar's red, Franky's orange) on a marquee bar
- **Palace Skateboards** — Pixel/bitmap-influenced type system, checkerboard product framing, and the 6px-radius beveled button look
- **Stüssy** — Compact cream-and-black product grid with tight padding and a single chromatic CTA color
- **Aimé Leon Dore** — Warm off-white surfaces, monospaced/pixel-adjacent labels, and minimal-but-precise card radii
