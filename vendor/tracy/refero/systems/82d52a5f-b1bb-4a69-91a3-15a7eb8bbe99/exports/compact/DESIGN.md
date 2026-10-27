# ThoughtLab — Style Reference
> Obsidian monument with crimson signal. A void-black canvas where a single saturated red pill is the only chromatic object in a cathedral of oversized white type.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ThoughtLab operates as a black-cathedral design language: pure black canvas, one red pulse, and typography so large it functions as architecture. The system is almost entirely achromatic — #cccccc carries the body, #ffffff carries the display — with #fc1c46 appearing only on the single primary action as a controlled voltage spike against the void. Hierarchy is built through extreme scale jumps (198px → 14px), not through color, shadows, or fills. Components are weightless: transparent cards, pill buttons, hairline inputs, no elevation stack — the page breathes through negative space and tightly-tracked uppercase display type rather than through containers.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void | `#000000` | Page background, canvas — the absolute base on which all other elements float |
| Ash | `#cccccc` | Body and link text, default copy tone on the black canvas — chosen over pure white to soften optical glare |
| Frost | `#ffffff` | Display headings, button text, input field text and rules — the brightest tier, reserved for content that must lead |
| Graphite | `#4c4c4c` | Copyright, meta, tertiary helper text — deliberately muted so it never competes with the body tier |
| Crimson Signal | `#fc1c46` | Primary action fill — the single red accent; appears on the Contact Us pill, in the brand logo mark, and nowhere else. Its rarity is the design |

## Typography

### sui — The sole typeface. Sui is a custom geometric sans used for everything from 198px display down to 10px caption. Weight 700 is reserved for monumental display and large headings; weight 400 carries the rest of the system. The bold/regular contrast is the type system — no second family is needed.
- **Substitute:** Space Grotesk (closest free geometric match) or Inter for a more neutral alternative. Neue Haas Grotesk Display if licensed.
- **Weights:** 300, 400, 500, 700
- **Sizes:** 10, 14, 15, 17, 18, 27, 72, 91, 198
- **Line height:** 0.92, 0.96, 1.00, 1.10, 1.15, 1.20, 1.25, 1.50, 2.14
- **Letter spacing:** -0.0670em, -0.0200em, -0.0090em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.25 | — |
| body-sm | — | — | 14px | 1.15 | — |
| subheading | — | — | 18px | 1.1 | — |
| heading-sm | — | — | 27px | 1.2 | — |
| heading | — | — | 72px | 1.1 | — |
| heading-lg | — | — | 91px | 0.92 | -1.82px |
| display | — | — | 198px | 0.96 | -1.78px |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1400px
- **Section gap:** 86-108px
- **Card padding:** 22px
- **Element gap:** 9px

### Border Radius

- **tags:** 9999px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 9999px

## Components

### Crimson Pill CTA
**Role:** The only filled button in the system. Reserved for the single primary action per view.

Background #fc1c46, text #ffffff, border-radius 9999px, horizontal padding 30px, vertical padding 0 (height driven by line-height), font 15px sui weight 400 uppercase, letter-spacing tight. No border, no shadow. The radius is a true pill — the cap is the shape.

### Ghost Text Button
**Role:** Secondary actions, inline triggers, 'View all' style links within blocks.

Transparent background, text #000000 or #ffffff depending on surface, border-radius 0px, no padding, no border. Underline on hover. Weight 400, 14–17px sui.

### Transparent Project Card
**Role:** Work showcase tiles in the portfolio grid.

All 12 card variants share: background rgba(0,0,0,0), border-radius 0px, box-shadow none, padding 0px. The card is a content container, not a visual surface — images and text define the edges. Internal padding comes from the 22px cardPadding token only when text needs breathing room.

### Hairline Input
**Role:** Form fields in contact flows.

Transparent background, text #ffffff, border-bottom-only rule in #ffffff (or 1px top/bottom depending on context), border-radius 0px, padding 7.2px vertical / 21.6px horizontal. No fill, no boxed look — the input is a line on the void.

### Display Headline
**Role:** Hero and section-opening statements.

198px sui weight 700, line-height 0.96, letter-spacing -1.78px, uppercase, #ffffff. Lines stack tight; the 0.96 leading means descenders kiss ascenders. This is the type that defines the brand.

### Section Heading
**Role:** Sub-hero headings, section labels.

91px sui weight 700, line-height 0.92, letter-spacing -1.82px, uppercase, #ffffff or #cccccc. 0.92 line-height is extreme — only works at this weight and size.

### Body Lead
**Role:** Supporting paragraph under display headlines.

18px sui weight 400, line-height 1.10, #cccccc. Tighter than typical body — 1.10 is a deliberate choice that lets the type read as architectural rather than conversational.

### Uppercase Eyebrow
**Role:** Category labels, kicker text, pre-headings.

15px sui weight 400, uppercase, letter-spacing default, #cccccc or #4c4c4d. Used sparingly above larger headings.

### Meta / Copyright Text
**Role:** Footer legal, phone numbers, secondary info.

10–14px sui weight 400, #4c4c4c. Deliberately quiet — must not compete with body text.

### Navigation Header
**Role:** Top-of-page brand bar.

Three-zone layout: logo mark + wordmark left, tagline center, CTA pill right, hamburger far right. All on transparent / #000000. Height ~72px. No background fill, no border-bottom.

### Hero 3D Sphere
**Role:** The brand's signature visual element — appears on the homepage and case-study headers.

Large dark obsidian liquid blob/sphere rendered in WebGL, positioned absolute so it overlaps the display headline. No defined color — reads as black with subtle blue/purple/amber rim reflections from the render lighting. Functions as the only 'decoration' the system permits.

### Hamburger Menu Trigger
**Role:** Full-screen menu open affordance.

Two thin horizontal #ffffff lines, no background, no border, positioned in the far-right of the header. 14px height total.

## Do's and Don'ts

### Do
- Use 9999px border-radius for every button, tag, and pill — the full pill is non-negotiable
- Set display headlines at 198px or 91px in weight 700, uppercase, line-height ≤ 0.96
- Keep the palette to Void, Ash, Frost, Graphite, and Crimson Signal — no additional accent colors ever
- Apply 126px horizontal page margins on desktop — the negative space is the design
- Use Crimson Signal (#fc1c46) only for the single primary action per view and the logo mark
- Set body text in #cccccc rather than pure white to reduce optical glare on the black canvas
- Build hierarchy through scale jumps and tracking, never through drop shadows or background fills

### Don't
- Do not add drop shadows, glows, or any box-shadow value to any component
- Do not introduce a second accent color — red is the only chromatic signal
- Do not fill cards with background colors, gradients, or borders — cards must remain transparent
- Do not set body text below 10px or use serif, script, or display faces — sui is the only family
- Do not use border-radius on cards, inputs, or any non-button element
- Do not use line-height above 1.25 for body or 1.10 for supporting copy — the system breathes through tightness
- Do not place Crimson Signal on a non-action element — its rarity is what makes it work

## Elevation

No shadows. No elevation stack. Hierarchy is constructed entirely through scale, tracking, and whitespace — never through drop-shadow depth. The 12 card variants all carry box-shadow: none, confirming this as a deliberate zero-elevation philosophy. If a component needs to feel 'above' the canvas, it gets a hairline border or a transparent background, not a blur.

## Surfaces

- **Canvas** (`#000000`) — Page background, full-bleed
- **Transparent card** (`#000000`) — Project/work items float directly on the canvas with zero surface fill or border

## Imagery

Imagery is scarce and intentional. The dominant visual is a large WebGL-rendered obsidian liquid sphere — a dark, near-black 3D form with subtle blue and amber rim reflections that floats on the black canvas and partially overlaps the display headline. It functions as brand iconography more than illustration. Project thumbnails appear as photographic or video stills in a flowing vertical list, presented edge-to-edge with no frame. No lifestyle photography, no stock imagery, no decorative gradients. The sphere and the type are the only visual events on the page.

## Layout

Full-bleed dark canvas with generous horizontal margins (126px on each side, pushing the content column to ~1400px). The header is a single 72px row: logo left, tagline center, pill CTA and hamburger right. The hero is a split composition — oversized 198px uppercase headline on the left with supporting 18px body below, and the 3D sphere overlapping from the center-right, partially eating into the text. Below the hero, sections flow in spacious vertical rhythm with 86–108px gaps between them. Work items appear as a stacked, near-full-width list rather than a card grid. There is no sidebar, no mega-menu, no footer with column grids — the footer is a single quiet line of copyright and contact in #4c4c4c. Navigation beyond the header is triggered by the hamburger into a full-screen overlay.

## Similar Brands

- **Instrument** — Same near-black canvas with oversized uppercase display type and a single chromatic accent reserved for the primary action
- **Active Theory** — Dark-mode agency site pairing massive display headlines with a 3D/WebGL centerpiece as the only visual event
- **Resn** — Black-canvas experimental studio with weightless transparent components and type that functions as architecture
- **Locomotive** — Same zero-elevation philosophy — no shadows, no card fills, hierarchy built through scale and whitespace alone
- **Ueno** — Dark agency aesthetic with a single saturated brand color and display type that dominates the page
