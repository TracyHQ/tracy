# Aaply — Style Reference
> Digital sketchpad with electric highlighter

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Aaply reads as a digital sketchpad on a light gray canvas: everything is flat, everything is rounded, and electric yellow carries the energy while black anchors the structure. The headline itself behaves like a whiteboard — bold black type interrupted by colorful emoji and icon stickers, signaling that this is a tool for creative work. Surfaces float as soft white cards on a cool gray field with a faint dot-grid texture, never relying on shadows for depth. Brand color appears as generous fills (buttons, accent shapes, logo marks) rather than thin strokes or tinted backgrounds. The overall feeling is energetic but unpretentious — a working surface, not a gallery.

## Colors

| Name | Value | Role |
|------|-------|------|
| Highlighter Yellow | `#e6e51e` | Primary brand accent — logo mark, filled pill buttons, accent shapes inside product mockups, highlight washes on feature cards |
| Annotation Red | `#f34646` | Red supporting accent for decorative details and low-frequency emphasis |
| Signal Blue | `#466cf3` | Product mockup logos, icon accents, connector arrows inside the flow diagram — the cool counterweight to warm yellow |
| Peach Wash | `#ff8562` | Soft tinted background blocks behind product mockup clusters — warm secondary surface that softens the gray canvas |
| Carbon | `#000000` | Primary text, dark filled buttons, icon strokes — the structural ink of the entire system |
| Paper White | `#ffffff` | Card surfaces, navigation bar background, product mockup canvas — every elevated surface |
| Graphite Mist | `#f2f2f2` | Page canvas background — the cool gray field that makes white cards appear to float |
| Hairline Gray | `#e6e6e6` | Subtle borders, secondary surface fills, dividers between content sections |
| Shadow Gray | `#cccccc` | Single soft drop shadow color (used at 20% opacity as rgba), muted text on dark surfaces |
| Sunbeam | `#fff705` | Brighter yellow variant for highlighted feature containers — the outer glow on flow-diagram cards |

## Typography

### Times — Times — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.2

### Poppins — Display and heading family — weight 700 for the hero headline and section titles, weight 500 for sub-headings. Its geometric roundness echoes the pill buttons and rounded cards, making type and shape feel like one material. Tight negative tracking at large sizes pulls letters together into a confident block.
- **Substitute:** DM Sans, Nunito Sans
- **Weights:** 400, 500, 700
- **Sizes:** 14px, 27px, 34px, 52px, 57px
- **Line height:** 1.00, 1.05, 1.33, 1.35, 1.57
- **Letter spacing:** -0.0740em at display sizes, -0.0190em at heading, -0.0180em at heading-sm

### Inter — Body and UI text — nav links, button labels, descriptions, form text. Inter's humanist proportions provide readable density at small sizes while weight 700 can punch up to match Poppins in nav and button contexts.
- **Substitute:** system-ui, -apple-system, Segoe UI
- **Weights:** 300, 400, 500, 700
- **Sizes:** 15px, 16px, 18px, 27px, 31px
- **Line height:** 1.40, 1.44, 1.53, 1.55, 1.56
- **Letter spacing:** -0.0740em at large sizes, -0.0280em at 18px, normal at 16px and below

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.57 | — |
| body | — | — | 16px | 1.53 | — |
| subheading | — | — | 18px | 1.4 | -0.5px |
| heading-sm | — | — | 27px | 1.33 | -0.49px |
| heading | — | — | 34px | 1.05 | -0.65px |
| heading-lg | — | — | 52px | 1 | -3.85px |
| display | — | — | 57px | 1.05 | -4.22px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 32-48px
- **Element gap:** 16-24px

### Border Radius

- **nav:** 30px
- **tags:** 3000px
- **cards:** 30-40px
- **inputs:** 16px
- **buttons:** 3000px
- **productFrame:** 16px

## Components

### Filled Yellow Pill Button
**Role:** Primary brand accent button

#e6e51 background, #000000 text, border-radius 3000px, padding 16px 32px, Inter weight 500 at 16px. The highest-energy button in the system — used for the main conversion moment. Black text on yellow achieves 15.6:1 contrast.

### Filled Black Pill Button
**Role:** Secondary high-emphasis button

#000000 background, #ffffff text, border-radius 3000px, padding 16px 32px, Inter weight 500 at 16px. Used for the darker companion CTA beside the yellow button. Maximum contrast and weight.

### Ghost Pill Button
**Role:** Low-emphasis navigation action

Transparent background, #000000 1px border, border-radius 3000px, padding 12px 24px, Inter weight 500 at 15px. Used for 'Log in' in the nav bar — present but quiet.

### Navigation Bar Card
**Role:** Top-level site navigation

White #ffffff surface on the gray canvas, border-radius 30px, horizontal padding 24px, vertically centered logo + link group + button group. Floats with a single soft drop shadow (rgba(0,0,0,0.2) 0px 10px 10px -5px). Max-width aligns with page content.

### Product Screenshot Frame
**Role:** Browser-style product preview container

White card with border-radius 16px, three colored traffic-light dots (red/yellow/blue) in the top-left corner to simulate a browser window. Contains a dot-grid background pattern and nested UI mockups.

### Phone Mockup Card
**Role:** Individual screen preview in a flow diagram

White rounded rectangle (~16px radius) with a bold blue #466cf3 zigzag 'N' mark at the top, screen label text below (Inter 14px). Connected to adjacent mockups by thin lines with small arrowheads.

### Flow Connector Line
**Role:** Visual link between product screens

Thin #000000 1px line with a small arrowhead or node dot at the endpoint. Black-on-white, no fill — the lines are the diagram's grammar.

### Annotation Tag
**Role:** Callout label on product mockups

#f34646 background, #ffffff text, border-radius 3000px, padding 6px 14px, Inter weight 500 at 13px. Small, saturated, attention-grabbing — points to specific features inside the product preview.

### Highlight Feature Container
**Role:** Yellow-bordered flow card grouping related screens

Outer container with a #fff705 border (2-3px), border-radius ~30px, wrapping a group of 2-3 phone mockup cards. Functions as a visual 'chapter' boundary within the product preview.

### Avatar Stack
**Role:** Social proof / collaboration indicator

Circular user avatars (24-32px diameter) with 2px white border, stacked with negative horizontal offset. Positioned on the right edge of the product preview to suggest multi-user activity.

### Brand Logo Mark
**Role:** Brand identity in nav and footer

Yellow #e6e51 rounded square (~20px) with a simple 'A' or mountain-like glyph in black, paired with 'aaply' wordmark in Poppins 500 at 18px, #000000.

### Emoji/Illustration Accent
**Role:** Decorative element embedded in headlines

Full-color emoji or flat icon illustrations placed inline within the hero headline. They sit at baseline and break the text rhythm — a signature device that makes the headline feel hand-assembled rather than typeset.

## Do's and Don'ts

### Do
- Use border-radius 3000px for all buttons, tags, and small interactive elements
- Use Poppins weight 700 with tight negative tracking (-0.0740em) for display and hero headlines
- Pair every yellow filled button with a black filled button as a high-contrast companion
- Embed emoji or flat icon illustrations directly inside headlines — not beside them
- Use the dot-grid texture on product preview backgrounds to signal 'this is a working canvas'
- Set card border-radius between 30-40px for feature cards; 16px only for small UI mockups
- Keep all text #000000 on white/light surfaces — the system runs on maximum contrast

### Don't
- Do not stack multiple shadow layers — the system uses one shadow, on the nav bar, and nothing else
- Do not introduce new accent hues beyond the four-color palette (yellow, red, blue, peach)
- Do not use light or thin font weights for headlines — Poppins 700 is the floor for display text
- Do not use sharp corners on buttons, tags, or cards — every interactive element is fully rounded
- Do not separate the yellow and black buttons with other styles — they always appear as a matched pair
- Do not use emoji or illustrations as standalone decorations outside of headlines and product mockups
- Do not apply the peach #ff8562 as a full background section — it stays as a soft wash behind mockup clusters only

## Elevation

- **Navigation bar:** `rgba(0, 0, 0, 0.2) 0px 10px 10px -5px`

## Surfaces

- **Canvas** (`#f2f2f2`) — Page background — cool gray field with dot-grid texture
- **Card** (`#ffffff`) — Navigation bar, feature cards, product mockup containers
- **Tinted Accent** (`#ff8562`) — Peach wash behind mockup clusters, subtle warmth
- **Highlight Frame** (`#fff705`) — Yellow-bordered feature containers that frame the hero product flow

## Imagery

The visual language is dominated by product mockups and flat illustration, not photography. The hero contains a large browser-style screenshot of the actual product — a flowchart editor with phone-shaped screen cards connected by arrows on a dot-grid background. Inside the mockup, phone screens show the app's own onboarding flow (log in, company name, sign up) rendered in miniature. The page background carries a faint dot-grid texture, reinforcing the whiteboard/canvas metaphor. The only other visual elements are emoji and small flat icons (speech bubbles, flags, zigzags) placed directly inside the headline text. No stock photography, no 3D renders, no lifestyle imagery — the product IS the hero.

## Layout

Centered max-width layout (~1200px) on a light gray canvas. The hero is a centered headline stack with two pill buttons below, followed by a full-width product screenshot that bleeds edge-to-edge within the content container. Sections are separated by generous vertical rhythm (80-120px) rather than visual dividers. The navigation bar floats as a rounded white card with a single soft shadow. The product preview itself uses a Z-pattern: mockups flow left-to-right with connector arrows, then the flow continues in a second row slightly below. Content is text-light and visual-heavy — the product screenshot occupies more vertical space than all text combined above it.

## Similar Brands

- **Framer** — Same bold sans-serif headlines with tight tracking, playful use of inline emoji, and a product screenshot as the hero visual
- **Pitch** — Same generous border-radius on cards and buttons, light canvas with floating white surfaces, and a single vibrant accent color carrying the brand energy
- **Popsy** — Same yellow as dominant brand accent, pill-shaped CTAs, and a flat illustration style that treats the product preview as decorative hero art
- **Whimsical** — Same dot-grid background texture, flowchart-style product visualization, and a working-canvas aesthetic that makes the tool feel like the artifact
