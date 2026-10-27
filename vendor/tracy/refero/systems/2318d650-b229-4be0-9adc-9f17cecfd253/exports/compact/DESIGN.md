# New Genre — Style Reference
> Cinematic horizon at golden hour — a single gradient arc from charred umber through steel twilight to warm parchment, against which condensed serif headlines carve like editorial mastheads.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

New Genre operates in a cinematic dawn-to-dusk register: near-white surfaces, a near-black text color, and one monumental gradient that arcs from charred brown through steel blue to warm cream — that gradient IS the brand. Typography is a two-voice conversation between a condensed display serif (Serrif Condensed) that fills the top of every page with editorial gravity, and a low-weight geometric sans (Saans Variable) that handles everything else with quiet precision. The system is deliberately monochromatic at the interface level — no accent buttons, no chromatic badges — letting photographic work, gradient washes, and typographic contrast carry all the emotion. Components are architectural: pill-shaped controls at 50-90px radius, 16px-radius cards, hairline dividers, and barely-there elevation. Space is compact and functional, never decorative.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment Canvas | `#ffffff` | Page backgrounds, card surfaces, inverse text on dark fills |
| Onyx | `#0c1018` | Primary body text, headings, input text, icon fills — blue-shifted near-black replaces pure #000 across the interface |
| Pure Black | `#000000` | Footer text, heavy display accents, icon strokes — reserved for maximum weight moments |
| Charred Umber | `#1e1310` | Footer surface, dark contrast bands, gradient origin stop — warm dark anchors the bottom of the spectrum |
| Slate Veil | `#6d7074` | Secondary headings, subdued labels, inactive nav — desaturated mid-gray for quiet hierarchy |
| Ash Mist | `#9e9fa3` | Supporting neutral for secondary UI, dividers, and muted labels. |
| Dawn Arc | `linear-gradient(rgb(40, 14, 1) 0%, rgb(24, 38, 68) 15.2608%, rgb(90, 118, 159) 30.284%, rgb(135, 161, 196) 43.3787%, rgb(193, 211, 230) 58.8313%, rgb(254, 249, 225) 79.7139%, rgb(247, 243, 240) 100%)` | Brand signature — represents the iconic hero gradient (charred umber → steel twilight → warm parchment); used in gradient washes, atmospheric overlays, and the gradient-text reveal effect on display headlines |
| Ember Radiance | `radial-gradient(75% 300% at 109.6% 147.1%, rgb(255, 230, 0) 0%, rgb(237, 148, 84) 29.5837%, rgba(153, 161, 175, 0.06) 100%)` | Accent warmth for radial gradient highlights and hover-state glows — the golden-hour counterpoint to the cool steel-blue arc |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Serrif Condensed — Display headlines — only used at 64-72px for hero and section-opening statements. Condensed letterforms with negative tracking create editorial masthead weight without boldness; the 1.05 line-height lets lines stack tightly into monumental blocks. This font carries the brand's voice at maximum volume.
- **Substitute:** Fraunces (condensed variant) or Playfair Display SC
- **Weights:** 400
- **Sizes:** 64px, 72px
- **Line height:** 1.05
- **Letter spacing:** -0.02em

### Saans Variable — Body, navigation, buttons, inputs, subheadings — the workhorse. Weight 300 whispers, 400 speaks, 500-570 emphasi zes. Variable axis allows fluid weight shifts. Tight -0.01em tracking across all sizes; line-height tightens to 1.0 for UI labels and opens to 1.4 for paragraph body.
- **Substitute:** Söhne or General Sans
- **Weights:** 300, 380, 400, 500, 570
- **Sizes:** 12px, 14px, 16px, 20px, 24px, 32px
- **Line height:** 1.00–1.40
- **Letter spacing:** -0.01em

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Saans Medium — Saans Medium — detected in extracted data but not described by AI
- **Weights:** 400, 570
- **Sizes:** 16px
- **Line height:** 1
- **Letter spacing:** -0.01

### Saans Regular — Saans Regular — detected in extracted data but not described by AI
- **Weights:** 380
- **Sizes:** 16px
- **Line height:** 1.3
- **Letter spacing:** -0.01

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | -0.12px |
| body-sm | — | — | 14px | 1.4 | -0.14px |
| body | — | — | 16px | 1.3 | -0.16px |
| subheading | — | — | 20px | 1.2 | -0.2px |
| heading-sm | — | — | 24px | 1.15 | -0.24px |
| heading | — | — | 32px | 1.1 | -0.32px |
| display | — | — | 64px | 1.05 | -1.28px |
| display-lg | — | — | 72px | 1.05 | -1.44px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1400px
- **Section gap:** 64-96px
- **Card padding:** 32px
- **Element gap:** 10-16px

### Border Radius

- **cards:** 16px
- **inputs:** 50px
- **buttons:** 50px
- **nav-links:** 8px
- **buttons-pill:** 90px

## Components

### Hero Gradient Banner
**Role:** Full-bleed atmospheric section

Full-viewport section using the dawn arc linear gradient (charred umber at 0% through steel twilight at 30-58% to warm cream at 80-100%). Contains a Serrif Condensed display headline at 64-72px, color Onyx (#0c1018), positioned left-aligned with generous left margin. Gradient-text effect applied to the final phrase so it fades into the background.

### Gradient-Text Reveal
**Role:** Display headline accent

Serrif Condensed at 64-72px where a trailing phrase (e.g. 'systems,') uses a CSS mask or color fade to dissolve from #0c1018 into the gradient background, creating a 'horizon line' effect where text becomes atmosphere.

### Pill Action Button
**Role:** Primary navigation/action trigger

50-90px border-radius, transparent or near-white background, Saans Variable 16px weight 400-500, Onyx (#0c1018) text, 12-16px horizontal padding, 6-10px vertical padding. Ghost style — no fill, no border. Example: 'Our work' in bottom-left of hero.

### Top Navigation Bar
**Role:** Primary site navigation

Minimal horizontal nav. Logo 'NEW GENRE' left in Saans Variable 14-16px weight 500 uppercase, letter-spacing 0 or slight positive. Nav items (Work, Approach, Services, News, About, Join, Contact) in Saans 14-16px weight 400, #0c1018, with a thin horizontal rule separating 'About' and 'Join' to signal a functional break. No background, no border-bottom — floats on the gradient.

### Awwwards Side Badge
**Role:** Third-party accolade display

Vertically rotated fixed-position tab on right edge. Black (#0c1018) background, white text in Saans Variable 12px, showing 'W.' and 'Site of the Day'. 8px radius on the visible edge.

### Process Card
**Role:** Three-column service/philosophy card

16px border-radius, near-white surface (#f5f5f5 or canvas with subtle border). 32px padding. Heading 'Think' / 'Create' / 'Build' in Saans Variable 24px weight 500 Onyx. Body description in Saans 16px weight 400 #6d7074. Lower portion filled with a full-bleed photograph (botanical/flower imagery) that bleeds to the card edges, creating a visual cap.

### Text Input
**Role:** Form field

50px border-radius (pill shape), Saans Medium 16px weight 400, transparent or white background, Onyx text, subtle border in #9e9fa3 at 1px. No visible label — placeholder-driven.

### Cookie Consent Dialog
**Role:** Bottom-right compliance notice

White surface, 8-16px radius, fixed bottom-right. Body text in Saans 12-14px weight 400 #0c1018. 'Okay' button: ghost style with no fill, 50px radius, Saans 14px weight 500 Onyx text.

### Footer Dark Band
**Role:** Site footer

Charred Umber (#1e1310) background, white text. Likely contains navigation, legal, and contact info in Saans Variable 12-16px. The footer inherits the darkest stop of the hero gradient, creating a bookend effect with the page opening.

## Do's and Don'ts

### Do
- Use the dawn arc gradient (#1e1310 → #182644 → #5a769f → #87a1c4 → #c1d3e6 → #fef9e1 → #f7f3f0) as a full-bleed atmospheric wash for hero and transition sections — never as a small element background.
- Set all display headlines in Serrif Condensed at 64-72px weight 400, line-height 1.05, letter-spacing -0.02em; the condensed forms and tight tracking are the signature.
- Use Onyx (#0c1018) for all primary text rather than pure #000000 — the blue undertone keeps the palette coherent with the gradient's steel-blue midsection.
- Apply the gradient-text dissolve effect on the final 20-40% of display headlines so text visually transitions into the background gradient.
- Use 50-90px border-radius for all interactive elements (buttons, inputs) to create pill shapes; 16px radius for cards; 8px for small UI elements.
- Maintain -0.01em letter-spacing on all Saans Variable text regardless of size — the slight tightening is part of the geometric precision.
- Keep the interface monochromatic; let photographic content, the gradient, and typographic contrast carry all visual emotion.

### Don't
- Never introduce chromatic accent colors (no red, green, blue, or purple for buttons, badges, or tags) — the system is deliberately achromatic at the UI layer.
- Never use Serrif Condensed below 48px — the condensed display forms need scale to read as editorial type; small sizes collapse into illegibility.
- Never use bold weights (600-700) in Saans Variable — the system relies on 300-500; authority comes from size and spacing, not weight.
- Never apply drop shadows or box-shadows to cards or buttons — elevation is expressed through the gradient and surface lightness, not shadows.
- Never use pure black (#000000) for body text — always #0c1018; reserve #000000 for the footer text and maximum-contrast icon strokes.
- Never use border-radius below 8px on any element — flat 0px corners conflict with the pill-shaped control language.
- Never use line-height above 1.4 or below 1.0 in Saans Variable — the 1.0 ceiling creates compact UI labels, the 1.4 floor handles body copy; outside this range the geometric precision breaks.

## Surfaces

- **Canvas** (`#ffffff`) — Default page background for content sections
- **Gradient Atmosphere** (`#7ba1c4`) — Full-bleed hero and transition sections — the dawn arc gradient creates spatial drama without separate surface treatments
- **Card Surface** (`#f5f5f5`) — Process and content cards — whisper-light off-white that recedes against the canvas
- **Dark Ground** (`#1e1310`) — Footer and dark contrast bands — the gradient's terminal stop becomes a solid surface

## Imagery

Imagery strategy is photography-first, always full-bleed within card boundaries with no internal padding or framing. Subject matter is botanical and organic — flower buds, stems, petals in their life-cycle stages (closed bud, opening bloom, full flower), evoking growth, transformation, and emergence. Photographs are natural-light, warm-toned, with deep shadow detail rather than high-key or studio-lit. Treatment is raw and unfiltered — no duotone, no color grading overlay, no masking effects. Photography occupies the lower 50-60% of each process card, functioning as a visual cap rather than decorative ornament. No illustration, no abstract graphics, no product screenshots visible — the studio trusts photography to carry the brand's emotional weight while typography and gradient handle atmosphere.

## Layout

Full-bleed page model with no max-width constraint on hero and transition sections (gradient spans edge-to-edge). Content sections use a max-width of approximately 1400px centered. Hero pattern: full-viewport gradient with left-aligned monumental serif headline occupying the upper-left quadrant, leaving vast negative space below. Section rhythm is dramatic — a dark gradient hero flows directly into a light gradient continuation, which transitions to a white content section, creating a dawn-to-daytime arc. Content sections use a 3-column card grid for process/philosophy blocks, with cards arranged horizontally and equal-height. Navigation is a minimal top bar with no background, floating directly on the gradient. A vertically-oriented accolade badge pins to the right edge. Vertical spacing is generous between major sections (64-96px) but compact within components (10-16px gaps). The overall grid tendency is 12-column with generous gutters, and asymmetric left-aligned content placement rather than centered stacks.

## Similar Brands

- **Resn** — Same condensed display serif headlines at oversized scale against atmospheric gradient backgrounds, with botanical/organic photography as emotional counterpoint to typographic authority
- **Locomotive (locomotive.ca)** — Identical editorial serif + geometric sans pairing, full-bleed gradient hero sections that dissolve into white content, and the same achromatic interface palette that lets a single gradient carry all the color
- **Active Theory** — Cinematic full-viewport gradient washes, minimal achromatic UI, and oversized condensed type that reads as magazine masthead rather than web headline
- **Ueno** — Monochrome interface discipline with one signature atmospheric element (here, the gradient), condensed display serif, and the agency-portfolio pattern of letting work photography do the emotional heavy lifting
