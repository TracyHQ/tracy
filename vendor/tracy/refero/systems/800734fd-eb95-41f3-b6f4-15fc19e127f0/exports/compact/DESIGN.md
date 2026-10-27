# Brainfish — Style Reference
> lime-marker editorial broadsheet — a near-monochrome page where a single vivid green stroke does all the work

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Brainfish operates as a minimalist editorial broadsheet: a near-monochrome canvas of paper white and deep ink, interrupted by a single highlighter-lime accent that makes every CTA feel like a mark on a page rather than a button on a screen. The type system pairs Geist's geometric clarity with Fraunces italic for one or two emphasis words inside a headline, creating a signature rhythm where a serif "actually" or "every" sits inside a sans-serif sentence. Components are printed rather than projected — 4px button corners, 2px hard offset shadows, 1px ink borders, and cream card surfaces that read as paper rather than glass. A topographic illustration runs beneath the entire page as a quiet watermark. Color is rationed: lime appears only where action is requested or where a section needs punctuation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Lime Sprint | `#a3e635` | Green action color for filled buttons, selected navigation states, and focused conversion moments. |
| Paper White | `#ffffff` | Primary page canvas and inverse text on dark surfaces |
| Cream | `#fcfff7` | Warm off-white surface for cards, stat tiles, and footer — a barely-there yellow-green tint that distinguishes a lifted surface from the page without introducing a new color |
| Ink | `#262626` | Primary text color, default border, icon stroke, and hard shadow color. This is the single dark token that does structural work across text, lines, and elevation |
| Black Ink | `#000000` | Strongest display text and filled icon glyphs where maximum weight is needed inside a headline or pull-quote |
| Depth | `#303030` | Dark button and surface background — used for the large primary action blocks in the nav and hero where a heavier fill than ink is needed but true black would be too harsh |
| Rule | `#e5e5e5` | Hairline borders, card outlines, footer dividers, and the soft separator between sections |
| Muted | `#525252` | Secondary body text, supporting descriptions, and the slightly softer voice below a heading |
| Muted Gray | `#737373` | Tertiary helper text, badge labels, copyright fine print, and the most de-emphasized text in the hierarchy |
| Mint Edge | `#7ee2b8` | Green accent for outlined action borders, linked labels, and lightweight interactive emphasis |
| Mint Wash | `#dcfff1` | Gray action color for filled buttons, selected navigation states, and focused conversion moments |

## Typography

### Geist — Primary interface and headline face. Used for navigation, buttons, body copy, and most display text. Weight 600 carries the display sizes (28-56px) with consistently negative letter-spacing; weight 400 carries body and caption. Tight tracking on headings (-0.0200em) compresses the geometric forms into a more editorial density rather than the wide airy SaaS default
- **Substitute:** Inter, Manrope, or system-ui sans
- **Weights:** 400, 500, 600
- **Sizes:** 14, 16, 18, 20, 28, 36, 48, 56px
- **Line height:** 1.16 for display, 1.50 for body 20px, 1.55 for body 18px, 1.25 for body 16px, 1.14 for caption
- **Letter spacing:** Display 56px: -0.28px (-0.005em); 48px: -0.96px (-0.02em); 36px: -0.18px (-0.005em); 28px: -0.56px (-0.02em); body sizes track normal

### Fraunces — Display serif reserved exclusively for one or two italic emphasis words inside a Geist headline — the word 'every', 'actually', 'B2B complexity'. This single serif italic inside a sans-serif sentence is the site's editorial signature: it signals that the system thinks in terms of typeset prose rather than product copy. Never used for body, buttons, or full headlines
- **Substitute:** Source Serif Pro, Playfair Display, or Lora italic
- **Weights:** 500, 600
- **Sizes:** 36, 48, 56px
- **Line height:** 1.08–1.17
- **Letter spacing:** -0.0200em, -0.0150em, -0.0100em, -0.0050em

### Phosphor-Fill — Phosphor-Fill — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1
- **OpenType features:** `"liga"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.14 | — |
| body-sm | — | — | 16px | 1.25 | — |
| body | — | — | 18px | 1.55 | — |
| subheading | — | — | 20px | 1.5 | — |
| heading-sm | — | — | 28px | 1.14 | -0.56px |
| heading | — | — | 36px | 1.14 | -0.18px |
| heading-lg | — | — | 48px | 1.08 | -0.96px |
| display | — | — | 56px | 1.16 | -0.28px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 8px
- **pills:** 9999px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Lime Primary Button
**Role:** Primary call-to-action — the only filled chromatic button in the system

Background #a3e635, text #262626, 4px border-radius, 6px vertical / 14px horizontal padding, 1px solid #262626 border, 2px 2px 0 0 #262626 hard offset shadow on hover/active. Type: Geist 16px weight 500. Used sparingly — typically once per view, in the nav and the hero.

### Dark Block Button
**Role:** Large primary action block for nav and hero CTAs

Background #303030, text #ffffff, 0px border-radius, 24px padding all sides, 1px solid #ffffff border, 2px 2px 0 0 #262626 hard offset shadow. Type: Geist 16-18px weight 500. Reads as a stamped block rather than a rounded pill.

### Outlined Secondary Button
**Role:** Secondary action paired with a lime primary — used for 'Join webinar' and similar

Background #ffffff, text #262626, 4px border-radius, 8px vertical / 16px horizontal padding, 1px solid #262626 border. No shadow. Geist 16px weight 500.

### Ghost Text Link
**Role:** Inline text link and nav anchor

Background transparent, text #262626, 0px border-radius, no padding, optional 1px #262626 underline on hover. Geist 16px weight 500 for nav, 400 for body links.

### Cream Stat Card
**Role:** Numeric proof tile in the 4-column results band

Background #fcfff7, 8px border-radius, 1px solid #e5e5e5 border, no shadow, 24-32px padding. Large number at 48px Geist weight 600 in #262626. Description at 18px Geist weight 400 in #525252. Source attribution at 14px Geist weight 400 in #737373 below.

### Status Pill Badge
**Role:** Live status indicator — 'All platforms & systems operational'

Background #dcfff1, 1px solid #7ee2b8 border, 9999px border-radius, 6px vertical / 12px horizontal padding. Text at 14px Geist weight 500 in #262626. Sits inline with a small mint dot. The only place the mint/mint-wash chromatic pair appears.

### Pill Tag
**Role:** Category label and personalization chip (e.g. 'ROLE: Product Manager', 'PLAN: Pro Annual')

Background transparent, text #262626, 9999px border-radius, 4-6px vertical / 10-12px horizontal padding, 1px solid #262626 border. Geist 12-14px weight 500 with 0.08em uppercase tracking on labels.

### Top Navigation Bar
**Role:** Primary site navigation

White (#ffffff) background, 67px height, full-width with max-width inner container. Logo (Brainfish wordmark with small fish icon in #262626) on the left, four nav links centered in Geist 16px weight 500 #262626, 'Sign in' text link and lime CTA button on the right. No drop shadow, no border bottom — reads as a single line on paper.

### Hero Split Section
**Role:** Above-the-fold introduction

Full-width white background with a soft lime (#a3e635) radial glow anchored to the upper-right quadrant. Left half: 56px Geist 600 headline in #262626 with one Fraunces italic emphasis word, 18px Geist 400 subhead in #525252, and a row containing the lime CTA plus an outlined secondary button. Right half: a floating product UI card (chat or thread interface) with a 1px #262626 border and 8px radius, positioned to overlap the lime glow.

### Customer Logo Strip
**Role:** Social proof row directly below the hero CTAs

'Trusted by' label in 14px Geist 400 #737373 on the left, followed by 3-5 customer logos in monochrome #525252-#262626 at 60-70% opacity, evenly spaced horizontally. No background band — sits directly on white.

### Testimonial Quote Section
**Role:** Long-form customer pull-quote

Full-width cream (#fcfff7) background. Large pull-quote at 36-48px Geist 600 in #262626 with Fraunces italic emphasis words, occupying the left two-thirds. Right column contains a 48px circular portrait photo and a compact bio (name in 16px Geist 500, role in 14px Geist 400 #737373). No card container — the cream band itself is the surface.

### Feature Mockup Card
**Role:** Product UI showcase used in feature sections

A product screenshot (chat panel, thread interface, knowledge base) presented as a floating card with 8px border-radius, 1px solid #262626 border, 2px 2px 0 0 #262626 hard offset shadow, and 0px internal padding (the UI is rendered to the card edges). Always paired with a text block on the opposite side of a 2-column layout.

## Do's and Don'ts

### Do
- Use #a3e635 lime exclusively for primary CTAs, the 'Book a demo' button, and hero gradient halos — never as a text color, icon fill, or decorative background
- Pair every Geist weight 600 headline with exactly one or two Fraunces italic emphasis words — the italic word should be a contrasting idea or qualifying word (every, actually, B2B complexity, this week)
- Apply 2px 2px 0 0 #262626 hard offset shadows to interactive elements on hover/active — never use blur-based drop shadows
- Set button border-radius to 4px (small inline buttons) or 0px (large block buttons) — the system deliberately rejects pill-shaped buttons on the main UI
- Use #fcfff7 cream as the only card/band surface above #ffffff white — this warm off-white is what distinguishes a lifted area from the page without introducing a new color family
- Set headings at 56px (display) or 48px (heading-lg) with negative letter-spacing between -0.28px and -0.96px — never default to loose tracking on display sizes
- Use the topographic contour-line illustration as a continuous background watermark across entire sections, not as a single hero image

### Don't
- Don't introduce a second chromatic accent beyond lime and mint — the system is monochrome with exactly two purposeful color moments (lime for action, mint for live status)
- Don't use soft blurred drop-shadows — every shadow in the system is a 2px solid offset in #262626 ink, or it doesn't exist
- Don't round buttons to 8px+ — the button radii are 4px or 0px, never pill-shaped on the main UI (pills are reserved for tags and status indicators only)
- Don't use Fraunces for body text, buttons, or full headlines — the serif is only for the italic emphasis word inside a Geist sentence
- Don't use #000000 for borders or large fills — reserve true black for the strongest display text weight, and use #262626 ink for all strokes, borders, and structural dark
- Don't add gradients to body backgrounds or card surfaces — the only gradient in the system is the soft lime radial halo in the hero
- Don't apply uppercase 0.08em tracking to body copy or headings — reserve it for tiny labels, badge chips, and tabular meta data (e.g. 'PERSONALIZING FOR SARAH', 'ROLE:')

## Elevation

- **Primary lime CTA button:** `2px 2px 0px 0px #262626`
- **Large dark action block:** `2px 2px 0px 0px #262626`
- **Stat card and feature card:** `none — uses 1px solid #e5e5e5 border on #fcfff7 surface`
- **Topographic background:** `none — no elevation, acts as paper texture beneath cards`

## Surfaces

- **Paper Canvas** (`#ffffff`) — Default page background and inverse text surface
- **Cream Sheet** (`#fcfff7`) — Card backgrounds, stat tiles, footer, and warm band surfaces — the only lift above paper
- **Depth Block** (`#303030`) — Dark button and large primary action block surface
- **Mint Pill** (`#dcfff1`) — Status indicator surface — used only for the 'operational' health pill

## Imagery

The site uses illustration and product UI as its visual language, not photography. A muted topographic contour-line map runs as a full-width background watermark across entire sections, reading as paper texture rather than data viz. Product mockups appear as floating UI cards (a chat support panel, a thread interface) with rounded corners, no device chrome, and thin ink borders. Customer logos are shown in a single horizontal 'Trusted by' row at 60% opacity. A single circular portrait accompanies the testimonial. There is no lifestyle photography, no 3D render, no decorative gradient other than the lime radial halo behind the hero headline. The lime halo is the only atmospheric color effect and appears only in the top-right quadrant of the hero — it is a soft radial wash, not a hard gradient.

## Layout

Max-width ~1200px centered container with generous horizontal padding. The page opens with a white nav (67px tall) then a hero split: large headline left half, floating product UI right half, with a lime radial glow anchored to the right. Section rhythm alternates between white and cream (#fcfff7) full-width bands. A 4-column stat grid sits inside a cream card strip. Testimonial sections are full-width with a large quote on the left and a compact bio on the right. Feature sections pair text blocks with product mockups in a 2-column layout. The topographic contour-line illustration is a continuous background element beneath multiple sections, not a single hero image. Navigation is a simple horizontal top bar with a single lime CTA on the far right — no sidebar, no mega-menu, no sticky-on-scroll behavior beyond the natural position.

## Similar Brands

- **Linear** — Same sharp 4px button corners, near-monochrome canvas with a single vivid accent color, and hard offset shadows in place of soft elevation
- **Plain** — Shared editorial broadsheet feel — Geist-class sans paired with a serif italic for emphasis words, topographic background illustrations, and cream off-white card surfaces
- **Pitch** — Similar use of tight negative letter-spacing on display sizes and a restrained single-accent palette that reads as typeset prose rather than product UI
- **Resend** — Same approach of rationing a single lime-green accent against an otherwise achromatic page, with minimal but deliberate 1px borders
- **Frame.io** — Shared product-UI-as-hero pattern where floating chat/thread screenshots are treated as editorial illustrations rather than device mockups
