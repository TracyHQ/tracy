# Perplexity AI — Style Reference
> Garden of computational flora — technical interface blooming through botanical haze

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Perplexity Computer — naturalistic interface camouflage. The design mimics a lush garden: white flower clusters (cards) float against softly blurred botanical photography, like UI elements composited onto nature footage. Warm sepia text (#271a00 — nearly brown) and cream surfaces (#faf8f5) create the impression of aged parchment overlaid on living greenery. Serif headlines at display sizes contrast with sans-serif UI, echoing the organic/digital tension. 4px and 12px radii appear across all elements except nav pills (40px), maintaining subtle roundness without full-pill uniformity. Generous whitespace (28-40px vertical rhythm) lets content breathe like clearings in foliage. The typeface suite — pplxSans for interface, pplxSerif for declarations — reinforces brand identity through custom letterforms rather than stock choices.

## Colors

| Name | Value | Role |
|------|-------|------|
| Aged Sepia | `#271a00` | Primary text, borders, icons, strokes — the near-brown warmth softens digital harshness without sacrificing legibility. Appears across every UI context from nav to body to buttons. |
| Parchment | `#faf8f5` | Page backgrounds, card surfaces, heading text on dark — the cream canvas against which all content rests. Acts as both background and reversed foreground. |
| Fog | `#d1cfc7` | Button fills, borders, dividers — a muted gray-beige midtone that bridges Parchment and Aged Sepia without introducing new chromatic energy. |
| Absolute Black | `#000000` | Footer backgrounds, high-contrast text inversion — appears sparingly, reserved for terminal anchoring at page bottom. |
| Pure White | `#ffffff` | Card backgrounds, reversed text, button fills — pristine whites float above Parchment base, creating layered depth. |
| Moss Shadow | `#7c7464` | Secondary body text, muted labels — a desaturated brown-gray for deemphasized content. |
| Deep Forest | `#23291b` | Nav backgrounds on scroll, elevated surfaces — a near-black with faint greenish tint echoing the botanical imagery. |
| Teal Accent | `#0f3639` | Nav active states, subtle highlights — the only cool color in a warm palette, used sparingly for interactive focus. |
| Ash Mist | `#e5e5e3` | Tertiary text, disabled states — lightest text color before transitioning to pure white. |
| Slate Edge | `#121516` | Headline text, button borders — nearly black but slightly warmer, used for maximum contrast without harshness. |

## Typography

### pplxSans — Interface workhorse — nav, body, buttons, badges, links at 11-16px for UI, 32-96px for hero headlines. Weight 300 at display sizes creates authority through whisper-weight restraint. Custom typeface ensures brand distinction unavailable through system fonts.
- **Substitute:** Inter, -apple-system, sans-serif
- **Weights:** 300, 400, 500
- **Sizes:** 11-96px
- **Line height:** 1.00-1.50
- **Letter spacing:** -0.0280em

### pplxSansMono — Code snippets, technical badges (/query markers), status labels — monospace grounds the AI agent narrative in developer credibility. Appears at 10-14px in buttons and badges.
- **Substitute:** JetBrains Mono, Consolas, monospace
- **Weights:** 400, 500, 600
- **Sizes:** 10-14px
- **Line height:** 1.00-1.50
- **Letter spacing:** normal

### pplxSerif — Section headlines, declaration moments — serif at 48-96px creates editorial gravitas, separating feature announcements from interface chrome. Weight 300 at 72-96px continues the whisper-weight authority pattern.
- **Substitute:** Georgia, Times New Roman, serif
- **Weights:** 300, 400
- **Sizes:** 24-96px
- **Line height:** 1.00-1.12
- **Letter spacing:** normal

### PPLX Serif Beta v0 VF — PPLX Serif Beta v0 VF — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 48px
- **Line height:** 1.12

### PPLX Mono — PPLX Mono — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 10px
- **Line height:** 1

### PPLX Mono Beta v0 VF — PPLX Mono Beta v0 VF — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.2 | — |
| body-sm | — | — | 12px | 1.2 | — |
| body | — | — | 15px | 1.2 | — |
| body-lg | — | — | 16px | 1.2 | — |
| heading-sm | — | — | 32px | 1.2 | — |
| heading | — | — | 96px | 1.2 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 28px
- **Card padding:** 40px
- **Element gap:** 8px

### Border Radius

- **cards:** 12px
- **other:** 4px
- **badges:** 4px
- **inputs:** 4px
- **buttons:** 40px

## Components

### Ghost Nav Button
**Role:** Transparent navigation links

backgroundColor: transparent, color: #271a00, border: 1px solid rgba(39,26,0,0.14), borderRadius: 0px, padding: 0. Invisible container, only text and hairline border visible.

### Pill CTA Button
**Role:** Primary action (Try Computer)

backgroundColor: #d6d5d4, color: #171615, border: 1px solid #171615, borderRadius: 40px, padding: 0 24px. Full-pill radius contrasts with 4-12px everywhere else, making CTAs unmistakable.

### Frosted Glass Button
**Role:** Secondary actions on imagery

backgroundColor: rgba(255,255,255,0.6), color: #271a00, border: 1px solid rgba(39,26,0,0.14), borderRadius: 4px, padding: 4px. Translucent white surface floats over blurred backgrounds.

### White Feature Card
**Role:** Main content containers

backgroundColor: #ffffff, borderRadius: 12px, padding: 40px, boxShadow: none. Pure white cards float on Parchment (#faf8f5) canvas with soft rounded corners.

### Transparent Task Card
**Role:** Workflow step containers

backgroundColor: transparent, borderRadius: 4px, padding: 10px 12px. No fill, only content, creating negative-space composition over botanical imagery.

### Tinted Overlay Card
**Role:** Elevated surfaces on dark sections

backgroundColor: rgba(39,26,0,0.08), borderRadius: 0px, padding: 0. Subtle sepia tint creates surface without hard edges.

### Monospace Badge
**Role:** Code markers (/query, task IDs)

font: pplxSansMono 10-12px weight 400-600, color: #271a00, backgroundColor: transparent, borderRadius: 4px, padding: 0. Inline code style without visible container.

### Status Badge
**Role:** Task counters (0, 4 in sidebar)

font: pplxSans 11px weight 400, color: #271a00, backgroundColor: transparent, borderRadius: 0px. Bare numerals, no container decoration.

### Serif Headline Block
**Role:** Section declarations

font: pplxSerif 48-96px weight 300-400, lineHeight: 1.00-1.12, color: #271a00 or #121516. Massive weight 300 type set tight (1.00-1.12 leading) creates architectural presence.

### Sans Hero Headline
**Role:** Primary page title

font: pplxSans 96px weight 300, lineHeight: 1.00, letterSpacing: -2.69px, color: #271a00. Display-scale sans at whisper-weight with aggressive negative tracking.

### Body Stack
**Role:** Feature descriptions, workflow text

font: pplxSans 15-16px weight 400, lineHeight: 1.50, color: #271a00 or #7c7464. Comfortable 1.5 leading creates breathing room in dense content.

### Nav Pill
**Role:** Top navigation items

font: pplxSans 15px weight 400, color: #271a00, backgroundColor: transparent, borderRadius: 40px when active, padding: 20px vertical. Morphs into pill shape on hover/active.

## Do's and Don'ts

### Do
- Use 40px borderRadius exclusively for navigation pills and primary CTAs — full-pill buttons against 4-12px everywhere else creates instant visual hierarchy
- Set display headlines at weight 300 (pplxSans 96px or pplxSerif 72-96px) — the whisper-weight approach creates authority through restraint, not volume
- Layer white (#ffffff) cards on Parchment (#faf8f5) canvas — never put white directly on white or cream directly on cream. The 2-3% luminance difference creates subtle depth without shadows
- Apply -0.028em letter-spacing to all pplxSans text — the custom tracking is part of the typeface's identity, not optional stylistic flourish
- Use pplxSansMono at 10-14px for all code-adjacent elements (/query markers, task IDs, status labels) — monospace signals technical credibility in an AI agent context
- Maintain 28-40px vertical rhythm between major sections — the generous whitespace lets content breathe like clearings in botanical density
- Keep #271a00 (Aged Sepia) as primary text across all contexts — the near-brown warmth is the brand's chromatic signature, not interchangeable with true black

### Don't
- Never use drop shadows or box-shadow — depth comes from color layering (#ffffff → #faf8f5 → #d1cfc7) and blur filters on imagery, not elevation shadows
- Never set body text below 15px for primary content — the comfortable line-height: 1.5 pattern requires sufficient font size to maintain readability
- Never use 40px borderRadius on cards or content containers — full-pill radius is reserved for nav and CTAs. Cards stay at 12px, inputs/badges at 4px
- Never introduce saturated accent colors beyond #0f3639 (Teal Accent) — the warm sepia palette is intentionally muted. Vivid blues/greens/reds break the botanical atmosphere
- Never use true black (#000000) for primary text — reserve Absolute Black for footer backgrounds and terminal page anchors. Primary text uses #271a00 or #121516
- Never set pplxSerif below 24px — serif is for declarations at display/heading scale. Body text and UI elements use pplxSans
- Never stack multiple layers of transparency without sufficient contrast — frosted-glass buttons (rgba(255,255,255,0.6)) work over blurred imagery, not over other transparent surfaces

## Elevation

Depth without shadows — layering achieved through color progression (#ffffff → #faf8f5 → #d1cfc7) and blur filters on botanical imagery (blur(20px) backdrop filters). Cards float through luminance contrast, not drop shadows. The design avoids box-shadow entirely, creating a flattened-layered aesthetic where surfaces stack like pressed botanical specimens between glass panes.

## Surfaces

- **Parchment Canvas** (`#faf8f5`) — Page background — the cream foundation upon which all content rests
- **Pure White Card** (`#ffffff`) — Primary content cards — pristine white floats 2-3% above Parchment base
- **Fog Divider** (`#d1cfc7`) — Borders, button fills, subtle separators — midtone bridging layer
- **Deep Forest Overlay** (`#23291b`) — Nav on scroll, elevated dark surfaces — near-black with botanical tint

## Imagery

Full-bleed botanical photography — lush garden scenes with white wildflowers, blue forget-me-nots, ornamental grasses. Images receive 20px blur via backdrop-filter, creating softened, out-of-focus greenery that UI elements float above. Treatment is naturalistic, not stylized — actual flora captured in close-up, not illustrated or abstracted. UI cards and text overlay these blurred backgrounds like glass panels compositing onto nature footage. Edges vignette into white at image boundaries, creating soft fade-to-canvas transitions. The imagery is atmospheric and decorative, establishing brand mood rather than explaining product features. Density is high — the hero and several feature sections use full-viewport botanical backgrounds, making the site feel like navigating through a conservatory.

## Layout

Full-bleed model with centered content overlays. Hero section spans full viewport with blurred botanical photography, centered 'Computer' headline at 96px, and centered nav pills. Below hero, the page alternates between full-bleed imagery sections and max-width text blocks on Parchment canvas. No strict container — sections breathe edge-to-edge, with content inset as needed. Feature sections use 3-column card grids (white cards on Parchment) separated by 24px gaps. Workflow demos show stacked task cards with transparent backgrounds floating over botanical imagery. Footer shifts to Absolute Black (#000000) background, terminal anchoring. Navigation is sticky top bar with 40px pill buttons, transitioning to Deep Forest (#23291b) background on scroll. Asymmetry appears in text+image splits, but overall rhythm is centered stacks with alternating imagery density. Vertical spacing follows 28-40px section gaps, creating generous breathing room.

## Similar Brands

- **Linear** — Weight 300 display headlines and muted-neutral palettes create authority through restraint, not volume
- **Notion** — Custom serif + sans pairing and cream/warm-white layered surfaces for depth without shadows
- **Midjourney** — Full-bleed atmospheric imagery overlaid with minimal UI chrome, letting visuals dominate
- **Arc Browser** — Pill-shaped primary actions (40px radius) contrasting with subtle-radius everywhere else (4-12px)
