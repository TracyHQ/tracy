# Poly — Style Reference
> Ember on porcelain — one warm gradient ember floating on an otherwise pure white editorial page, surrounded by quiet serif headlines and full-bleed photography.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Poly is editorial software: a warm off-white canvas (#f4f4f4), near-black ink for text and UI, and a single ember-orange-to-red gradient reserved for the brand mark. Photography does the heavy atmospheric lifting — full-bleed desk scenes with natural materials and warm directional light replace illustration and decoration. Display type is a humanist serif (Haffer at 450, with liga and ss04 features) pulled tight at -0.02em, paired with Inter for UI. The system feels restrained the way a magazine spread feels restrained: one chromatic moment, hairline borders instead of shadows, 8px radii everywhere, and a column grid that lets the photography breathe.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ember Gradient | `linear-gradient(134.77deg, #f4824d 25.1%, #f42919 74.9%)` | Brand mark, Poly logo, the sole chromatic accent — warm orange fading to signal red, used only on identity, never on body UI |
| Porcelain | `#f4f4f4` | Page canvas, card surfaces, inverted text on dark photo backgrounds |
| Onyx | `#000000` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Graphite | `#292930` | Secondary text, hairline borders, icon fills, the slight warmth that keeps near-black from feeling clinical |
| Ash | `#cccccc` | Shadow tone used in the soft-etched link treatment, muted dividers |

## Typography

### Haffer Variable — Primary display serif for headlines at 30–53px. Weight 450 is anti-convention — most product sites push display to 600–700, but Haffer at 450 keeps headlines warm and editorial rather than commanding. Activating liga and ss04 unlocks the alternative g and stylised letterforms that give the wordmark its personality.
- **Substitute:** Source Serif 4, Newsreader, or DM Serif Display
- **Weights:** 450
- **Sizes:** 24px, 30px, 45px, 53px
- **Line height:** 1.10
- **Letter spacing:** -0.02em
- **OpenType features:** `"liga" on, "ss04" on`

### Bogue — Companion serif at regular weight, used for badge labels and secondary serif moments where Haffer 450 would feel too heavy. Tighter tracking at -0.03em distinguishes it from Haffer.
- **Substitute:** Source Serif 4, Cormorant Garamond
- **Weights:** 400
- **Sizes:** 24px, 30px, 45px, 53px
- **Line height:** 1.10
- **Letter spacing:** -0.03em

### Haffer — Static fallback for small serif text — 15px badges, 24px sub-serial moments
- **Substitute:** Source Serif 4
- **Weights:** 400
- **Sizes:** 15px, 24px
- **Line height:** 1.20
- **Letter spacing:** -0.02em
- **OpenType features:** `"liga" on, "ss04" on`

### Inter — All UI, body, nav, button labels, helper text. Inter at 400 handles body, 600 carries subheadings and button text. The -0.02em tracking matches the serif family, keeping the type system visually unified.
- **Weights:** 400, 600
- **Sizes:** 12px, 15px, 24px, 30px, 45px
- **Line height:** 1.10, 1.20, 1.50
- **Letter spacing:** -0.02em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.24px |
| body-sm | — | — | 15px | 1.5 | -0.3px |
| subheading | — | — | 24px | 1.2 | -0.48px |
| heading-sm | — | — | 30px | 1.1 | -0.6px |
| heading-lg | — | — | 45px | 1.1 | -0.9px |
| display | — | — | 53px | 1.1 | -1.06px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48-69px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **all:** 8px

## Components

### Gradient Brand Mark
**Role:** The Poly logo wordmark and cube icon

8px-radius cube filled with the Ember Gradient (134.77deg, #f4824d → #f42919). The gradient is reserved exclusively for brand identity — it never appears on UI controls, illustrations, or backgrounds. Paired with the wordmark in Onyx or Porcelain depending on surface.

### Primary Dark Filled Button
**Role:** Main conversion action (Join waitlist, Watch Video)

Onyx (#000000) background, Porcelain (#f4f4f4) text in Inter 600 at 15px, 8px border radius, 12px 24px padding. No border. Used on both light and dark surfaces because the fill is the heaviest value in the palette.

### Ghost Outlined Button
**Role:** Secondary action on dark photo backgrounds (Download Poly)

Transparent background, 1.5px Porcelain (#f4f4f4) border, Porcelain text in Inter 600 at 15px, 8px radius, 12px 24px padding. Sits on top of full-bleed photography — the outline reads as light catching an edge.

### Top Navigation Bar
**Role:** Persistent header across all pages

Transparent or Porcelain background, 24px vertical padding, brand mark left-aligned, utility actions right-aligned. On photo hero the nav is transparent so the gradient logo and Porcelain Login/Join waitlist float over the image.

### Hero Photo Section
**Role:** First-screen brand statement

Full-bleed editorial photograph (warm desk/studio scenes, natural light) with a dark overlay multiplier to push contrast. Centered headline stack: Haffer 450 at 45–53px, -0.02em tracking, Porcelain text. Inter 400 subtext at 15–24px below. Two-button CTA row (ghost + filled) centered beneath.

### Section Headline
**Role:** In-page heading at 30–45px

Haffer Variable 450 in Onyx (#000000) on Porcelain surfaces, tracking -0.02em. Used to introduce each content section. No decorative underline or eyebrow — the serif weight does the work.

### Feature Card
**Role:** Product feature or use-case block

Porcelain surface, 1px Graphite (#292930) hairline border, 8px radius, 24px padding. No shadow. Headline in Haffer 450 at 24–30px, body in Inter 400 at 15px, optional small icon in Graphite.

### Photo Content Band
**Role:** Mid-page editorial break

Full-bleed photograph alternating with Porcelain content sections. Creates the magazine-spread rhythm — dark photo, light text block, dark photo, light text block.

### Text Link
**Role:** Inline navigation and footer links

Inter 400 in Graphite (#292930), no underline by default. The rare soft-etched shadow (outer rgba(0,0,0,0.2) 2px 2px 5px + inset highlights) applies only to standalone link buttons, giving them a subtle embossed presence.

### Badge / Tag
**Role:** Status labels, category markers

Bogue or Haffer 400 at 12–15px in Graphite text on Porcelain, 8px radius, 6–12px padding. No background fill — typography alone carries the label.

### Body Text Block
**Role:** Long-form description and paragraph copy

Inter 400 at 15px, line-height 1.5, Graphite (#292930) on Porcelain. Max-width constrained to ~680px for readability. Tracking -0.02em matches the display scale.

### Footer
**Role:** Site-wide links and legal

Onyx or Porcelain background, Graphite hairline border-top, Inter 400 at 12–15px. Minimal link columns, brand mark repeated in Ember Gradient.

## Do's and Don'ts

### Do
- Use the Ember Gradient (#f4824d → #f42919) only on the brand mark and logo — never on body UI, illustrations, or button fills
- Set every border-radius to 8px, including cards, buttons, tags, and image containers
- Use Haffer Variable at weight 450 for every display headline at 30–53px, with font-feature-settings: 'liga' on, 'ss04' on
- Separate regions with hairline Graphite (#292930) borders, not with drop shadows
- Apply -0.02em letter-spacing across the entire type system to unify serif and sans families
- Keep section gaps in the 48–69px range to preserve the editorial breathing rhythm
- Use full-bleed warm photography (natural light, natural materials) for hero and section breaks

### Don't
- Don't introduce any chromatic color outside the Ember Gradient — the palette is monochrome by design
- Don't use drop shadows for card or surface elevation — borders carry separation
- Don't set display type in Inter; display belongs to Haffer at 450, never below 30px
- Don't use border-radius values other than 8px — no pills, no sharp corners, no 12px or 16px variants
- Don't apply the Ember Gradient to buttons, backgrounds, or hover states — it is brand-identity only
- Don't lighten Onyx text below #292930 for body copy — contrast must stay above 9:1 on Porcelain
- Don't break the photo/Porcelain alternation — every content section should sit on Porcelain, never on a tinted background

## Elevation

The system deliberately avoids elevation. Separation comes from hairline borders in Graphite (#292930) and from full-bleed photographic bands, not from drop shadows. The single detected shadow stack (a soft outer + inner highlight/neumorphic effect) appears only on interactive link elements — it reads as a tactile emboss, not as card lift.

## Surfaces

- **Porcelain Canvas** (`#f4f4f4`) — Page background across all content sections
- **Ink Panel** (`#000000`) — Photo overlays, dark feature bands, button fills

## Imagery

Editorial photography only — no illustration, no abstract graphics, no product screenshots in marketing surfaces. Warm desk scenes: ceramic mugs, potted plants, wood grain, brass instruments, leather notebooks, paper sticky notes, studio headphones. High-key with directional natural light, slight desaturation, and a film-grain warmth. Full-bleed with no rounded corners or masks — the photograph runs edge to edge. A dark overlay multiplier (roughly 40–50% Onyx) sits behind text to guarantee Porcelain-type contrast. The imagery does the atmospheric work that color and decoration would do in a more conventional product site.

## Layout

Full-bleed hero with centered text stack; max-width 1200px container for all content sections; 48–69px vertical rhythm between sections. Navigation is a single transparent or Porcelain top bar — no sidebar, no mega-menu. Content sections alternate between full-bleed photograph bands and Porcelain card grids, producing a magazine-spread cadence. Feature blocks are single-column or two-column (text-left/image-right) with no overlapping shapes or asymmetric grids. The grid is quiet and orthogonal; all the energy comes from typography and photography.

## Similar Brands

- **Arc Browser** — Same full-bleed editorial photography on the hero, single warm accent against monochrome UI, serif-leaning type personality
- **Notion** — Centered hero with restrained monochrome palette and one quiet accent, Inter as the workhorse UI family
- **Pitch** — Editorial serif display type paired with clean sans body, warm minimal aesthetic, hairline-border cards
- **Frame.io** — Creative-tool landing pages with warm lifestyle photography, dark overlay hero, minimal chrome
- **Linear** — Near-zero colorfulness outside a single brand moment, Inter for UI, hairline borders in place of heavy shadows
