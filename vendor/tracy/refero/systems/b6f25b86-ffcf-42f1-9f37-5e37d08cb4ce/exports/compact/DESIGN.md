# Alden — Style Reference
> serene clinic on warm parchment — a page so quiet the single blue word and sage button feel like the only sound in the room

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Alden operates on an editorial healthcare register: a near-white canvas warmed by a single cream parchment surface, deep near-black typography, and exactly two chromatic accents — a whisper-soft sky blue used like a highlighter on chosen words, and a muted sage green reserved for the primary action. The system is 98% achromatic and feels intentionally clinical-but-warm, closer to a premium health magazine than a SaaS dashboard. Type mixes a geometric sans for UI with a contemporary serif for the biggest headlines, tightened by consistently negative tracking so the type sits dense and confident rather than airy. Surfaces are flat with very soft card edges (16px), buttons are fully pill-shaped, and the only decorative motion is the subtle blue wash at section edges. An AI agent should treat color as punctuation, not decoration — silence is the default state.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment Cream | `#f3f1eb` | Alternate surface and product-mockup backdrop — the warm cream gives the white canvas a second, softer layer without introducing contrast noise |
| Ink Black | `#28262a` | Primary headings, body text, and the heaviest borders — a near-black with the faintest plum undertone, softer than pure #000 for large blocks of text |
| Graphite | `#4a4a4c` | Secondary text, icon strokes, and lighter borders — the mid-neutral that separates captions from body without going to gray |
| Paper White | `#ffffff` | Page canvas and card surfaces — the dominant background across the entire system |
| Fog Border | `#dddcdd` | Hairline dividers, badge fills, and the softest UI separators |
| Silver | `#cbcbcb` | Mid-weight dividers and de-emphasized body borders |
| Sky Highlight | `#97cde5` | In-line accent on chosen words within headings, and soft card iconography — a dusty pastel blue that reads as annotation, never as brand chrome |
| Sage Action | `#c8dfaa` | Primary CTA fill and decorative wash — the only saturated fill in the interface, used sparingly so the button always feels intentional |

## Typography

### Stk bureau Sans Book Trial — Workhorse sans for body, nav, buttons, badges, cards, and most UI. Tight tracking (-0.02em at body, scaling to -0.04em at 56px) gives it a condensed, editorial density. Substitute: Inter or Söhne.
- **Substitute:** Inter
- **Weights:** 400, 500, 600
- **Sizes:** 12, 14, 16, 18, 24, 30, 32, 40, 48, 56
- **Line height:** 1.00–1.50
- **Letter spacing:** -0.04em at 56px, -0.03em at 40px, -0.02em at 16px, 0.02em at 12px (badges)

### Stk bureau Serif Book Trial — Display serif reserved for the largest editorial statements — the About headline and pull quotes. The 258px instance is a single oversized decorative mark, not a functional type size. Bring it in to add gravity to section openers; never use it in UI. Substitute: Source Serif 4 or Lora.
- **Substitute:** Source Serif 4
- **Weights:** 400, 500
- **Sizes:** 24, 40, 48, 56, 258
- **Line height:** 1.00, 1.20, 1.40
- **Letter spacing:** -0.04em at 48–56px, -0.02em at 24px

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 32px, 40px
- **Line height:** 1.2, 1.3
- **Letter spacing:** -0.02

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0.24px |
| body-sm | — | — | 14px | 1.5 | -0.28px |
| body | — | — | 16px | 1.5 | -0.32px |
| subheading | — | — | 18px | 1.4 | -0.36px |
| heading-sm | — | — | 24px | 1.3 | -0.48px |
| heading | — | — | 32px | 1.2 | -0.64px |
| heading-lg | — | — | 48px | 1.2 | -1.44px |
| display | — | — | 56px | 1 | -2.24px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 40px
- **Element gap:** 16px

### Border Radius

- **cards:** 16px
- **badges:** 30px
- **images:** 24px
- **buttons:** 100px
- **smallUI:** 4px

## Components

### Pill Primary Button
**Role:** Main conversion action — the only saturated filled button in the system

Sage green fill (#c8dfaa), Ink Black text (#28262a), 100px border-radius, 12px vertical / 20px horizontal padding, Stk bureau Sans 16px / 500. No border, no shadow. Sits quiet against the white canvas — the color does the work, not the container.

### Ghost Navigation Link
**Role:** Top-nav and footer text links

No background, no border, Ink Black text (#28262a) at 14–16px / 400, 8px vertical / 12px horizontal hit area. No underline; active state uses the same color with weight 500.

### Hero Display Headline
**Role:** Above-the-fold statement on every primary page

Stk bureau Sans 48–56px / 400, Ink Black (#28262a), line-height 1.00, letter-spacing -1.44 to -2.24px. One phrase is swapped to Sky Highlight (#97cde5) to act as inline annotation. Centered on white canvas with the paragraph beneath at 18px.

### Editorial Section Headline
**Role:** Large body-section openers in the About and feature sections

Stk bureau Serif 40–56px / 400, Ink Black (#28262a), line-height 1.20, letter-spacing -1.44 to -2.24px, centered. One or two inline words re-colored to Sky Highlight (#97cde5) for emphasis.

### Cream Product Stage
**Role:** Container that presents UI mockups and screenshots

Parchment Cream (#f3f1eb) background, 24px corner radius on inner device frames, generous 40–48px internal padding. No shadow — the contrast between the white canvas and cream stage is the only elevation cue.

### Feature Card
**Role:** Content card on cream or white surfaces

White (#ffffff) fill, 16px border-radius, 1px Fog Border (#dddcdd) or no border at all, 40px padding. Headings 24px / 500 Ink Black, body 16px Graphite (#4a4a4c). No shadow, no hover lift.

### Pill Badge
**Role:** Category labels, status tags, inline annotations

Fog Border (#dddcdd) fill or Sky Highlight (#97cde5) fill for accent variants, Ink Black or white text, 30–50px border-radius, 8px vertical / 16px horizontal padding, Stk bureau Sans 12px / 500 with +0.24px tracking.

### Logo Strip
**Role:** Social proof band of partner / investor marks

Single horizontal row, 16px row-gap, all logos rendered monochrome (#28262a) on white. No card frame, no divider — spacing is the only separator.

### Quote Block
**Role:** Testimonial or pull-quote section

Stk bureau Serif 24–32px / 400, Ink Black, centered, with a single highlighted phrase in Sky Highlight. Attributor block beneath: 40px avatar, 14px name in 500, 12px role in Graphite. Subtle blue gradient wash anchored bottom-right.

### Decorative Blue Wash
**Role:** Atmospheric accent at section corners

Soft radial or linear gradient from Sky Highlight (#97cde5) at low opacity fading to transparent. Anchored at the bottom-right of testimonial sections. Never used as a background fill — only as edge atmosphere.

### Top Navigation Bar
**Role:** Persistent site header

White (#ffffff) background, 16px vertical padding, logo left (Alden wordmark in Ink Black 18px / 500), nav links right at 14px / 400 with 32px gaps. 'Get Started' is a Sage Action pill button. No shadow, no border-bottom.

### Avatar Stack
**Role:** Small group of headshots used as social proof or team accents

Circular 40px avatars with 1px Fog Border ring, overlapping 8–12px, arranged loosely around section openers. No labels.

## Do's and Don'ts

### Do
- Keep the canvas 98% achromatic — let Sky Highlight and Sage Action be the only chromatic pixels in any viewport.
- Use Stk bureau Sans for everything functional and switch to Stk bureau Serif only at 40px and above for editorial gravity.
- Tighten tracking aggressively: -0.04em at 56px, -0.02em at 16px. Negative letter-spacing is the system's signature.
- Use Sky Highlight (#97cde5) on individual words inside headings, not on full lines, never on backgrounds.
- Reach for 100px border-radius on every button and badge — the pill shape is non-negotiable for brand consistency.
- Use Parchment Cream (#f3f1eb) as a second surface, not as a background tint — full bands or full containers, never partial fills.
- Separate layers with contrast between white and cream rather than with shadows or borders.

### Don't
- Don't introduce a new accent color — the system is intentionally limited to sky blue and sage green.
- Don't add box-shadows. Elevation comes from the white-to-cream surface contrast, not depth.
- Don't use 24px border-radius on buttons — buttons are always fully pill-shaped at 100px.
- Don't apply Sky Highlight to body paragraphs or backgrounds — it is an in-heading annotation only.
- Don't use Inter or system fonts as the default; always load the Stk bureau (or its Inter/Source Serif substitutes) to preserve the editorial register.
- Don't center product screenshots on pure white — always stage them on Parchment Cream so the device frame reads as object, not page.
- Don't use serif for UI chrome (nav, buttons, badges, form fields) — serif is display-only.

## Elevation

Alden deliberately avoids box-shadows. Elevation is communicated entirely through surface contrast: white cards on a cream band, or cream bands on a white canvas. The only structural line in the system is a 1px #dddcdd hairline, used sparingly. This produces a flat, editorial-documentary feel where hierarchy comes from typography scale and surface tone, not depth.

## Surfaces

- **Page Canvas** (`#ffffff`) — Default page background and primary reading surface
- **Parchment Band** (`#f3f1eb`) — Warm cream section backdrop and product-mockup stage
- **Card Surface** (`#ffffff`) — Elevated cards and inner panels on top of either canvas or parchment
- **Accent Wash** (`#c8dfaa`) — Sparingly used decorative highlight, usually behind a CTA or as section edge wash

## Imagery

Imagery is almost entirely product UI mockups staged on the Parchment Cream surface — no lifestyle photography, no abstract illustration, no 3D. The hero centers a three-panel scheduling/voice agent mockup rendered as clean white cards on cream. People appear only as small circular avatar crops (40px) scattered around section openers, used as human punctuation rather than portraiture. A soft blue atmospheric wash anchors the bottom-right of the testimonial section. Iconography is mono-stroke in Ink Black, consistent 1.5px weight, drawn geometric rather than rounded. The overall visual register is editorial-documentary: the product UI is the hero, avatars are proof of people, and the blue wash is the only decorative element.

## Layout

Page is max-width ~1200px centered, but hero and product-stage sections break to full-bleed white-to-cream bands. Hero pattern is a centered headline-over-canvas with the product mockup staged on a cream band beneath. Section rhythm alternates: white canvas → cream product stage → white canvas with centered editorial headline → cream band with logo strip. Content arrangement is almost entirely centered stacks, never left-aligned text-with-side-image. The avatar accents break the symmetry by floating loosely around headlines, creating intentional negative space. The navigation is a minimal top bar with logo left and three links plus a pill CTA right; no sticky behavior, no mega-menu. Card grids are not used — the system prefers vertical centered stacks over multi-column feature grids.

## Similar Brands

- **Linear** — Same near-monochrome discipline with a single muted accent and pill-shaped CTAs, though Linear skews dark where Alden is editorial-light.
- **Stripe** — Equally restrained palette, centered hero, editorial serif/sans pairing, and the practice of using a single soft color as inline emphasis inside otherwise black headlines.
- **Anthropic** — Comfortable spacing, near-white canvas, pill primary buttons, and the same confidence of letting the product mockup do the visual work while chrome stays nearly invisible.
- **Aesop** — Cream-and-ink palette, serif display headlines, near-zero decorative chrome — the same editorial-documentary register applied to a different industry.
