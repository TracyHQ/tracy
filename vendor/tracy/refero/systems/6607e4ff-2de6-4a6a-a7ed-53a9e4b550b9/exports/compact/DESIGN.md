# Analogue aF-1 — Style Reference
> Vogue spread meets Bauhaus blueprint

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Analogue aF-1 speaks the visual language of a luxury editorial print magazine: stark white canvases, Garamond serif whispers for moments of meaning, and a single jolt of electric blue that only appears when a hand is asked to act. Surfaces are flat, defined by hairline borders and generous corner radii (20-30px) rather than shadows — depth comes from layering soft radial washes and full-bleed photography behind film-strip frames. The palette is almost fanatically achromatic; the blue is rationed like ink, reserved exclusively for the primary action and atmospheric product vignettes. Components feel like printed editorial spreads — confident negative space, confident typography, and no decoration that doesn't earn its place.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cobalt Signal | `#002fff` | Violet action color for filled buttons, selected navigation states, and focused conversion moments. |
| Pure White | `#ffffff` | Page canvas, card surfaces, button text on cobalt fill, heading text on dark sections |
| Graphite | `#171717` | Primary body text, heading text, hairline borders, icon strokes — the workhorse near-black that carries UI structure |
| Carbon | `#070707` | Deepest text, dark gradient anchor points, near-black accents where maximum contrast is needed |
| Ink | `#000000` | Absolute black for borders, icons, and the film-strip frame effect — appears most in structural borders rather than type |
| Fog | `#ededed` | Soft card surface lift, input fields, subtle background differentiation from pure white canvas |
| Mist | `#b9b9b9` | Light surface wash, disabled or decorative backgrounds |
| Dove | `#c3c3c3` | Mid-neutral border for tertiary dividers |
| Iron | `#696969` | Muted body copy, secondary borders, placeholder text — the dominant mid-gray carrying prose-level hierarchy |
| Cobalt Mist | `radial-gradient(50% 75%, rgb(0, 54, 140) 0%, rgb(0, 79, 206) 10.68%, rgb(237, 237, 237) 100%)` | Atmospheric radial gradient anchor (mid-stop) for the hero blue vignette |

## Typography

### ITC Garamond Std Light Narrow — Editorial serif — deployed for the brand-defining typographic moments: the 'Analogue aF-1' wordmark, the nostalgic pull-quote ('Remember when every shot was a moment to cherish?'), and section-level statements. Light weight at large sizes is deliberately anti-luxury-tech; a Garamond at 64px weight 400 whispers where most product pages shout with bold sans. Narrow variant tightens the serif into modern proportions.
- **Substitute:** EB Garamond, Cormorant Garamond, or Playfair Display (lighter weights)
- **Weights:** 400
- **Sizes:** 15px, 17px, 30px, 40px, 64px
- **Line height:** 0.90, 1.20
- **Letter spacing:** -0.018em at 64px, -0.022em at 40px, -0.023em at 30px, -0.017em at 17px, -0.017em at 15px

### Graphik Medium — Geometric sans for all functional UI: navigation, buttons, input fields, captions, body labels, and the massive 150px display headline. Single weight (400) at every size creates a remarkably consistent voice — no bold/light toggle. The 150px instance is the 'af-1' hero display. Extremely tight tracking (-0.067em at the largest size) pushes the geometric forms into near-architectural density.
- **Substitute:** Inter, Manrope, or DM Sans at weight 400
- **Weights:** 400
- **Sizes:** 11px, 13px, 14px, 15px, 16px, 22px, 34px, 40px, 150px
- **Line height:** 0.85, 1.00, 1.20, 1.50
- **Letter spacing:** -0.0670em, -0.0530em, -0.0450em, -0.0300em, -0.0250em, -0.0210em, -0.0200em

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.2 | 0px |
| body | — | — | 15px | 1.2 | -0.26px |
| heading-sm | — | — | 22px | 1.2 | -0.46px |
| heading | — | — | 34px | 1 | -1.02px |
| heading-lg | — | — | 40px | 1 | -0.88px |
| display | — | — | 64px | 0.9 | -1.15px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 50px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **cards:** 20px
- **pills:** 100px
- **images:** 30px
- **inputs:** 15px
- **buttons:** 10px

## Components

### Primary Action Button
**Role:** The single most important interactive element — a filled cobalt blue pill that commands the visual hierarchy

Background: #002fff. Text: #ffffff, Graphik Medium 14px, weight 400. Padding: 10px 20px. Border-radius: 10px. No border, no shadow. This button is the system's one chromatic moment — use it sparingly, only for the singular ask per screen.

### Ghost/Dismiss Button
**Role:** Secondary negative action — opt-out companion to the primary CTA

Background: transparent. Text: #171717, Graphik Medium 14px. Padding: 10px 20px. Border: 1px solid #ededed. Border-radius: 10px. On hover the border darkens to #171717.

### Email Input Field
**Role:** Signup form input for the hero newsletter capture

Background: #ffffff. Border: none. Placeholder text: #b9b9b9, Graphik Medium 14px. Padding: 15px 20px. Border-radius: 15px. The field visually merges with the adjacent button into a continuous pill. Inset white glow (rgba(255,255,255,0.15) 0px 0px 0px 1px inset) is the only shadow in the system.

### Scroll Prompt Pill
**Role:** Persistent floating CTA at the bottom of hero sections

Background: #ffffff with slight transparency/blur. Text: #696969, Graphik Medium 12px. Border-radius: 100px (full pill). Positioned center-bottom, indicates downward scroll.

### Product Image Card
**Role:** Showcase of the camera product at multiple angles

Background: #ededed. Border-radius: 30px. No shadow, no border. Product render sits centered on the soft gray surface. The 30px radius gives the hardware a premium, almost pillowy presentation.

### Pre-Order Action Card
**Role:** Right-column purchase block in the product detail section

Right-aligned text block: 'Pre-order now' heading (Graphik Medium 34px, #171717), subtitle, price (Graphik Medium 22px bold-weight, #171717). Contains the Primary Action Button (#002fff) and Ghost Dismiss Button. Below: small payment method text in #696969.

### Testimonial Mini Card
**Role:** Social proof — features a person and their handle

Small square card with rounded corners (20px), showing a portrait photo with name overlay in #ffffff serif. Compact, unobtrusive, positioned floating in the layout.

### Film-Strip Full-Bleed Frame
**Role:** Editorial photography section with analog film border treatment

Full-width image section. Left and right edges show a repeating film-perforation pattern in #000000, framing the central photograph. Central image: dark, moody editorial photography. Serif headline overlays the image center in #ffffff. The film-strip border is the signature visual motif — a literal reference to analog photography.

### Hero Gradient Banner
**Role:** Atmospheric product reveal at page top

Full-bleed section with a radial blue-to-white gradient. Center text: 'Analogue aF-1' (Graphik Medium 150px, #ffffff) with subtitle in #ededed. The blue radiates from the center-bottom and fades to white at edges, creating a product-spotlight atmosphere. The camera render sits centered in the lower half.

### Brand Wordmark
**Role:** Top-center logo lockup

'analogue' in Graphik Medium, lowercase, #000000. Small, precise, centered in the header. No tagline, no icon — the wordmark is the entire identity mark.

### Language Selector
**Role:** Top-right locale switcher

Compact text control: globe icon + 'English' in Graphik Medium 12px, #171717. Subtle, right-aligned in header.

### Press Logo Strip
**Role:** Media mention band at section transition

Horizontal row of press logos (Techeblog, Camera, PetaPixel, etc.) in #696969 on a white band. Separated by vertical dividers in #ededed. Establishes editorial credibility.

## Do's and Don'ts

### Do
- Use Garamond weight 400 at 40-64px for editorial moments — quotes, product names, section openers. This is the system's signature voice.
- Reserve #002fff exclusively for the single primary action on any given screen. Never use it for decoration, tags, or secondary buttons.
- Apply 20px radius to cards and 30px radius to product imagery. The rounded softness is a counterpoint to the stark black/white palette.
- Anchor sections with 50px vertical gaps and keep card padding at 20px. The compact density is intentional — the system breathes through whitespace, not through padding bloat.
- Use Graphik Medium at weight 400 exclusively. Do not introduce bold or light variants — the single-weight consistency is the design language.
- Frame full-bleed photography with the film-strip perforation motif when presenting analog/nostalgic imagery. The border IS the brand statement.
- Set letter-spacing at -0.018em or tighter for any display text above 30px. The tight tracking pushes geometric forms into architectural density.

### Don't
- Never apply #002fff to backgrounds, icons, or text — it is a button fill only. Decorative blue dilutes its power as the system's one action color.
- Do not introduce drop shadows. The system uses flat surfaces and hairline borders. The only shadow permitted is the inset white glow on inputs.
- Do not use bold weights on Garamond. The light weight is the point — bold Garamond breaks the editorial whisper into a shout.
- Never use corner radii below 10px for interactive elements. The rounded geometry is non-negotiable for the premium feel.
- Do not add gradients to UI components. Gradients appear only as atmospheric washes on full-bleed sections, never on buttons, cards, or inputs.
- Do not use warm colors, greens, oranges, or reds for any state. The system is achromatic + cobalt. If you need a success/error state, use the neutral scale (#171717, #696969).
- Do not use Garamond for functional UI text (buttons, labels, inputs). It is reserved for editorial moments. Graphik handles everything functional.

## Elevation

The system is intentionally flat. Elevation is communicated through surface color shifts (white → #ededed) and generous border-radius, never through shadows. The only shadow in the entire system is an inset white glow on input fields. This is a deliberate editorial-print aesthetic — like ink on paper, not like glass on glass.

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background — dominant surface across all sections
- **Fog Surface** (`#ededed`) — Elevated card surface, input field backgrounds, subtle differentiation
- **Blue Wash** (`#00368c`) — Atmospheric radial gradient vignette in the hero — the only chromatic surface treatment

## Imagery

The visual language is editorial photography with product renders. The hero features a high-fidelity 3D product render of the Analogue aF-1 camera on a soft blue radial wash — the product is presented dead-center, no lifestyle context, the object IS the hero. The second section is full-bleed dark editorial photography (couple on a beach at dusk) framed by a black film-strip perforation pattern on left and right edges — this is the signature motif, a literal analog film border. Lower sections show additional product renders at multiple angles (back, front, side) on soft #ededed card backgrounds. Photography treatment is moody, cinematic, low-key — warm skin tones against deep blue dusk. No stock-photo feel anywhere. Icons are minimal: a globe for language, no decorative iconography.

## Layout

Page is max-width 1200px centered. Hero is full-bleed with centered text and centered product render — symmetric, vertical stack. Second section is full-bleed with film-strip borders on edges, headline centered over image. Third section splits into a two-column layout: left column is a vertical stack of product detail cards (alternating image orientations, 20px radius), right column is a sticky-ish pre-order action card with text + CTA stack. A small floating testimonial card overlaps the product stack. The grid is asymmetric in the product section but symmetric in hero and editorial photo sections. Navigation is minimal: centered wordmark top, language selector top-right, no visible menu until scroll. Section rhythm: white → full-bleed dark image → white with 2-column product grid. Spacing is compact (50px section gaps) with generous internal padding around the hero gradient.

## Similar Brands

- **Leica Camera** — Same editorial-print approach to a photography product — serif type, generous whitespace, minimal UI, and an almost religious devotion to the product as the hero image
- **Teenage Engineering** — Stark black/white product pages with geometric sans-serif type and product renders on neutral gray card surfaces with generous border-radius
- **Aesop (aesop.com)** — Editorial typography mixing serif and sans, generous negative space, an almost monochrome palette with minimal accent color, and confident asymmetric product presentations
- **Nothing (nothing.tech)** — Product launch page with centered hero, dark editorial photography, and the same compact density + single-accent-color restraint
- **Arc Browser** — Mixes a distinctive serif (in Arc's case, custom) with a clean geometric sans for functional UI, on near-monochrome canvases with one electric accent
