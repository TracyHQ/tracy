# Lyssna — Style Reference
> botanical research journal — a quiet white page where one deep teal button glows beneath serif headlines and mint accent panels breathe like greenhouse glass.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Lyssna reads as a botanical research journal brought to life on screen: a near-white editorial canvas, a deeply saturated dark teal that anchors every action, and a single bright mint surface (#b9ffe8) that recurs as accent wash, pill background, and decorative envelope around product imagery. Typography carries the personality — a humanist serif (grenette) reserved exclusively for headlines at 46–60px, weight 400, giving the page a magazine-editorial authority, while the custom sans (mint) handles everything from 12px caption to 22px subheading with quiet consistency. The visual rhythm is open and breathable: centered hero, generous vertical gaps, then alternating white and tinted-mint sections with three-column feature steps. Decorative elements — participant name tags, conic rating rings, soft-pink and cream product cards — add warmth without ever competing with the dark teal action color. Nothing is loud; the teal button is the only thing on screen that pulses.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Teal | `#006e75` | Primary filled action buttons (Sign up, primary CTAs), active nav state, brand mark — the single chromatic command on every page |
| Ink | `#061d29` | Primary heading and body text — the dominant non-neutral color, carries 17:1 contrast on white, near-black with a cool cast |
| Midnight Teal | `#072626` | Alternate heading ink and dark surface text — sits beside Ink for inverse text on light tinted surfaces |
| Mist | `#425d6d` | Muted body text, outlined/secondary action borders, supporting links — the soft spoken gray-teal for secondary chrome |
| Hairline | `#e5e7eb` | Hairline borders, card outlines, image strokes, divider lines — the universal neutral separator at ~7,700 uses |
| Paper | `#ffffff` | Page canvas, button text on teal, card surfaces, nav background — the dominant light surface |
| Cream | `#fffded` | Warm-tinted card surface and section wash — a barely-there yellow that softens white without competing with mint |
| Mint Glass | `#b9ffe8` | Teal action color for filled buttons, selected navigation states, and focused conversion moments. |
| Bright Teal | `#0b978e` | Mid-tone teal for hover states, link fills, and accent strokes — sits between the deep brand teal and the mint surface |
| Plum | `#4d0037` | Decorative accent for illustration, icon fills, and tinted card washes — provides a warm counterpoint to the cool teal system |
| Blossom | `#ffc3e6` | Soft pink surface wash on product cards and decorative blocks — the third color in the tri-tone accent system (mint / cream / pink) |
| Ember Ring | `conic-gradient(rgb(255, 176, 164) 0deg, rgb(255, 73, 44) 0deg, rgb(255, 73, 44) 360deg)` | Orange decorative accent for icons, marks, and small graphic details |

## Typography

### grenette — Display and large headlines only — a custom humanist serif used at three distinct sizes, always weight 400, never bold. Its exclusive domain is the editorial hero and section openers; it never appears in body copy or UI chrome. Gives the site its magazine-research character.
- **Substitute:** Source Serif 4
- **Weights:** 400
- **Sizes:** 22px, 46px, 60px
- **Line height:** 1.05–1.20

### mint — The workhorse sans for everything else — body, nav, buttons, subheadings, captions, icons. Weight 400 is default; weight 500 for emphasized UI labels and button text. 26px is its ceiling; beyond that, grenette takes over.
- **Substitute:** Inter
- **Weights:** 400, 500
- **Sizes:** 12px, 13px, 14px, 15px, 16px, 18px, 20px, 22px, 26px
- **Line height:** 1.22–1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| body-lg | — | — | 18px | 1.5 | — |
| subheading | — | — | 20px | 1.25 | — |
| heading-sm | — | — | 22px | 1.22 | — |
| heading | — | — | 26px | 1.22 | — |
| heading-lg | — | — | 46px | 1.15 | — |
| display | — | — | 60px | 1.05 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 24px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 9999px
- **cards:** 24px
- **images:** 8px
- **inputs:** 8px
- **buttons:** 8px

## Components

### Primary Teal Button
**Role:** Filled CTA — the only high-saturation action element on the page

Background #006e75, text #ffffff, font mint 500 at 16px, padding 12px 24px, border-radius 8px, no shadow. Single line of text. This is the pulse of the design — only one should exist per viewport.

### Outlined Secondary Button
**Role:** Secondary action paired with the teal primary

Transparent background, border 1px #425d6d, text #425d6d, font mint 500 at 16px, padding 12px 24px, border-radius 8px. Used for 'Book a demo' and 'Explore the platform' — always lighter than the primary.

### Ghost Nav Button
**Role:** Top navigation utility actions (Log in)

Transparent background, no border, text #061d29 at 16px mint 400, padding 8px 16px. The lightest interaction in the nav strip.

### Green Pill Badge
**Role:** Pill-shaped highlight badge next to the logo

Background #b9ffe8, text #061d29, font mint 500 at 12-13px, padding 4px 12px, border-radius 9999px. The brand's signature decorative element — a mint pill that signals freshness and approachability.

### Logo Lockup
**Role:** Wordmark in the top-left corner

Text 'Lyssna' in mint font 500 at ~22px in Deep Teal #006e75, followed by a small mint-green leaf/sprig icon. The leaf is the only decorative glyph in the brand mark.

### Centered Hero Block
**Role:** First-screen headline and dual CTA

Centered column on white, max-width ~720px. Display headline in grenette 400 at 46-60px in #061d29. Subtext in mint 400 at 18px in #061d29 or Mist. Two buttons side by side: teal primary + outlined secondary. Optional microcopy line below in mint 400 14px.

### Numbered Step Card
**Role:** Three-column 'How it works' block

Number in a small circle (mint 500, 14px, 1px #061d29 border, ~28px diameter). Title in mint 500 at 18-20px in #061d29. Body in mint 400 at 15-16px in Mist #425d6d. No card background — the image above carries the color. Gap 24px between columns.

### Product Feature Card
**Role:** Decorative product screenshot block within step cards

Background uses one of the accent tints — mint #b9ffe8, cream #fffded, blossom #ffc3e6, or a conic gradient. Inner UI mockup on white #ffffff with 8px radius. Card itself has 24px radius. No border, no shadow.

### Participant Name Tag
**Role:** Floating annotation with directional pointer

Small pill, background Plum #4d0037, text #ffffff at 13px mint 500, padding 6px 12px, border-radius 9999px. A short triangular tail points toward the annotated element in a photo or screenshot. Adds editorial annotation flavor.

### Trust Logo Strip
**Role:** Row of partner/client wordmarks

Horizontal row of 5-7 monochrome logos on white, evenly spaced, each logo rendered in #061d29 at native proportions. No borders, no cards. 'Trusted by…' caption above in mint 400 14px Mist.

### Section Header
**Role:** Centered section title with optional subtext

Headline in grenette 400 at 46px in #061d29, centered. Optional subtext in mint 400 18px Mist, max-width ~560px, centered. No decorative element above the headline — whitespace is the divider.

### Rating Badge Row
**Role:** Social proof line with stars and platform logos

Star row (5 red/coral stars) + '4.5/5 rating' in mint 500 14px #061d29 + small monochrome platform icons (G, App Store, etc.) spaced 12px apart. No background, sits as a single line.

## Do's and Don'ts

### Do
- Use grenette (Source Serif 4) weight 400 exclusively for headlines 46px and above — never bold the serif, its weight is its character.
- Use #006e75 filled buttons for the single primary action on each page — the teal button is the design's only pulse point.
- Use #b9ffe8 as a section or card accent surface — the mint wash is the brand's signature and should appear at least once per page.
- Separate elements with 1px #e5e7eb hairline borders and color contrast, never with drop shadows.
- Use 8px radius for buttons, inputs, and small UI; 24px radius for cards, images, and large product surfaces.
- Center all hero and section content — Lyssna's layout is symmetric and column-based, not asymmetric.
- Use the tri-tone accent system (mint #b9ffe8, cream #fffded, pink #ffc3e6) for product card backgrounds, rotating through the three colors.

### Don't
- Never use a drop shadow as a primary elevation technique — the design is flat with hairline borders only.
- Never bold the grenette serif — it is weight 400 only; emphasis comes from size, not weight.
- Never place more than one #006e75 filled button in the same viewport — the teal action must be singular and unambiguous.
- Never use a chromatic border on a card or image — borders are always #e5e7eb hairline or absent.
- Never use grenette for body copy, captions, or UI chrome — it is a display face only, reserved for 46px+ headlines.
- Never left-align hero or section headlines — Lyssna is a centered, editorial layout throughout.
- Never use pure black (#000000) — the design's darkest tone is #061d29, a cool near-black that softens the contrast.

## Elevation

Lyssna deliberately avoids drop shadows as a design primitive. Separation between elements is achieved through flat color contrast (white card on mint surface, Ink text on white), 1px #e5e7eb hairline borders, and 24px corner radii. The result is a paper-like, print-editorial feel rather than a layered digital interface. When a shadow does appear (boxShadow on #ffffff in raw data), it is a single, near-invisible ambient lift — never a multi-layer Material-style stack.

## Surfaces

- **Canvas** (`#ffffff`) — Base page background — dominant surface
- **Cream Section** (`#fffded`) — Warm-tinted wash for alternating sections
- **Mint Section** (`#b9ffe8`) — Signature accent background — hero envelope, feature card surrounds, tag fills
- **Pink Card** (`#ffc3e6`) — Decorative product card surface — one of three accent washes
- **Card** (`#ffffff`) — Product screenshot cards, step content blocks — white on tinted background

## Imagery

Photography appears in floating product cards as soft, warm, lifestyle-oriented portraits of diverse people in natural-light settings — often cropped to a head-and-shoulders portrait with rounded corners (24px). The photos are not staged corporate headshots; they feel candid, varied in skin tone and setting. The dominant visual treatment is product UI screenshots rendered inside tinted pastel cards (mint, cream, pink), with the product UI itself in clean white. Conic gradient rings in coral/red serve as rating indicators. No illustration — everything is either photograph, product UI, or type. Icon style: line-based, 1.5px stroke, monochrome in Ink or Deep Teal, used sparingly (nav dropdowns, feature bullets, social proof icons).

## Layout

Lyssna is a centered, max-width 1200px layout on a white canvas. The hero is a single centered column (max-width ~720px) with serif headline + subtext + dual CTAs + social proof, no sidebar or split image. Below the hero, the page alternates between full-bleed white sections and mint-tinted bands, each section separated by 64–80px of vertical breathing room. Content arrangement is consistently centered — there are no asymmetric or left-aligned hero blocks. The three-column 'How it works' pattern is the page's signature grid, with 24px gaps between columns. The trust logo strip is a single horizontal row. Navigation is a minimal top bar: logo + 5 menu items centered, with login and sign-up actions flush right. No sidebar, no sticky header beyond the nav, no mega-menu. The rhythm is calm, vertical, and centered — closer to a long-form article than a product dashboard.

## Similar Brands

- **Maze** — Same user-research product space with a clean centered-hero, mint-and-cream pastel card system, and serif-free modern typography — though Lyssna adds a distinct editorial serif headline.
- **Hotjar** — Shared research-tool aesthetic with a single bright accent color (Hotjar's orange, Lyssna's teal) on a white canvas, rounded product cards, and a soft warm humanist tone.
- **Typeform** — Both lead with a large centered hero headline, use generous whitespace, and deploy one saturated action color against an otherwise neutral palette — same 'approachable research' posture.
- **Notion** — Similar flat-design ethos with hairline borders instead of shadows, centered content, and a quiet neutral base that lets a single accent color do the work.
- **Substack** — Shared editorial sensibility — a serif display face for headlines, centered column layout, warm cream and soft accent surfaces, and an overall journal-like reading rhythm.
