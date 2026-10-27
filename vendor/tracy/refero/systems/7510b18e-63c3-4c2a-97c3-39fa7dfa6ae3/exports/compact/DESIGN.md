# Neuralink — Style Reference
> obsidian laboratory with a single color synapse — a black void where only light, shadow, and one thin spectrum of color speak

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Neuralink operates as a near-pure monochrome system: a near-black canvas, a white surface, and one off-white band, with no chromatic brand color at all. A single spectrum gradient — pink to violet — appears only as the announcement bar and as photo-card overlays, acting as the system's sole injection of warmth and life. Typography carries almost all of the brand voice: a geometric sans at weight 300 for display sizes with aggressively tight tracking (-0.165em at 48px) that gives headlines a compressed, engineered density. Pill-shaped controls (80px radius) sit against full-bleed black and white blocks, creating a cinematic, almost editorial rhythm where the only color signal is a faint synaptic glow.

## Colors

| Name | Value | Role |
|------|-------|------|
| Obsidian | `#000000` | Page hero canvas, primary text, section dividers, dark-mode blocks. The dominant structural color — used 931 times as backgrounds, borders, and text. Creates a void-like base that makes white type and the single gradient feel electric by contrast |
| Paper | `#ffffff` | Content section background, card surfaces, ghost-button text and border. The light counterpart to Obsidian — every content section sits on Paper, and outlined/ghost buttons invert to Paper stroke on Obsidian backgrounds |
| Ash | `#f5f5f5` | Soft off-white surface for the footer and secondary bands. Separates Paper from true white when a gentler contrast is needed — used for the meet-our-pioneers section background and the footer |
| Fog | `#bababa` | Muted nav text and low-emphasis dividers. A desaturated mid-gray for inactive navigation labels and subtle hairline borders where black would feel too heavy |
| Synapse Gradient | `linear-gradient(90deg, #e486ab, #7f80b3 20%, #435a93 50%, #6452d8 95%)` | The only chromatic element in the entire system. A four-stop spectrum (warm rose → cool lavender → indigo → violet) used exclusively for the announcement bar and photo-card overlays. The dominant anchor color is the violet end (#6452d8), giving the gradient a cool, neurological character |

## Typography

### UntitledSans — The sole typeface — a custom geometric sans used at all sizes and weights. Weight 300 at display sizes is anti-convention: most bold-tech brands use 600-700 for headlines, but Neuralink's whisper-light displays with aggressive negative tracking create authority through restraint and engineered density, not volume. Weight 400 for body, 500 for nav, 700 reserved for emphasis.
- **Substitute:** Inter, Söhne, or General Sans
- **Weights:** 300, 400, 500, 700
- **Sizes:** 8px, 12px, 14px, 16px, 17px, 18px, 24px, 32px, 44px, 48px
- **Line height:** 1.00, 1.15, 1.20, 1.50
- **Letter spacing:** -0.165em at 48px display, -0.060em at 32px, -0.050em at 24px, -0.037em at 18px, -0.030em at 17px, -0.020em at 16px, -0.015em at 14px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.18px |
| body-sm | — | — | 14px | 1.5 | -0.21px |
| body | — | — | 16px | 1.5 | -0.32px |
| body-lg | — | — | 18px | 1.5 | -0.67px |
| subheading | — | — | 24px | 1.2 | -1.2px |
| heading-sm | — | — | 32px | 1.15 | -1.92px |
| heading | — | — | 44px | 1.15 | -2.64px |
| display | — | — | 48px | 1 | -7.92px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 32px
- **Element gap:** 12px

### Border Radius

- **cards:** 20px
- **buttons:** 80px
- **nav-buttons:** 16px
- **body-elements:** 60px

## Components

### Synapse Announcement Bar
**Role:** Full-width gradient strip at the very top of every page

Full-bleed gradient bar (Synapse Gradient: rose → lavender → indigo → violet, 90deg). White text at 12px, weight 400, centered. Close button (×) on the far right. Height ~32px, no padding beyond vertical centering. This is the ONLY place the gradient appears as a solid bar.

### Minimal Navigation Header
**Role:** Primary site navigation on all pages

Sits on a #000000 (Obsidian) or #ffffff (Paper) background depending on the section. Logo (stylized N-wave mark) left-aligned. Nav links (Technology, Careers, Updates) right-aligned at 16px, weight 400, in Paper or Obsidian text. A pill-shaped 'Clinical Trials' button with 16px radius sits at the far right — 1px border matching the text color, transparent fill, 6px vertical / 12px horizontal padding.

### Full-Bleed Hero Block
**Role:** Primary page-opening visual zone

Full-viewport-width Obsidian (#000000) background extending edge-to-edge with no max-width constraint. Display text at 48px, weight 300, in #ffffff, positioned in the lower-left quadrant with generous left and bottom padding (~80-120px). A single ghost pill button sits below the headline. No imagery, no decoration — pure black void with white type.

### Ghost Pill Button
**Role:** Outlined/ghost action button used on dark backgrounds

Transparent background, 1px solid #ffffff border, border-radius 80px (full pill). Text at 16px, weight 400, #ffffff, with a 2px right arrow icon. Padding 12px vertical, 24px horizontal. No fill on hover — the button reads as a subtle outline, not a heavy action element.

### Filled Pill Button
**Role:** Primary action button used on light backgrounds

Solid #ffffff background on Obsidian sections, or solid #000000 on Paper sections. Border-radius 80px. Text at 16px, weight 500, contrasting color, with right arrow. Padding 12px vertical, 24px horizontal. Used sparingly — only one button appears in the hero.

### Two-Column Content Section
**Role:** Text-heavy explanatory content blocks on white background

#ffffff background, max-width ~1200px centered. Left column holds a large heading (44-48px, weight 300) with tight tracking. Right column holds two paragraphs of body text (16-18px, weight 400, #000000) stacked vertically with ~30px row gap. Generous vertical padding (80px top/bottom). No images, no cards — pure typographic layout.

### Pioneer Card
**Role:** Large photo-overlay card for featured audience segments

Aspect ratio roughly 3:4, border-radius 20px. Full-bleed photograph inside, overlaid with a gradient wash (teal/green on left card, pink/magenta on right card — used to differentiate card identity without adding UI color). White overlay text (heading at 24px weight 500, subtext at 16px weight 400) positioned in the lower-left. A ghost pill button (1px white border, 80px radius) sits below the text. Used in pairs side-by-side.

### Centered Section Heading
**Role:** Section-introducing title text

Centered alignment, 32-44px, weight 300, #000000. Sits on either Paper or Ash background with ~80px vertical padding above and below. No supporting subtitle — the heading stands alone, creating breathing room before the content below.

### Footer
**Role:** Page-bottom information area

Ash (#f5f5f5) background, full-width. Minimal content — likely links and copyright in small text (12-14px, weight 400, #000000). Generous padding (60-80px vertical). No color, no imagery — maintains the system's monochrome discipline to the bottom of the page.

## Do's and Don'ts

### Do
- Use #000000 as the full-bleed hero background with #ffffff display text at 48px weight 300, letter-spacing -7.92px
- Apply the Synapse Gradient only in the announcement bar and as photo-card overlay washes — never as a solid UI surface, button fill, or text color
- Set border-radius to 80px on all action buttons for full pill geometry; use 20px on cards and 60px on large container elements
- Maintain aggressive negative letter-spacing: -0.165em at 48px down to -0.015em at 14px, never let large type run at default tracking
- Separate content sections with Ash (#f5f5f5) bands between Paper (#ffffff) blocks to create rhythm without adding color
- Use weight 300 for all display and heading sizes (32px+); reserve weight 700 only for inline emphasis within body text
- Keep page max-width at 1200px for content sections; let hero and announcement bar go full-bleed edge-to-edge

### Don't
- Do not introduce any chromatic brand color — the system is monochrome by design, and the gradient is the only exception
- Do not use drop shadows, box-elevation, or blur effects on any component — depth comes from surface contrast only
- Do not use square or slightly-rounded corners (4px, 8px) on buttons — the 80px pill radius is a signature element
- Do not use weight 600 or 700 for headlines — the weight 300 display is a deliberate anti-convention choice
- Do not add letter-spacing to small text or use positive tracking anywhere — the entire scale runs negative or zero
- Do not use the gradient as a background for text blocks or data tables — it is reserved for the announcement bar and photo overlays
- Do not place multiple ghost buttons adjacent to each other on the same surface — one outlined action per zone, with filled buttons as the alternative

## Elevation

Neuralink deliberately avoids shadows and box-elevation. The depth system is built entirely from surface color contrast: Obsidian blocks sit adjacent to Paper blocks, and Ash bands separate Paper sections. The only depth signal is the border on the gradient photo cards and the hairline button borders — no drop shadows, no blurred glows. This flat, shadowless approach reinforces the engineered, clinical aesthetic.

## Surfaces

- **Obsidian Canvas** (`#000000`) — Full-bleed hero sections, dark mode blocks, dramatic contrast zones
- **Paper Surface** (`#ffffff`) — Primary content background, text-heavy sections, card surfaces
- **Ash Band** (`#f5f5f5`) — Soft separator sections (meet-our-pioneers), footer, breathing room between Paper blocks

## Imagery

Photography appears only inside Pioneer Cards, treated as full-bleed backgrounds with gradient color washes (teal-green on one card, pink-magenta on the other) that temper the photo into the brand palette. The photos are portrait-oriented, showing people in soft natural-light environments — never clinical, never staged in a lab. No product photography, no 3D renders, no illustrations appear elsewhere. The hero and all content sections are purely typographic — no images, no icons beyond a small arrow glyph inside buttons. The visual system communicates through surface contrast and one gradient, not through visual content density.

## Layout

The page follows a full-bleed → contained → full-bleed rhythm. The hero is edge-to-edge Obsidian with no max-width constraint and text anchored in the lower-left. Content sections are centered within ~1200px max-width on Paper or Ash backgrounds. The layout alternates: Obsidian hero → Paper two-column content → Ash centered-heading + two-card grid → Ash footer. Navigation is a single thin bar that persists across all sections, adapting its text/border color to the underlying surface. Vertical spacing is generous (80px section gaps) with comfortable 12-30px element gaps. No sidebar, no mega-menu, no sticky elements beyond the nav bar itself.

## Similar Brands

- **Apple** — Same full-bleed black hero with massive light-weight display type and near-zero color palette — both rely on surface contrast and generous whitespace rather than chromatic branding
- **Stripe** — Both use tight-tracked geometric sans-serifs at display sizes with pill-shaped buttons and gradient accent strips, though Stripe introduces more color in its gradients
- **Linear** — Shared commitment to monochrome interface (0% colorfulness) with information density carried by typography and spacing rather than color coding
- **Nothing (Nothing.tech)** — Similar monochrome-first product aesthetic with dot-matrix typography and a single accent — both use restraint as the design statement
- **Humane (AI Pin)** — Both position as futuristic tech brands using near-pure black/white palettes with cinematic full-bleed heroes and pill-shaped ghost buttons
