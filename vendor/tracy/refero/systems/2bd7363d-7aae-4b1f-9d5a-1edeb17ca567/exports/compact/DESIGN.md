# MotherDuck — Style Reference
> crayon-coded terminal on cream paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

MotherDuck operates in a neo-brutalist technical-playful register: a warm cream canvas hosts monospace-first typography (Aeonik Mono) that treats every UI surface as if it were a terminal readout, and then subverts that seriousness with hand-drawn duck mascots, clouds, and crayon-bright accents. The interaction language is flat and offset — hard 2px corners, zero-blur drop shadows pushed -6px right and +6px down in #383838, and chromatic button borders that cycle through a full rainbow palette like colored pencils in a cup. Color is sparse and intentional: a sky-blue (#6fc2ff) carries all primary action weight, while saturated yellow and orange belong to illustration and marquee rhythm. The effect is a developer tool that refuses to dress like one — data infrastructure rendered as a children's notebook sketch.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream Paper | `#f4efea` | Page canvas and section backgrounds — the entire site sits on this warm off-white like a notebook page |
| Frost White | `#ffffff` | Card surfaces, nav bar, input fields, and overlay panels — clean white layered on the cream canvas |
| Chalk Gray | `#f8f8f7` | Secondary surface for body backgrounds and subtle borders — barely-there differentiation from white |
| Ice Wash | `#ebf9ff` | Tinted blue-white for soft button hovers and highlight washes adjacent to the primary blue |
| Notebook Pale | `#f9fbe7` | Faint yellow-green tint used on selected/tagged surfaces for the play accent |
| Charcoal Ink | `#383838` | Primary text, all borders, icon strokes, and the offset shadow color — the universal line color, never pure black |
| Pencil Gray | `#a1a1a1` | Muted helper text, secondary borders, and disabled-state outlines |
| Graphite | `#818181` | Tertiary borders and dividers, low-emphasis UI rules |
| Soft Silver | `#c0c0c0` | Icon strokes and low-contrast border accents on illustration-adjacent elements |
| Sky Crayon | `#6fc2ff` | Primary action fills, nav accents, and the dominant chromatic surface — the only color loud enough to carry CTAs |
| Canary Banner | `#ffde00` | Yellow wash for highlight backgrounds, decorative bands, and soft emphasis behind content. |
| Duck Bill Orange | `#ff9538` | Orange wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Coral Sketch | `#f38e84` | Outlined button border variant — one slot in the rotating rainbow button-border system |
| Peach Sketch | `#f5b161` | Outlined button border variant |
| Mint Sketch | `#38c1b0` | Outlined button border variant |
| Lilac Sketch | `#b291de` | Outlined button border variant |
| Lime Sketch | `#b3c419` | Outlined button border variant |
| Periwinkle Sketch | `#7597ee` | Outlined button border variant |
| Slate Sketch | `#84a6bc` | Outlined button border variant |
| Marigold Sketch | `#e1c427` | Outlined button border variant |
| Wet Cement | `#54b4de` | Decorative illustration stroke — water/sky blue outlines in duck and cloud drawings |
| Peach Blush | `#fdedda` | Soft warm tint for illustrated section backgrounds, never a UI control fill |

## Typography

### Aeonik Mono — Universal brand face — headlines, body, nav, buttons, inputs, cards, footers. Used everywhere as the primary voice. The monospace geometry signals developer-tool credibility while the wide weight range (300–600) allows it to whisper (hero at 300) or command (nav at 600).
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Space Mono
- **Weights:** 300, 400, 500, 600
- **Sizes:** 11, 12, 14, 16, 18, 20, 24, 32, 40, 56
- **Line height:** 1.00, 1.20, 1.30, 1.40, 1.60
- **Letter spacing:** 0.0200em across all sizes — a slight positive tracking counteracts monospace's mechanical density and gives the type a more open, friendly rhythm

### Inter — Secondary face for supplementary UI text, third-party embeds, and contexts where proportional letterforms read more naturally than monospace. Letter-spacing 0.0200em–0.0230em.
- **Substitute:** system-ui, -apple-system, Segoe UI
- **Weights:** 300, 400, 600, 700
- **Sizes:** 12, 14, 16, 18, 20, 22, 24, 32, 44
- **Line height:** 1.20, 1.30, 1.36, 1.37, 1.38, 1.40, 1.60
- **Letter spacing:** 0.0200em–0.0230em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.4 | 0.22px |
| body | — | — | 14px | 1.6 | 0.28px |
| body-lg | — | — | 16px | 1.6 | 0.32px |
| subheading | — | — | 18px | 1.4 | 0.36px |
| heading-sm | — | — | 24px | 1.3 | 0.48px |
| heading | — | — | 32px | 1.2 | 0.64px |
| heading-lg | — | — | 40px | 1.2 | 0.8px |
| display | — | — | 56px | 1 | 1.12px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 40px
- **Element gap:** 8px

### Border Radius

- **nav:** 2px
- **tags:** 2px
- **cards:** 2px
- **inputs:** 2px
- **buttons:** 2px

## Components

### Primary Action Button
**Role:** Main CTA — drives signups and demo bookings

Filled sky-blue (#6fc2ff) background, #383838 1.5–2px border, #383838 text in Aeonik Mono 500 at 14px, 2px radius, padding 10px 24px, uppercase or regular case. Carries the hard offset shadow: rgb(56,56,56) -6px 6px 0px 0px. On hover, the button shifts +6px right and +6px down to 'press' into the shadow; on active, it returns to rest position.

### Secondary Outlined Button
**Role:** Companion to primary CTA, lower-emphasis actions

White (#ffffff) or transparent background, #383838 2px border, #383838 text in Aeonik Mono 500 at 14px, 2px radius, padding 10px 24px, same hard offset shadow as primary. No fill — defined entirely by its border and text.

### Rainbow Outline Button
**Role:** Decorative call-to-action — community links, resource tiles, social proof

Cycling border colors: coral (#f38e84), peach (#f5b161), mint (#38c1b0), lilac (#b291de), lime (#b3c419), periwinkle (#7597ee), slate (#84a6bc), marigold (#e1c427). White background, #383838 text in Aeonik Mono 500 at 14px, 2px radius, 2px border, same -6px/+6px hard offset shadow. Multiple instances on a page distribute through the palette to create a pencil-cup rhythm.

### Start Free Nav Button
**Role:** Persistent signup CTA in the top nav

Sky-blue (#6fc2ff) fill, #383838 1.5px border, white (#ffffff) text in Aeonik Mono 600 at 12px, uppercase, 2px radius, padding 8px 16px. Sits flush in the top-right of the nav bar. No shadow — nav buttons are flat to keep the header lightweight.

### Top Navigation Bar
**Role:** Primary site navigation

White (#ffffff) background, full-width, 1px solid #383838 bottom border. Logo left (orange duck + 'MotherDuck' wordmark in Aeonik Mono 600 at 16px). Center nav links: PRODUCT, COMMUNITY, COMPANY (with chevron-down carets), PRICING, DOCS, CONTACT US in Aeonik Mono 500 at 12px, #383838, 2px radius on hover states. Right: LOG IN (ghost text link) + START FREE (blue button). No sticky behavior inferred from data.

### Hero Section
**Role:** First-screen brand statement

Cream (#f4efea) canvas. Display headline 'INFRASTRUCTURE FOR ANSWERS' in Aeonik Mono 300 at 56px, #383838, fully uppercase, letter-spacing ~0.0200em, centered. Subtext in Aeonik Mono 400 at 18px, #383838, centered, max-width ~600px. Two-button row: Primary (sky-blue) + Secondary (outlined). Below: a horizontal logo strip of customer marks (AheadComputing, DG, GOODSHIP, David AI, together.ai, FinOgre) in #383838 monochrome.

### Product Screenshot Frame
**Role:** Hero and feature-section product showcase

White (#ffffff) surface framed by a 1.5–2px #383838 border and the -6px/+6px hard offset shadow. The frame contains a dark-mode product UI mock (MotherDuck AI console) with its own internal color system (dark navy, yellow badge '3 QUESTIONS LEFT!'). Hand-drawn cloud and triangle decorations float around the frame in #54b4de and #383838 strokes on the cream canvas — the contrast between flat illustration and sharp product UI is signature.

### Marquee Banner
**Role:** Scrolling announcement strip between sections

Full-bleed canary-yellow (#ffde00) background, #383838 text in Aeonik Mono 600 at ~18–20px, uppercase, content scrolls horizontally (e.g. 'DATA WAREHOUSE + AI' repeating). No border, no shadow. Sits flush between content bands as a rhythmic visual reset.

### Testimonial Quote Card
**Role:** Social proof — executive or customer quotes

Canary-yellow (#ffde00) background, #383838 2px border, 2px radius, padding 32–40px. Large open-quote glyph in #383838 at the top. Quote text in Aeonik Mono 400 at 18–20px, #383838. READ MORE link in Aeonik Mono 500, underlined, with an external-link icon. Adjacent or overlapping: a photo of the speaker with a white name-label card ('Greg Inman / CTO at Zero Health') in the bottom-left corner.

### Community Tweet Card
**Role:** Social proof — community/testimonial grid

White (#ffffff) background, #383838 1.5–2px border, 2px radius, padding 24–32px. Header row: circular avatar + name (Aeonik Mono 600 at 14px) + handle (Aeonik Mono 400 at 12px, #a1a1a1) + platform icon (Twitter/LinkedIn glyph in #6fc2ff or platform color). Body text in Aeonik Mono 400 at 14px, #383838. No shadow — the border alone defines the card edge.

### Text Input / Search Bar
**Role:** Data-query input field, form fields

White (#ffffff) background, #383838 1.5–2px border, 2px radius, padding 10–12px horizontal. Placeholder text in Aeonik Mono 400 at 14px, #a1a1a1. No focus ring glow — focus is shown by a thicker border or a color shift to #6fc2ff. Square-cornered submit button (sky-blue) attached on the right.

### Yellow Status Badge
**Role:** In-product annotations, notification counters

Canary-yellow (#ffde00) background, #383838 1px border, 2px radius, Aeonik Mono 600 at 11–12px, #383838, uppercase, padding 4px 8px. Used inline on product mockups (e.g. '3 QUESTIONS LEFT!') to inject the brand's playful accent into the technical UI.

### Hand-Drawn Illustration
**Role:** Decorative atmosphere — ducks, clouds, triangles, speech bubbles

Line-art style in #383838 and #54b4de strokes on the cream canvas, with occasional #ff9538 fills (duck bills, beaks, feet). Loose, imperfect, pencil-sketch quality — intentionally not vector-clean. Used to flank product screenshots and decorate section corners. Ducks carry speech bubbles in Aeonik Mono 500 at 12–14px.

### Footer
**Role:** Site-wide links and legal

White (#ffffff) or cream (#f4efea) background, 1px #383838 top border, padding 48–64px vertical. Multi-column link grid with section headers in Aeonik Mono 600 at 14px, #383838, and links in Aeonik Mono 400 at 14px, #383838. Logo + copyright row at the bottom in Aeonik Mono 400 at 12px, #a1a1a1.

## Do's and Don'ts

### Do
- Use Aeonik Mono (or a monospace substitute like JetBrains Mono) as the default face for every text element; reach for Inter only in third-party embed contexts.
- Apply the hard offset shadow (rgb(56,56,56) -6px 6px 0px 0px) to every button and interactive card; the shadow is the elevation system.
- Use Sky Crayon (#6fc2ff) as the sole filled-action color; never use the rainbow outline palette for filled CTAs.
- Keep all border radii at 2px — the near-square corners are non-negotiable and define the system's notebook-paper feel.
- Layer white cards and #f4efea cream backgrounds; never put a cream card on a cream background or a white card on a white background.
- Use the rainbow outline button palette (coral, peach, mint, lilac, lime, periwinkle, slate, marigold) to distribute visual color across repeated tiles.
- Set body and subhead text at 14–18px in Aeonik Mono 400 with 0.0200em tracking; never go below 12px for meaningful content.

### Don't
- Don't use blur or ambient shadows — every shadow is hard-edged and offset, never soft.
- Don't introduce border radii above 2px; rounded buttons or pills break the neo-brutalist geometry.
- Don't use pure black (#000000) for text; use #383838 Charcoal Ink for all foreground and border strokes.
- Don't fill UI controls with the decorative palette (orange, yellow, teal); those colors are reserved for illustration and marquees.
- Don't place a filled chromatic button and a rainbow-outline button as paired CTAs — pair one sky-blue filled with one charcoal-outlined.
- Don't use gradient backgrounds or gradient text — the system is flat-fill only.
- Don't use serifs, italics, or decorative display faces; the mono-or-nothing rule is structural.

## Elevation

- **Button (all variants):** `rgb(56, 56, 56) -6px 6px 0px 0px`

## Surfaces

- **Cream Paper** (`#f4efea`) — Page canvas — the base layer everything sits on
- **Frost White** (`#ffffff`) — Card and nav surfaces — clean white raised off the cream
- **Chalk Gray** (`#f8f8f7`) — Body backgrounds and section dividers
- **Ice Wash** (`#ebf9ff`) — Tinted highlight surfaces adjacent to sky-blue actions
- **Canary Banner** (`#ffde00`) — Full-bleed marquee strip and highlight callouts

## Imagery

Illustration-dominant, no photography except executive headshots. The signature visual is hand-drawn line art: ducks, clouds, triangles, speech bubbles, and arrows sketched in #383838 and #54b4de strokes on the cream canvas, with warm orange (#ff9538) and canary-yellow (#ffde00) fills for beaks, feet, and highlight callouts. The sketch quality is intentionally imperfect — wobbly lines, uneven proportions — like a developer doodled it in a notebook. Product screenshots appear inside framed cards (white surface, 2px #383838 border, hard offset shadow) so the crisp dark-mode product UI contrasts with the loose cream-paper illustration. No lifestyle photography, no stock imagery, no abstract gradient blobs. The only photographic content is square-cropped executive portraits paired with yellow quote cards.

## Layout

Centered max-width container at 1200px, full-bleed sections. The page rhythm alternates: cream hero → cream product showcase (with floating illustration decorations breaking the container edges) → full-bleed canary-yellow marquee → alternating white-card and cream-background content bands → yellow testimonial → cream community grid. Vertical section gaps are generous (64–80px). The hero is a centered text stack (headline + subtext + dual-button row) over a logo strip; subsequent sections are either 2-column text+product-screenshot splits or 3–4-column card grids (community tweets, customer logos). Hand-drawn illustrations deliberately bleed past container edges into the cream margin, breaking the grid at decorative moments. Navigation is a flat top bar, not sticky, with product/community/company dropdowns indicated by chevron carets.

## Similar Brands

- **Linear** — Same monospace-as-primary typography treatment and developer-tool-meets-playful aesthetic, though Linear is dark-first where MotherDuck is light-first
- **Vercel** — Similar use of hard offset shadows and minimal border-radius on a light canvas, with a single dominant accent color carrying primary actions
- **Cursor** — Shares the monospace-forward typography and hand-drawn illustration accents (Cursor's doodles vs. MotherDuck's ducks) layered on a clean light canvas
- **Replit** — Same playful developer-tool identity with crayon-bright accent palette and informal, notebook-like visual language
