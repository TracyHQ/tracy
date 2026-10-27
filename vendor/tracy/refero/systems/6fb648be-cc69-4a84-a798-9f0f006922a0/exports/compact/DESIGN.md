# Faire ES — Style Reference
> warm cream wholesale catalog

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Faire reads like a printed wholesale catalog digitized — warm cream paper (#fbf8f6) as the canvas, a whisper-thin geometric sans (Graphik 100) for body and a high-contrast serif (Nantes) for editorial headlines, almost zero chromatic noise, and one pale buttery yellow (#f1f29f) used as a decorative underline accent rather than a functional call-to-action. The whole interface is achromatic: the brand 'Sign up to buy' button is matte black, the secondary 'Sign in' is ghost, category nav pills use a generous 40px radius, and the 4px button radius keeps control elements grounded and rectangular against the otherwise pill-shaped navigation. Imagery carries all the warmth — full-bleed lifestyle photography of boutiques, shelves, and product stills — while the UI stays quiet, editorial, and whitespace-driven, letting merchants' products feel curated rather than marketed.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream Paper | `#fbf8f6` | Page canvas, hero backgrounds, warm base layer beneath white cards |
| Pure White | `#ffffff` | Card surfaces, search field background, raised panels, inverted text on dark buttons |
| Ink Black | `#000000` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Charcoal | `#333333` | Secondary text, form field borders, body copy, inactive link text |
| Smoke | `#6c6a6a` | Muted helper text, tertiary metadata, low-emphasis labels |
| Ash | `#dadada` | Divider lines, input borders, inactive card outlines, subtle separators between rows |
| Butter Highlight | `#f1f29f` | Yellow outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |

## Typography

### Graphik — Primary UI and body sans-serif. Weight 100 at 22–30px carries display and feature headlines with an almost wireframe-thin feel — the opposite of SaaS-bold; this is editorial restraint. Weight 400 handles body, nav, buttons, and dense metadata.
- **Substitute:** Inter (100, 400) or Manrope (200, 400) — the key is keeping the thin weight available at display sizes
- **Weights:** 100, 400
- **Sizes:** 14px, 16px, 18px, 22px, 28px, 30px
- **Line height:** 1.20–1.50
- **Letter spacing:** 0.0050em to 0.0110em — slight positive tracking that loosens as size shrinks, the opposite of most design systems

### Nantes — Editorial serif for hero and section headlines. Tight leading (1.23 at 52px) lets the serifs do the work of personality. The contrast between a humanist serif headline and a near-weightless sans body is the site's most recognizable typographic gesture.
- **Substitute:** GT Sectra, Source Serif Pro, or PT Serif at regular weight
- **Weights:** 400
- **Sizes:** 22px, 30px, 38px, 52px
- **Line height:** 1.23–1.45
- **Letter spacing:** normal (0)

### Graphik (fix variant) — Corrected variant of Graphik used inside inputs, small buttons, and form elements where kerning fidelity matters most
- **Substitute:** Same as primary Graphik — Inter 400
- **Weights:** 400
- **Sizes:** 14px, 16px
- **Line height:** 1.43, 1.50
- **Letter spacing:** 0.0090em to 0.0110em

### Graphik_fix — Graphik_fix — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px, 16px
- **Line height:** 1.43, 1.5
- **Letter spacing:** 0.009, 0.011

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.5 | 0.154px |
| body | — | — | 16px | 1.5 | 0.144px |
| subheading | — | — | 18px | 1.44 | 0.09px |
| heading-sm | — | — | 22px | 1.45 | 0.11px |
| heading | — | — | 28px | 1.43 | 0.14px |
| heading-lg | — | — | 30px | 1.27 | 0.24px |
| display | — | — | 52px | 1.23 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1280px
- **Section gap:** 48-64px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **cards:** 4px
- **badges:** 40px
- **images:** 4px
- **inputs:** 4px
- **buttons:** 4px
- **navPills:** 40px
- **categoryChips:** 40px

## Components

### Primary CTA Button (Sign up to buy)
**Role:** Main conversion action — dark filled button

Background #000000, text #ffffff, 4px radius, horizontal padding 23px, vertical padding 8–12px. Graphik 400 at 14–16px, letter-spacing 0.0090em. The matte-black fill against cream paper is the page's only high-chromatic-weight element, so it reads as deliberate and confident rather than aggressive.

### Ghost Text Button (Sign in)
**Role:** Secondary action that recedes

No fill, no border. Text in #000000 at 14–16px Graphik 400, letter-spacing 0.0090em. Sits inline with navigation as a quiet alternative to the filled CTA.

### Hero Search Bar
**Role:** Primary discovery input anchored in the header

Pill-shaped (40px radius), white #ffffff background, 1px solid #dadada border, padding 16px horizontal. Search icon left, placeholder text in #333333 at 16px Graphik 400. The pill shape is the only non-rectangular control on the page, making it instantly identifiable as the search field.

### Category Nav Pills
**Role:** Horizontal category filter row above featured brand grid

40px radius, 16px vertical / 23px horizontal padding, 1px border. Default state: white #ffffff background, #333333 border, #000000 text. Active/selected state: #000000 background, #ffffff text. Pills sit in a horizontally scrollable row with 12px gaps.

### Top Category Nav Bar
**Role:** Primary site navigation row

Centered text-only links on cream #fbf8f6 background, no background or border. Items: Featured, New, Home decor, Food & drink, Women, Beauty & wellness, Jewelry, Paper & novelty, Kids & baby, Pets, Men, Books. 12–16px gap between items. Graphik 400 at 14px, color #000000.

### Brand Logo Card
**Role:** Square tile in the featured brands grid

Square or near-square thumbnail, 4px radius, 1px solid #dadada border, 4px padding. The product photography fills the card; the card itself is just a thin frame.

### Promo Banner (Top Bar)
**Role:** Slim announcement strip above the main header

Full-width, centered text 'Shop wholesale online from over 100,000 brands.' at 14px Graphik 400 in #000000 on cream #fbf8f6. The 'Sign up' link is underlined inline. No background fill — just a thin line of type at the top of the page.

### Hero Overlay Headline
**Role:** Large editorial title sitting over full-bleed photography

Nantes 400 at 38–52px, white #ffffff, line-height 1.23, no tracking. Headline sits bottom-left over the hero image with 48px left padding. A short 3-word yellow underline (#f1f29f) appears beneath the headline — this is the only place the accent color touches the hero.

### Section Heading with Yellow Accent Rule
**Role:** Reusable section title treatment used across the page

A 3px-tall #f1f29f horizontal line, 4px wide, sits above or below a Nantes 400 heading. The rule is decorative — it does not span the full heading width, it is a short editorial mark.

### Inverted Dark Section
**Role:** Full-width band that flips the page to a dark mode mid-scroll

Background is a deep desaturated green/charcoal. Text in white #ffffff, Nantes 400 at 30–38px. The contrast against the cream sections above and below creates a clear content break. Used for value-prop blocks like 'Get your products in front of millions of buyers'.

### Header Logo Wordmark
**Role:** Brand identifier top-left

FAIRE set in Graphik 400 (or a wide-tracked geometric sans) with significant positive letter-spacing, #000000. The generous tracking is the wordmark's only typographic treatment — no icon, no case styling.

## Do's and Don'ts

### Do
- Use the cream #fbf8f6 canvas as the page background, never pure white — the warm tone is part of the brand identity
- Set all body and UI text in Graphik 400 with letter-spacing between 0.0090em and 0.0110em
- Use Nantes 400 (or a humanist serif substitute) for editorial headlines at 30px and above, with tight 1.23–1.27 line-height
- Give all category nav, filter chips, and tag elements a 40px border-radius pill shape
- Keep all buttons, inputs, and cards at 4px border-radius
- Use the matte black #000000 fill for the single primary CTA on any given screen — never introduce a chromatic button color
- Use #f1f29f only as a short 3px decorative underline beneath a heading; never as a background, border, or text color

### Don't
- Do not use drop shadows or blur effects on any component — depth comes from section color transitions, not elevation
- Do not add a chromatic primary action color (green, red, blue) — the entire interactive system stays achromatic
- Do not bold the Graphik headlines — the signature is weight 100 or 400 only; authority comes from the serif, not from sans-serif heaviness
- Do not use the yellow #f1f29f on buttons, badges, or alerts — it is an editorial accent, not a functional state color
- Do not use rounded corners larger than 40px or smaller than 4px — the system has exactly two radii
- Do not introduce gradients — the page is flat-color throughout, including the hero overlay
- Do not use centered text in body or navigation contexts — the site reads left-aligned with editorial asymmetry

## Elevation

- **Header search bar:** `none — relies on 1px #dadada border for definition`
- **Category nav pills:** `none — flat with 1px border`
- **Brand logo cards:** `none — flat with 1px #dadada border`
- **Primary CTA button:** `none — matte black fill carries the weight`

## Surfaces

- **Page Canvas** (`#fbf8f6`) — Warm cream background across the entire page; primary canvas tone
- **Card Surface** (`#ffffff`) — White product cards, elevated panels, search input field, pill chips
- **Elevated Overlay** (`#ffffff`) — Modals, dropdowns, sticky header bar; same white as cards but visually stacked via thin 1px borders

## Imagery

Full-bleed lifestyle and product photography carries all visual warmth. The hero uses a candid documentary shot of a woman in a boutique — green shelving, curated products, warm natural light — that establishes the brand's merchant-world identity. Product close-ups in the featured brands grid are square, tightly cropped, and fill their card edge-to-edge. No illustration, no 3D renders, no abstract graphics. Color treatment is natural and slightly desaturated to harmonize with the cream canvas; no duotone or filters. Photography is the only source of saturated color on the page.

## Layout

Max-width ~1280px centered container with generous side padding (48px). The hero is full-bleed with the text container left-aligned inside the max-width. Below the hero, sections alternate between cream #fbf8f6 canvas and occasional dark green inverted bands, each separated by 48–64px vertical rhythm. The featured brands section uses a category pill row followed by a horizontal product image grid (roughly 4–5 cards visible per row). Navigation is a two-tier top system: a slim promo banner, then a primary header with logo + search + utility actions, then a centered category text nav. The page is spacious and editorial — high white space ratio, no multi-column dense layouts, no sidebars. Asymmetric compositions (large left-aligned headline over image) rather than centered stacks.

## Similar Brands

- **GOOP** — Same warm cream canvas with achromatic UI and editorial serif headlines over product photography
- **Net-a-Porter** — Same high-fashion catalog feel with generous whitespace, thin sans body type, and full-bleed lifestyle photography as the dominant visual element
- **Mejuri** — Same minimal achromatic UI with a single warm accent and editorial-style typography mixed with geometric sans
- **Anthropologie** — Same boutique-merchant identity expressed through full-bleed shop photography, warm neutrals, and serif/sans typographic pairing
- **Shopify (marketplace sections)** — Same clean B2B header pattern with a centered pill-shaped search bar, matte-black primary CTA, and ghost text links for secondary actions
