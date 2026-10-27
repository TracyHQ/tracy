# Arva — Style Reference
> Pastoral editorial magazine spread on a cream field

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Arva uses a pastoral editorial language: warm cream canvas replaces pure white, deep forest green anchors the brand, and quilted pastel surfaces (sky blue, peach, sage, bone) tile across content sections like fields seen from altitude. Typography pairs a refined editorial serif (Reckless) with a neutral sans (Inter), giving the site a printed-magazine feel over a typical SaaS chrome. Buttons are dramatically pill-shaped (100–110px radius), photography dominates above the fold at full-bleed, and the only saturated color besides the brand green appears as a vivid lime marquee strip — a single high-energy accent against an otherwise quiet, earth-toned system.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Ink | `#07503f` | Primary brand color, header background, nav bar fill, section dividers, footer — deep teal-green against warm cream creates agricultural gravitas |
| Vivid Lime | `#e8fe85` | Promotional marquee strip, highlight announcement bars, occasional link hover wash — the only high-energy accent in the palette |
| Bone | `#f1efdf` | Page canvas, base background — warm off-white replacing pure white to feel organic and printed |
| Pure White | `#ffffff` | Card surfaces, input fills, button text, icon backgrounds — the bright counterpoint against bone canvas |
| Ash Gray | `#efefef` | Secondary card surface, subtle section dividers |
| Charcoal | `#212529` | Primary body text, headings on light, icon strokes — near-black for high contrast on cream |
| Graphite | `#353535` | Secondary text, link borders, button borders, subdued UI outlines |
| Pewter | `#6d6d6d` | Muted helper text, tertiary button text and borders |
| Sky Card | `#b2cee7` | Decorative card surface — one of the quilted pastel tiles used for partner testimonials and category blocks |
| Peach Card | `#fceace` | Decorative card surface — warm pastel tile alternating with sky and sage cards |
| Sage Card | `#e6ecd5` | Decorative card surface — soft green pastel tile for agrarian category blocks |
| Moss | `#c3cda7` | Subtle borders, input outlines, decorative dividers within body content |

## Typography

### Inter — Primary UI and body sans. Handles everything from 12px nav metadata to 80–90px hero display. Negative tracking tightens display sizes; positive tracking (+0.025–0.029em) opens up small caps and badge text.
- **Substitute:** Inter (already free), or DM Sans as fallback
- **Weights:** 100, 200, 300, 400, 500, 600
- **Sizes:** 12, 13, 14, 15, 16, 17, 18, 80, 90px
- **Line height:** 0.97–2.20
- **Letter spacing:** -0.037em at 80–90px, -0.022em at 17–18px, 0.025–0.029em at 12–15px

### Reckless — Display serif for editorial headlines. At 57px the light weight (300) feels literary and unhurried; at 500–600 it becomes section anchors. Tight tracking (-0.012em) keeps the serif sharp at large sizes.
- **Substitute:** Cormorant Garamond, GT Sectra, Source Serif Pro
- **Weights:** 300, 500, 600
- **Sizes:** 24, 28, 37, 43, 45, 57px
- **Line height:** 1.00–1.24
- **Letter spacing:** -0.012em

### RecklessLight — Ultra-light serif variant for body-leading headlines and pull-quote copy. The 100 weight at 25–28px creates a delicate editorial voice in supporting sections.
- **Substitute:** Cormorant Garamond Light, Source Serif ExtraLight
- **Weights:** 100, 300
- **Sizes:** 24, 25, 28, 37, 45, 49, 57px
- **Line height:** 1.00, 1.06, 1.22, 1.24
- **Letter spacing:** normal

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 300, 400, 500
- **Sizes:** 17px
- **Line height:** 1.1, 1.35

### Helvetica — Helvetica — detected in extracted data but not described by AI
- **Weights:** 300, 400
- **Sizes:** 12px, 17px
- **Line height:** 1.35, 1.92

### FKGrotesk — FKGrotesk — detected in extracted data but not described by AI
- **Weights:** 300
- **Sizes:** 12px, 16px
- **Line height:** 1.24

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.025px |
| body-sm | — | — | 14px | 1.5 | 0.025px |
| body | — | — | 16px | 1.52 | -0.022px |
| subheading | — | — | 24px | 1.24 | -0.012px |
| heading-sm | — | — | 37px | 1.22 | -0.012px |
| heading | — | — | 45px | 1.06 | -0.012px |
| heading-lg | — | — | 57px | 1.06 | -0.022px |
| display | — | — | 80px | 1 | -2.96px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 50px
- **Card padding:** 30px
- **Element gap:** 8px

### Border Radius

- **cards:** 20px
- **links:** 26px
- **inputs:** 33px
- **buttons:** 100px
- **nav-pills:** 110px
- **hero-cards:** 30px

## Components

### Pill CTA Button (Forest Filled)
**Role:** Primary action button

Background #07503f, text #ffffff, 100px border-radius, 10px 24px padding, Inter weight 500–600 at 14–15px with 0.025em tracking. Uppercase or sentence case both observed.

### Pill Outline Button (Cream/Ghost)
**Role:** Secondary action button

Transparent fill, 1px border in #353535 or currentColor, 100px border-radius, 10px 24px padding, Inter at 14px. Used for 'I'm a Company' paired with the filled 'I'm a Farmer' primary.

### Pill Nav Element
**Role:** Header nav link and dropdown trigger

Sits on #07503f forest header. White text, Inter at 15px, no background. Dropdown chevrons are 8px. Active states shift to slight white opacity or underline.

### Get In Touch Pill
**Role:** Header CTA

Pill shape, 110px radius, #ffffff background on forest header, #212529 text, 10px 20px padding, Inter weight 500.

### Full-Bleed Hero with Photography
**Role:** Above-the-fold section

Full-viewport landscape photograph (aerial field shot, warm greens), centered white serif headline at 57–80px (Reckless or Inter display), two pill buttons below, 'Scroll to Explore' with down-arrow at bottom center. No overlay — image is the background.

### Lime Marquee Strip
**Role:** Top promotional banner

Full-bleed #e8fe85 background bar, repeating dark text (Inter at 12–14px) announcing guides and resources, separated by outlined checkmark icons. Runs the full viewport width above the main nav.

### Pastel Quilt Card
**Role:** Testimonial or category tile

Surface in one of four pastel tones (#b2cee7 sky, #fceace peach, #e6ecd5 sage, #efefef bone), 20px radius, 30px padding, centered content with brand logo at top, quote in body, author name + role at bottom. Cards sit side-by-side in a 3-column row.

### Forest Section Banner
**Role:** Dark interstitial section

Full-bleed #07503f background, white serif headline, white body copy, small white icon-and-text benefit blocks arranged in a 2×2 grid with icons in circular 30–40px containers.

### Input Field
**Role:** Form input

White fill, 1px border in #c3cda7 (moss) or #353535, 33px radius (distinctly more pill than card), 12px vertical padding, Inter at 16px. Focus ring in #07503f.

### Header Logo Lockup
**Role:** Brand mark

White lowercase 'arva' wordmark with a green triangular leaf icon to the left. Sits centered on the forest header at roughly 28–32px height.

### Section Divider Header
**Role:** Section title block

Left-aligned serif headline (Reckless at 45–57px, #212529) on bone canvas, with optional 1–2 line body intro in Inter at 17px below. No decorative element — the typography carries the hierarchy.

### Partner Logo Card
**Role:** Featured partner tile

20px radius, white or pastel surface, centered brand logo at top (raster, full color), blockquote in Inter at 14–15px, author name + title in Inter weight 500–600 at 14px. Cards have generous 30px+ padding.

### Footer (Forest)
**Role:** Site footer

Background #07503f, white text and links, multi-column link grid, Inter at 14–15px, logo lockup repeated. 110px top padding or more for breathing room.

## Do's and Don'ts

### Do
- Use #f1efdf (Bone) as the page canvas on every light section — never substitute pure #ffffff as the base
- Apply the 100px pill radius to every button regardless of variant; consistency of the pill is a brand signature
- Pair Reckless (serif) at 45–57px for section headlines with Inter (sans) at 14–17px for body — the serif/sans tension defines the editorial voice
- Let the #e8fe85 lime appear only on the marquee strip and promotional micro-accents — it earns attention through scarcity
- Use the four pastel card surfaces (sky, peach, sage, bone) as a rotating palette within a single row, like a quilted series, not randomly distributed
- Fill the nav bar and section dividers solid with #07503f (Forest Ink) — the dark green bands are the structural backbone of the page rhythm
- Set hero headlines at 57–80px in Reckless weight 300 or Inter weight 600, centered, over full-bleed landscape photography

### Don't
- Do not use #ffffff as the page background — always layer it on top of #f1efdf to preserve the warm printed feel
- Do not apply small radii (4–8px) to buttons or cards; the 20px+ and 100px+ radii are non-negotiable
- Do not introduce new saturated colors beyond Forest Ink and Vivid Lime — the pastel tiles carry the chromatic load
- Do not use Reckless below 24px or for body copy — the serif is for headlines and pull-quotes only
- Do not apply shadows or elevation to cards; depth comes from pastel surface color shifts, not box-shadow
- Do not pair multiple pastels within a single card; one surface color per tile
- Do not center body paragraphs — headlines and hero copy can be centered, but supporting text reads left-aligned at max 60ch

## Elevation

Elevation is achieved through color contrast and surface shifts, not shadows. Cards gain visibility by switching to a pastel or pure white surface against the bone canvas; section transitions are marked by switching to solid forest green. No box-shadows are used in the system.

## Surfaces

- **Bone Canvas** (`#f1efdf`) — Page background, warm base layer
- **Pure White** (`#ffffff`) — Card surfaces, input fields, button text
- **Pastel Tiles** (`#b2cee7`) — Quilted card variants — sky, peach (#fceace), sage (#e6ecd5), bone (#efefef)
- **Forest Ink** (`#07503f`) — Header, section banners, footer — dark interstitial layer
- **Vivid Lime** (`#e8fe85`) — Promotional marquee strip — single high-energy accent

## Imagery

Full-bleed landscape and agricultural photography dominates — aerial drone shots of crop fields in vibrant green and golden brown, on-location portraits of farmers standing in cornfields, close-up product/landscape crops. Photographs are high-resolution, naturalistic, slightly saturated, and always warm-toned. No illustrations or abstract graphics; no icons beyond simple line-art checkmarks and benefit glyphs. Photography treatment is raw (no duotone, no heavy filters, no overlay text boxes with backgrounds). Icons are minimal and line-style when present.

## Layout

Full-bleed sections stacked vertically with no max-width container at the section level — each band bleeds to the viewport edge. Internal content is centered at 1200px max-width. Hero is a full-viewport-height image with centered headline + two-button stack + scroll cue. Below the hero, content alternates between bone canvas sections with centered headlines, forest-green interstitial bands with white text, and a 3-column quilted card grid for testimonials/partners. Navigation is a forest-green header bar with centered logo, nav links left, CTA + language selector right. A lime marquee strip sits above the header. Section gaps are roughly 50px; content is spacious and editorial, not information-dense.

## Similar Brands

- **Patagonia** — Same earth-tone editorial identity with full-bleed nature photography and warm cream canvas; both use a single brand color to anchor the page rhythm
- **Stripe** — Similar generous pill-button radius and clean white/card layering, though Arva swaps the cool grays for warm cream and introduces a serif voice
- **Aesop** — Editorial serif + sans pairing, warm off-white canvas, muted restrained palette, photography that does the heavy visual lifting
- **Mailchimp** — Playful oversized pill buttons and a single saturated brand color, though Arva replaces the cartoon illustration system with pastoral landscape photography
- **Wren (offset.earth)** — Same regenerative-agriculture visual language: deep forest green brand, cream canvas, full-bleed field photography, and warm pastel content surfaces
