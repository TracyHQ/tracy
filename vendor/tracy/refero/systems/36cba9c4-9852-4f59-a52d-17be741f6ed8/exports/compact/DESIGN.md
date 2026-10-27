# ATMOS — Style Reference
> violet horizon above white void

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Atmos is a single-screen meditation: one deep violet sky fading to lavender above an expanse of white silence. The entire interface lives in the first viewport — a colossal serif wordmark, a ring of small caps text orbiting it, and a single pill button — then dissolves into negative space. Typography does the heavy lifting: a custom display serif at 200px whispers rather than shouts, paired with DM Sans for micro-labels. There is no product UI, no navigation bar, no cards, no shadows. The only chromatic note is the violet gradient; everything else is paper-white and ink-black.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Violet | `linear-gradient(180deg, #0825c6 0%, #6b6ce0 100%)` | Hero gradient anchor, decorative atmosphere — the singular chromatic note; fills the sky of the opening viewport |
| Paper White | `#ffffff` | Hairline borders, dividers, input outlines, and card edges on light surfaces. Do not promote it to the primary CTA color |
| Ink Black | `#000000` | Body text, headings, button text, border outlines — the only contrast color |

## Typography

### _NewYork — Display wordmark and large headings — custom serif at 200px weight 400 creates monumentality through restraint; the thin strokes and high contrast of editorial serifs read as gallery signage, not web UI. Use at 200px for the brand mark, 50px for section anchors. No bold weight — the form itself carries presence.
- **Substitute:** Playfair Display, Cormorant Garamond, or DM Serif Display for a similar editorial serif
- **Weights:** 400
- **Sizes:** 50px, 200px
- **Line height:** 1.15

### DM Sans — UI labels, link text, body copy, and button text — the only working sans-serif. Weight 400 for labels and links, 700 for emphasized micro-copy. Generous line-height (1.5) for longer passages, tight (1.15) for button and nav text.
- **Substitute:** Inter, Manrope, or system-ui
- **Weights:** 400, 700
- **Sizes:** 20px, 25px, 30px
- **Line height:** 1.15–1.50

### Times — Orbital micro-labels — the curved text ring around the wordmark uses 10px Times at normal spacing. This deliberately anti-modern choice (serif at 10px) creates a vintage editorial annotation feel. Use sparingly for fine print and caption-level metadata only.
- **Substitute:** DM Serif Text, or any system serif
- **Weights:** 400
- **Sizes:** 10px
- **Line height:** 1.15

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.15 | — |
| body | — | — | 20px | 1.5 | — |
| body-lg | — | — | 25px | 1.5 | — |
| subheading | — | — | 30px | 1.15 | — |
| heading | — | — | 50px | 1.15 | — |
| display | — | — | 200px | 1.15 | — |

## Spacing & Layout

**Density:** spacious

- **Card padding:** 30px
- **Element gap:** 20px

### Border Radius

- **cards:** 0px
- **inputs:** 9999px
- **buttons:** 9999px

## Components

### Hero Wordmark
**Role:** Brand display element

Centered _NewYork serif at 200px, weight 400, white (#ffffff), line-height 1.15. Sits in the middle of the violet gradient viewport. No subtitle beneath it — the type IS the message.

### Orbital Text Ring
**Role:** Decorative annotation

Small caps text curving in a circle around the wordmark. Times 10px, weight 400, white, letter-spacing normal, line-height 1.15. Drawn as SVG text-on-path. Creates a seal or stamp aesthetic.

### Pill Button (On Violet)
**Role:** Primary interaction

White (#ffffff) fill, black (#000000) text, DM Sans 20px weight 700, padding 12px 32px, border-radius 9999px. Floats centered below the wordmark in the hero. The contrast inversion (white pill on violet) is the only action affordance on the page.

### Ghost Link
**Role:** Inline navigation or secondary action

DM Sans 20–30px weight 400, no underline by default, black on white. The link role appears in body text contexts with minimal chrome.

### White Space Section
**Role:** Layout primitive

Not a visible component — the dominant pattern. Full-bleed #ffffff blocks with 250px vertical padding, containing only centered type or nothing at all. Section gaps measured in hundreds of pixels, not dozens.

### Caption Label
**Role:** Fine print / metadata

Times 10px weight 400, black on white, line-height 1.15. Used for dates, credits, or editorial annotations. The serif-at-10px choice is deliberately old-fashioned.

## Do's and Don'ts

### Do
- Let the violet gradient occupy the full first viewport — do not crop or contain it
- Use _NewYork (or Playfair Display) at 50–200px for any display-level text; never below 40px
- Set border-radius to 9999px on all buttons, tags, and pill-shaped elements
- Maintain 100–250px vertical padding between sections; tight spacing breaks the meditative rhythm
- Keep button text at DM Sans 20px weight 700, line-height 1.15
- Use Times 10px for fine print and orbital/annotation text only

### Don't
- Do not add a navigation bar, header, or footer — there are none in this system
- Do not use card components, shadows, or elevation — the design is flat and borderless below the hero
- Do not introduce additional chromatic colors — violet and white/black are the complete palette
- Do not use DM Sans at display sizes — it is a UI face, not a display face; switch to serif above 40px
- Do not set text below 10px or above 200px — the type scale has only six steps
- Do not use sharp (0–4px) radii on interactive elements — pills are mandatory for buttons
- Do not fill the page with content — silence and white space are structural elements

## Elevation

No shadows. The design relies entirely on the violet-to-white transition and sheer negative space to create depth. Elevation is achieved through scale and isolation, not drop shadows or borders.

## Surfaces

- **Sky Gradient** (`#0825c6`) — Hero atmosphere — deep violet to lavender vertical fade occupying the opening viewport
- **Paper White** (`#ffffff`) — All content below the hero — pure white canvas, no differentiation between page and card

## Imagery

No photography, no product screenshots, no illustrations. The sole visual is the violet gradient sky. Everything else is typography on white. This is a text-art site, not a content site.

## Layout

Full-bleed single-column layout. The hero is a centered composition: wordmark dead center, orbital ring wrapped around it, pill button below. No grid, no sidebar, no multi-column content. Subsequent sections are centered stacks or pure white space with 250px vertical breathing room. Navigation does not exist — the page is a single moment, not a flow.

## Similar Brands

- **Aesop** — Same editorial serif display + generous white space + restrained single-accent palette
- **Apple AirPods Max page** — Full-bleed gradient hero with centered product/wordmark, no navigation, dramatic scale typography
- **Bottega Veneta** — Fashion-brand approach: one dominant color field, large serif type, no UI chrome
- **Studio Dumbar** — Agency portfolio minimalism — the page is the art piece, not a container for content
