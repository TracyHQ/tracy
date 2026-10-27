# Spring/Summer — Style Reference
> Scandinavian design annual on celadon paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Spring/Summer is an editorial agency annual printed on celadon paper: a single pale sage canvas, massive compressed display type in deep plum, and a near-monochrome palette where the only color decisions are paper, ink, and image. The design is calm and confident — pages breathe with generous whitespace, navigation stays in a whisper-thin top bar, and the display face does all the heavy lifting by being absurdly large rather than by adding weight, gradient, or decoration. Projects are presented as oversized image cards with small white overlay labels, like spreads in a printed portfolio. Color never decorates; it only separates ink from paper.

## Colors

| Name | Value | Role |
|------|-------|------|
| Sage Paper | `#e5ebda` | Page canvas — the only background the site uses. A pale desaturated celadon that warms the page without ever reading as a color choice, so the plum ink and photography do all the talking |
| Plum Ink | `#44394c` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Paper White | `#ffffff` | Card surfaces, image backgrounds, and the white overlay panels sitting on top of project photographs. The only non-canvas surface color in the system |
| Stone Border | `#c0c3b6` | Hairline dividers and structural borders. A warm gray that disappears against the sage canvas but keeps the grid legible |
| Ash Border | `#b0b2a9` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |

## Typography

### Montreal — All interface, navigation, body, caption, and mid-size editorial text. Used at a single weight 400 with a slight positive tracking (0.02–0.023em) that gives labels a quiet, typeset quality. The 43px size carries agency descriptors and large taglines. Freely available substitute: Inter or Söhne.
- **Substitute:** Inter
- **Weights:** 400
- **Sizes:** 12px, 13px, 14px, 18px, 43px
- **Line height:** 1.10–1.50
- **Letter spacing:** 0.0200em at 12-18px, 0.0230em at 14px body

### Grotesk — The signature display face. Weight 400 only, but used at 170–386px with crushed 0.75–0.76 line-height so letters nearly touch and the type feels carved rather than set. The entire visual identity depends on this single face being enormous — there is no bold weight, no italic, no alternative. Substitute: Druk, Söhne Breit, or NB Architekt — any compressed, geometric grotesque that holds up at 300+ pixels.
- **Substitute:** Druk Wide or NB Architekt
- **Weights:** 400
- **Sizes:** 40px, 170px, 386px
- **Line height:** 0.75, 0.76

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0.24px |
| body | — | — | 14px | 1.5 | 0.32px |
| body-lg | — | — | 18px | 1.4 | 0.36px |
| heading-sm | — | — | 40px | 0.76 | 0px |
| subheading | — | — | 43px | 1.1 | 0.86px |
| display | — | — | 170px | 0.75 | 0px |
| display-lg | — | — | 386px | 0.75 | 0px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 64-96px
- **Card padding:** 20px
- **Element gap:** 12px

### Border Radius

- **all:** 4px
- **cards:** 4px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Top Navigation Bar
**Role:** Persistent header with brand mark, primary links, and live status

Full-width, no background fill, sits directly on the sage canvas. Left: small circular monogram + 'Spring/Summer*' wordmark in Montreal 14px Plum Ink. Center: three nav labels (What we do, Our work, About us) in Montreal 14px, 12px gap between items. Right: live clock '18:35:18' in Montreal 13px and 'Copenhagen' location label. No border, no shadow, no fill — the nav is a thin horizontal band of type on the canvas.

### Hero Display Headline
**Role:** The signature typographic moment that defines the brand

Massive Grotesk at 170–386px, weight 400, line-height 0.75, Plum Ink (#44394c), flush left. Sets the editorial tone — no background, no decoration, no CTA beside it. Letters nearly collide vertically; the sheer scale carries the page. The 386px size is reserved for the first-fold hero word (e.g. 'NEW WORK'); 170px is used for subsequent display words in the same line.

### Agency Descriptor
**Role:** Small editorial label sitting above the hero display

Montreal 14px, Plum Ink, positioned in the upper-left grid column. Reads as a typeset caption, not a tagline. Single line, normal sentence case.

### Project Card
**Role:** Portfolio tile in the horizontal project carousel

White (#ffffff) surface, 4px radius, no border, no shadow. Full-bleed project image fills the card; a small white overlay panel sits bottom-left of the image containing project title and client in Montreal 14px Plum Ink. Cards are large (roughly 480–640px wide, 600–800px tall) and arranged in a horizontal row that scrolls off-screen. 12–20px gap between cards. The image does the work — the card chrome is invisible.

### Project Overlay Panel
**Role:** Small white label floating on top of project photography

White background, 4px radius, 12–20px padding, no border. Contains a one- to three-line description in Montreal 14px Plum Ink. Sits flush to the bottom-left of the card with a 20px inset. Functions as a caption strip, not a callout — small relative to the image.

### Horizontal Project Carousel
**Role:** Scrollable row of project cards

Cards arranged left-to-right with 12–20px gaps. The row extends past the right viewport edge and scrolls horizontally. Two small arrow controls (← →) in Montreal 14px Plum Ink sit above the row, right-aligned, 20px apart. No scrollbar styling — the arrows are the only affordance.

### Carousel Arrow Control
**Role:** Minimal scroll indicator for the project row

Plain typographic arrows (← →) in Montreal 14px Plum Ink, no button background, no border, no padding. Two arrows sit 20px apart, separated by a thin space. The control is the text itself, not a button.

### Live Status Indicator
**Role:** Real-time clock and location chip in the nav

Montreal 13px Plum Ink, preceded by a small dot/circle icon. Reads as '◐ 18:35:18    Copenhagen'. No background, no border — pure inline type with a 20px gap between the clock and the location.

### Input Field
**Role:** Form input for the 'Send us your thoughts' contact block

No visible background fill (sits on sage canvas), 1px solid #b0b2a9 bottom border only, 4px radius on the border corners. Placeholder text in Montreal 14px Plum Ink. Padding 12px vertical. Underline-only styling — no boxed input.

### Section Paragraph
**Role:** Long-form editorial body text below the hero

Montreal 18px or 14px Plum Ink, line-height 1.40–1.50, max-width roughly 720px, flush left. Sentence case, no drop cap, no first-line indent. Reads as a magazine column.

### Brand Wordmark
**Role:** Top-left brand lockup

Small filled circle monogram in Plum Ink followed by 'Spring/Summer*' in Montreal 14px Plum Ink. The asterisk after 'Summer' is a permanent part of the wordmark — not a footnote symbol, a brand device.

## Do's and Don'ts

### Do
- Set the hero display in Grotesk weight 400 at 170–386px, line-height 0.75 — never in a bold weight, never with looser leading
- Use Plum Ink (#44394c) for all text and icons; reserve Sage Paper (#e5ebda) exclusively as the page canvas
- Keep the entire palette at five colors: sage, plum, white, stone border, ash border
- Apply Montreal at weight 400 only, with +0.02em to +0.023em letter-spacing on sizes 12–18px
- Use 4px radius on every rectangular element — cards, inputs, overlays, buttons
- Build elevation by switching from Sage Paper to Paper White, never with drop shadows
- Let project images fill their cards edge-to-edge; add the overlay panel as a small caption strip, not a panel

### Don't
- Do not add a sixth color or use accent hues for buttons, badges, or links — the system is intentionally monochrome
- Do not use Grotesk for body copy, nav, or any size under 40px
- Do not use Montreal for display sizes above 43px — display is Grotesk's job
- Do not apply drop shadows, glows, or blur to any element — elevation comes from surface contrast only
- Do not round corners beyond 4px — softer radii will make the design feel like a product UI rather than an editorial spread
- Do not introduce gradients, textures, or patterned backgrounds onto the sage canvas
- Do not place CTA buttons with colored fills — the system has no primary action color; affordances are typographic arrows and inline links in Plum Ink

## Elevation

The design uses no shadows. Elevation is created entirely through the sage-to-white surface step, not through drop shadows or blur. All corners are 4px — sharp enough to feel editorial, never soft enough to feel like a product UI.

## Surfaces

- **Canvas** (`#e5ebda`) — Full-bleed page background, sole surface for the entire site
- **Paper** (`#ffffff`) — Image cards, project overlays, and the only elevated surface above the canvas

## Imagery

Imagery is editorial photography treated as full-bleed cards: large landscape crops of work (environmental shots, product stills, campaign imagery) with no rounded masks, no duotone treatment, no overlays beyond a small white caption strip. Photography occupies the majority of the visual space below the hero — the page is image-heavy in the work sections, text-only above and between them. There are no illustrations, no 3D renders, no icon sets beyond the monogram and a small clock dot. Icons are not used as a system; navigation and interaction are communicated through type and arrow glyphs.

## Layout

Max-width contained at roughly 1440px, centered, with a 20px outer margin. The hero is flush-left, text-dominant: a small descriptor sits in the upper-left grid column, a massive Grotesk display headline fills the left two-thirds, and a single product card sits in the right third overlapping into the first scroll position. Below the hero, a horizontal project carousel scrolls left-to-right, with arrow controls floating above the row. Long-form sections follow as single-column 720px text blocks, left-aligned, on the same sage canvas. The page never alternates dark/light bands — Sage Paper is the only background, and Paper White appears only as card surfaces.

## Similar Brands

- **Pentagram** — Same editorial-discipline approach: monochrome palette, oversized display type, and a portfolio presented as large image cards with minimal chrome
- **Manual (manual.co)** — Same quiet, near-monochrome agency aesthetic with massive compressed display type and a single muted canvas color
- **Locomotive (locomotive.ca)** — Same typographic-led portfolio structure where oversized display headlines and image-led project cards carry the page
- **Holt Renfrew (editorial spreads)** — Same annual-report sensibility: pale paper-toned backgrounds, single dark ink color, and oversized sans-serif display type
- **Bureau Cool** — Same restrained agency-portfolio language: muted background, one near-black ink, and display type that does the entire visual job through scale alone
