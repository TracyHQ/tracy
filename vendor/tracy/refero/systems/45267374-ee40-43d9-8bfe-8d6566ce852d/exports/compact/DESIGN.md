# LE CAMP — Style Reference
> Alpine summit base camp at dusk — a field command post where one red signal flare cuts through mountain twilight, and everything else is topo-line restraint.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

LE CAMP reads as an alpine expedition outpost translated into a digital surface: a near-monochrome canvas pierced by a single flare-red accent, where the brand speaks through dramatic photographic scale and badge-style illustration rather than through decoration. The design system is ruthlessly reduced — two achromatic values and one chromatic — letting Agrandir's distinctive geometric display voice carry hierarchy while DM Sans handles utility text in the background. Components are confident and flat: pill-radius CTAs in signal red, thin hairline borders, uppercase mono labels acting as wayfinding tags, and shield-shaped program patches that function like scout merit badges scattered across a topographic hero. Sections alternate between full-bleed drama (the dark mountain photograph) and quiet white/cream expanses, creating a rhythm of base camp and summit. The single red accent earns its weight through scarcity — it appears only where a decision is being asked for or a category is being defined.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Red | `#fe3a3a` | Primary CTA fill, nav active state, brand logo, emphasis body text, accent box-shadows on interactive elements — the single chromatic voice of the system, reserved for moments of decision and identity |
| Carbon Ink | `#000000` | Primary text, heading text on light surfaces, icon strokes, nav text, button text, all structural borders and dividers |
| Summit White | `#ffffff` | Primary page canvas, card surface, button text on red, input fill, nav background, hero foreground text on dark imagery |
| Ridge Gray | `#767676` | Input border, subtle form dividers — the only non-black neutral, used where a softer boundary is needed without losing contrast |

## Typography

### Agrandir — Display and heading voice — the 90px weight 600 at line-height 1.0 acts as architectural type, not running text; 26px at weight 350/600 bridges display and body; the ultra-tight 1.0 leading on the largest size is a deliberate poster-typography choice that lets letters stack as visual mass
- **Substitute:** Bricolage Grotesque (Google Fonts) at weight 800 for display, weight 400 for sub-display
- **Weights:** 350, 600
- **Sizes:** 18px, 26px, 90px
- **Line height:** 1.00–1.20
- **Letter spacing:** normal

### DM Sans — Workhorse body and UI font — paragraphs, nav items, button labels, form text, footer copy; 16px at 1.4 for body, 14px at 1.3 for nav/labels, 12px for tertiary meta
- **Substitute:** Inter (Google Fonts)
- **Weights:** 400
- **Sizes:** 12px, 14px, 16px, 18px
- **Line height:** 1.30–1.40
- **Letter spacing:** normal

### DM Mono — Micro-label and wayfinding voice — uppercase category tags like 'ENTREPRISES', 'COACHS & EXPERTS', program identifiers; 0.04em letter-spacing widens the monospace rhythm so these labels read as expedition wayfinding rather than code
- **Substitute:** JetBrains Mono or IBM Plex Mono (Google Fonts)
- **Weights:** 400
- **Sizes:** 10px, 14px
- **Line height:** 1.30
- **Letter spacing:** 0.04em (≈0.4px at 10px, ≈0.56px at 14px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.3 | 0.4px |
| body | — | — | 16px | 1.4 | — |
| subheading | — | — | 26px | 1.2 | — |
| display | — | — | 90px | 1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 60px
- **Card padding:** 40px
- **Element gap:** 10px

### Border Radius

- **nav:** 10px
- **cards:** 20px
- **buttons:** 35px

## Components

### Primary CTA Button (Pill)
**Role:** Hero and nav conversion action

Filled #fe3a3a background, #ffffff text, DM Sans 400 at 14px, 35px border-radius (fully pill-shaped), 10px vertical × 20px horizontal padding, no border. Single-use per section — scarcity is the point. Drop shadow: 0 2px 8px rgba(254,58,58,0.3) optional glow.

### Secondary Button (Rounded)
**Role:** Utility actions and inline links

Transparent or #ffffff background, #000000 text, DM Sans 400 at 14px, 10px border-radius, 10px vertical × 20px horizontal padding, 1px solid #000000 border. Lower visual weight than the pill CTA — used for non-decisive actions.

### Menu Trigger
**Role:** Full-screen navigation open

Transparent background, #ffffff text on dark hero / #000000 text on light sections, DM Sans 400 at 14px, hamburger icon (three horizontal lines) to the left of label, 10px border-radius, 10px vertical × 20px horizontal padding.

### Display Heading (Agrandir 90)
**Role:** Hero and section-defining headlines

Agrandir weight 600 at 90px, line-height 1.0, normal letter-spacing. Renders in #ffffff over dark hero imagery and #000000 over light surfaces. Functions as poster typography — letters stack as visual mass, not running prose.

### Section Label (Mono Tag)
**Role:** Category wayfinding above section headings

DM Mono 400 at 10px, line-height 1.3, letter-spacing 0.04em, uppercase, #000000. Sits centered or left-aligned above section headings as an expedition-style category tag.

### Program Patch Badge
**Role:** Decorative illustration identifying each program offering

Shield/badge-shaped illustration (rounded top, flat or pointed bottom), ~120px wide, 2px stroke, monochromatic fill in one of the system colors: #fe3a3a, #4a7fc5 (blue), or #ffffff outline on dark. Contains line-art iconography (trees, mountains, globe, campfire) and program name in DM Sans 400 at 10–12px. Used as floating decorative elements in the hero.

### Cream Feature Card
**Role:** Content blocks requiring warm separation

#f5f0e8 background, 20px border-radius, 40px padding on all sides, no border, no shadow. Contains a section label (mono tag) in #000000 and body heading in #fe3a3a at Agrandir 26–90px. The warm cream against the red heading is a signature warm/cool contrast.

### Input Field
**Role:** Form text input

#ffffff background, 1px solid #767676 border, 10px border-radius, DM Sans 400 at 16px, 10px vertical × 15px horizontal padding. Placeholder text in #767676. Focus state: border shifts to #000000.

### Navigation Bar
**Role:** Top-level site navigation

Fixed top bar, transparent background over hero / #ffffff with 1px #000000 bottom border over light sections. Contains brand mark (red triangle LE CAMP badge) at left, CTA pill button + menu trigger at right. Padding: 15px vertical.

### Stat Block (Social Proof)
**Role:** Credibility metrics

Centered or left-aligned, DM Sans 400 at 16px body with DM Sans 400 at 26px weight emphasis on the number. No card wrapper — text sits directly on the surface gray.

## Do's and Don'ts

### Do
- Use #fe3a3a exclusively for primary CTAs, the brand logo, and emphasis body text — never as a background fill for large non-action surfaces
- Set display headlines at 90px Agrandir weight 600 with line-height 1.0 to let letters stack as visual mass
- Apply 35px border-radius (pill shape) to primary CTA buttons and 10px to secondary buttons — the radius difference signals action weight
- Use DM Mono at 10px with 0.04em letter-spacing uppercase for section labels, positioned above their heading
- Separate sections with 60px vertical gaps and alternate between #ffffff, #f5f5f5, and #f5f0e8 to create a base-camp-to-summit rhythm
- Keep all structural borders at 1px solid #000000 — no thicker rules, no decorative dividers
- Use #767676 only for input borders; never for text, never for buttons, never for card edges

### Don't
- Do not introduce any color outside #fe3a3a, #000000, #ffffff, and #767676 — the system is intentionally two-tone plus a gray
- Do not apply drop shadows to cards, panels, or any neutral surface — elevation belongs only to the red CTA and hero illustrations
- Do not set body text above 18px or use Agrandir for running prose — Agrandir is display-only
- Do not use 0px or 4px border-radius — all rounded elements use 10px, 20px, or 35px, never square
- Do not place red text on a red background or white text on white — the red's scarcity depends on it always sitting on a neutral surface
- Do not use the cream (#f5f0e8) as a full-page background — it is a card surface only
- Do not use gradients — the system is strictly flat color and photography

## Elevation

- **Primary CTA Button:** `0 2px 12px rgba(254,58,58,0.25)`
- **Program Patch Badges (hero):** `0 4px 20px rgba(10,22,40,0.4)`

## Surfaces

- **Summit White** (`#ffffff`) — Primary page canvas — most content sections sit on this
- **Glacier Mist** (`#f5f5f5`) — Section background for supporting content blocks (social proof, stats)
- **Trail Cream** (`#f5f0e8`) — Warm feature card surface for content blocks that need separation without harshness
- **Base Camp Dark** (`#0a1628`) — Hero photographic layer — deep blue-black mountain landscape at dusk; serves as full-bleed narrative canvas

## Imagery

Hero is a full-bleed dark mountain photograph at dusk — deep blue-black ridges with reflective lake water, no sky detail, no human subjects. The photograph is treated as a topographical field, not a lifestyle shot. All other illustration is shield/badge-shaped program patches with thin 2px line-art iconography (trees, mountains, campfire, globe) in single-color treatment. No product photography, no stock imagery, no 3D renders. The visual language is expedition cartography — maps, badges, and wayfinding markers rather than people or product.

## Layout

Hero is full-bleed dark with centered headline (90px Agrandir) and floating program patches arranged in a loose constellation. Body sections are max-width 1200px centered with generous side padding. The second section uses an asymmetric two-column: dense paragraph left (40% width), oversized display heading stacked left-aligned right (55% width), creating tension between reading-text and poster-text. Stat sections are centered single-column. Feature cards span full width with internal max-width. Section rhythm: dark hero → white expanse → light gray → cream card, with 60px vertical gaps between each. Navigation is a fixed top bar with brand left, actions right — no mega-menu visible, no sidebar.

## Similar Brands

- **Basecamp** — Same monochrome-first philosophy with a single bold accent color (orange/red), flat surfaces, generous whitespace, and geometric sans-serif body type — both systems prove that extreme restraint with one chromatic voice reads as confidence
- **Arc Browser** — Similar dramatic full-bleed dark photographic hero treatment paired with clean light body sections; both use oversized display type as the primary visual hook and let the hero image do the emotional heavy lifting
- **Cowboy (e-bikes)** — Same patch/badge illustration style applied to product categories, same monospace label system for wayfinding, same near-monochrome palette with a single accent color for CTAs and emphasis
- **Linear** — Same typographic precision with a custom/display heading face paired against a clean geometric sans body, same flat-card approach to content blocks, same use of a single saturated accent against neutral structure
