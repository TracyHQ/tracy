# Letter — Style Reference
> Private gallery with iridescent vault artifacts. A black-walled showroom where serif headlines float above chrome sculptures on tinted gallery walls.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Letter is a private-banking platform that reads like a gallery exhibition for high-net-worth finance. The visual system pivots between a deep ink-black hero stage and a bright editorial body, with 3D metallic and prismatic renders as the recurring sculptural accent. Typography is split into two deliberate registers: a wide grotesque for interface text and navigation, and a high-contrast serif at 80px for headlines that read like magazine cover titles. Color is used as architectural punctuation — three near-gray tinted panels (peach, mint, lavender) act as gallery walls, while teal, violet, and blue claim the action buttons as discrete brand moments. Components are square and confident: 2px corner radii, generous horizontal button padding, and zero decorative shadow — the renders and typography do all the emotional work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Vault Ink | `#191b1f` | Hero background, dark surface stage, dark card panel — deep near-black with the faintest blue chill, warmer than pure black but harder than charcoal |
| Paper White | `#ffffff` | Page canvas, light card surface, inverse text on dark backgrounds, outlined button fills |
| Mist White | `#f6f9f9` | Soft section background, subtle card surface, secondary canvas — sits one step below pure white without grayness |
| Fog Gray | `#9fabad` | Muted helper text, secondary metadata, low-emphasis labels — a true middle gray with no chromatic bias |
| Hairline | `#e6ebec` | Borders, dividers, card outlines, button strokes at low contrast — barely-there separators that define structure without drawing the eye |
| Obsidian | `#000000` | Primary text, headline ink, logo mark — the only true black in the system, reserved for maximum-contrast typography |
| Peach Wall | `#fcede1` | Hairline borders, dividers, input outlines, and card edges on light surfaces. |
| Mint Wall | `#eefcef` | Tinted card background — cool mint gallery wall, likely the investing/savings panel |
| Lavender Wall | `#e6def0` | Tinted card background — soft lavender gallery wall for the credit or lending panel |
| Deep Teal | `#186f64` | Teal action color for filled buttons, selected navigation states, and focused conversion moments. |
| Electric Violet | `#536eff` | Violet action color for filled buttons, selected navigation states, and focused conversion moments. |
| Royal Violet | `#644bc4` | Secondary action buttons, hover state on violet CTAs, accent borders — deeper companion to Electric Violet for depth |
| Sapphire Blue | `#154ea5` | Blue action color for filled buttons, selected navigation states, and focused conversion moments. |

## Typography

### Neufile Grotesk Extended — Body copy, navigation links, button text, card descriptions, footer text, and medium-weight subheads at 28px. This is the working sans — wide apertures and extended proportions give it an editorial, almost monospace rhythm at small sizes. Weight 400 for running text, weight 500 for subheads and emphasized UI labels.
- **Substitute:** Söhne, Inter, IBM Plex Sans
- **Weights:** 400, 500
- **Sizes:** 13px, 16px, 28px
- **Line height:** 1.30, 1.40, 1.00, 2.00

### Albra Sans — All headlines and display text. The serif/sans split is the system's defining typographic move: a high-contrast serif at 80px line-height 1.10 creates magazine-cover presence for the hero, while a 46px line-height 1.20 handles section titles. The 22px size at weight 600 works as a serif subhead — unusual and signature. Positive 0.020em letter-spacing on a serif is anti-convention (most serifs tighten at display sizes), here it breathes the letterforms open for gallery-label elegance.
- **Substitute:** GT Sectra, Tiempos Headline, Canela, Playfair Display
- **Weights:** 600
- **Sizes:** 22px, 46px, 80px
- **Line height:** 1.10, 1.20
- **Letter spacing:** 0.0200em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.4 | 0px |
| body | — | — | 16px | 1.4 | 0px |
| subheading | — | — | 22px | 1.2 | 0.44px |
| heading-sm | — | — | 28px | 1.3 | 0px |
| heading | — | — | 46px | 1.2 | 0.92px |
| display | — | — | 80px | 1.1 | 1.6px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-96px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **tags:** 2px
- **cards:** 0px
- **inputs:** 2px
- **buttons:** 2px

## Components

### Navigation Bar (Dark)
**Role:** Primary navigation over hero

Transparent dark bar (#191b1f) with white Neufile Grotesk Extended 13px nav links. Logo mark (white S-shape) left, 7 nav items spaced 23px horizontal padding, 'Join' as ghost button (white border, 2px radius) and 'Sign In' as text link on the far right. No background blur — sits on pure dark.

### Navigation Bar (Light)
**Role:** Primary navigation on light sections

White background bar, #191b1f text and logo. Same structure as dark nav but inverted. 'Join' becomes a dark filled button (#191b1f fill, white text, 2px radius) and 'Sign In' remains text.

### Teal Filled Button
**Role:** Primary action — invest, deposit

Background #186f64, white text in Neufile Grotesk Extended 16px weight 500. 2px border radius. Padding 12px vertical, 27px horizontal. No shadow. The flagship CTA color — appears on 'Invest Now' actions.

### Violet Filled Button
**Role:** Secondary action — borrow, credit

Background #536eff, white text in Neufile Grotesk Extended 16px weight 500. 2px border radius. Padding 12px vertical, 27px horizontal. Appears on 'Borrow Now' actions.

### Blue Filled Button
**Role:** Tertiary action — card, checking

Background #154ea5, white text in Neufile Grotesk Extended 16px weight 500. 2px border radius. Padding 12px vertical, 27px horizontal. Appears on 'Get Your Card' actions.

### Ghost Text Link
**Role:** Tertiary action — learn more

No background, no border. Dark text (#191b1f) in Neufile Grotesk Extended 16px. Sits immediately right of a filled button as a low-commitment alternative. Color-tinted to match its sibling filled button (teal link beside teal button, etc.).

### Tinted Feature Card
**Role:** Product/service showcase panel

Full-width or half-width card with a tinted near-gray background — Peach Wall (#fcede1), Mint Wall (#eefcef), or Lavender Wall (#e6def0). Zero border radius, no border, no shadow. Contains a serif Albra Sans 22px subhead, a 16px body description, a filled action button, a ghost link, and a large 3D render occupying the right or lower half. 32px internal padding. The tinted background is the card's only differentiator from the white page.

### Dark Hero Stage
**Role:** Above-the-fold hero section

Full-bleed #191b1f background. Centered Albra Sans 80px display headline in white, 46px or 22px serif subhead below, and a large 3D metallic/chrome render with dramatic light flares occupying the lower 60% of the viewport. No border, no card treatment — the dark background IS the surface. Generous vertical padding (96-128px top, 64-96px bottom).

### Split Content Section
**Role:** Body content with paired 3D render

Two-column layout, roughly 50/50. Left column: Albra Sans 46px heading, 16px body text, optional CTA. Right column: 3D render (iridescent card, liquid-metal form, chrome sphere) with generous breathing room. Background alternates between white and #f6f9f9 between sections.

### 3D Abstract Render
**Role:** Signature visual element

Full-color 3D renders with metallic, prismatic, or iridescent surfaces. Floating in space with dramatic directional lighting — lens flares, caustic light patterns, and subsurface scattering. Treatment: sharp edges, no rounded masks, overlapping light bloom. Each render is a one-off composition, not a reusable component, but they share a consistent material language: polished chrome, dichroic glass, and liquid metal. This is the brand's most distinctive visual asset.

## Do's and Don'ts

### Do
- Use Albra Sans serif for all headlines and display text — never substitute a sans-serif for headings; the serif/sans split is the system's identity
- Keep button corner radius at 2px — the near-square edges read as architectural confidence, not friendliness
- Use 80px Albra Sans for hero headlines only; section titles cap at 46px
- Pair every filled colored button with an adjacent ghost text link in the matching brand color — teal button + teal link, violet button + violet link
- Let 3D renders float in negative space without containers, borders, or rounded masks — the raw edges of the render ARE the visual frame
- Use tinted card backgrounds (#fcede1, #eefcef, #e6def0) for product panels; reserve #ffffff and #f6f9f9 for structural sections
- Maintain 27px horizontal button padding — this generous horizontal breathing is what makes the buttons feel premium rather than functional

### Don't
- Never use shadows, drop shadows, or box-shadows on cards, buttons, or sections — the system is flat and lets background color and 3D renders do the depth work
- Don't introduce additional border radii beyond 2px — no rounded cards, no pill buttons, no circular avatars
- Don't use the brand colors (#186f64, #536eff, #644bc4, #154ea5) for body text, borders, or backgrounds — they are reserved for action moments and headlines only
- Never set headlines in a sans-serif — the serif Albra Sans is non-negotiable for the editorial voice
- Don't use the tinted card backgrounds (#fcede1, #eefcef, #e6def0) for body text or large surface areas — they are gallery walls for 3D renders, not page backgrounds
- Don't apply gradients to UI components — gradients appear only in 3D renders and the hero light burst, not in buttons, cards, or backgrounds
- Avoid tight letter-spacing on serif headlines — the 0.020em positive tracking is deliberate and creates the gallery-label feel

## Elevation

The system is intentionally shadowless. Depth is created through surface color contrast (white → #f6f9f9 → tinted walls → #191b1f) and through 3D renders that carry their own internal lighting. No box-shadows, no drop shadows, no glows on UI elements. This flat treatment is a luxury signal — the confidence to not use visual crutches.

## Surfaces

- **Vault Ink** (`#191b1f`) — Hero stage, dark section backgrounds, dark nav — the deepest surface
- **Paper White** (`#ffffff`) — Page canvas, light cards, primary content surface
- **Mist White** (`#f6f9f9`) — Alternating section background, subtle elevation above white
- **Tinted Gallery Walls** (`#fcede1`) — Product panel backgrounds — peach, mint, lavender variants act as gallery walls for 3D renders

## Imagery

3D abstract renders are the dominant visual asset — polished chrome spheres, iridescent prismatic card forms, liquid-metal organic shapes, and faceted geometric crystals. Treatment: full-color, high-contrast, with dramatic directional lighting (caustic light patterns, lens flares, subsurface glow on metallic surfaces). Renders are never masked or placed in containers — they float in raw negative space with sharp edges. No photography, no illustration, no flat icons. Icon style: minimal outlined line icons in nav and UI chrome, monochrome white or #191b1f, thin consistent stroke weight. Role: the 3D renders are explanatory content (visualizing abstract financial concepts as physical artifacts) and brand atmosphere simultaneously. Density: text-dominant overall, but each major section features one large hero render that commands 40-60% of the viewport.

## Layout

Max-width ~1200px centered container. Hero is full-bleed dark with centered headline stack (display → subhead → no button above fold), then transitions to a rhythm of alternating light sections. Pattern: dark hero → white split section → tinted card row (2-column grid) → white split section → tinted card row. Sections use generous vertical padding (64-96px) for gallery-walk pacing. Content arrangement: 50/50 split layouts pairing text with 3D renders, with text consistently on the left and renders on the right. Tinted feature cards form a 2-column grid for product panels. Navigation: sticky top bar that transitions from dark (on hero) to light (on scroll). No sidebar, no mega-menu.

## Similar Brands

- **Mercury** — Serif headlines paired with sans-serif body, restrained color palette with single accent moments, luxury private-banking tone, near-zero border radii
- **Arc** — Dramatic dark-to-light section transitions, premium typography mixing serif display with sans body, generous whitespace as luxury signal
- **Linear** — Dark hero stage transitioning to clean light sections, precise typographic hierarchy, product panels with distinct color identity
- **Ramp** — Clean financial UI with generous horizontal button padding, flat surfaces without shadows, restrained chromatic palette
- **Stripe** — Editorial typography treatment applied to financial product, gallery-like section rhythm, confidence through typographic restraint rather than visual effects
