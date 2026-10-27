# Tedy — Style Reference
> Marshmallow world with a raspberry pulse — pastel surface washes on white, one hot pink doing all the urgent work.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Tedy operates in a soft pastel universe built on one disciplined trick: a near-white canvas flooded with candy-colored surface washes (lavender, mint, butter, sky) and a single hot raspberry (#fd1774) doing all the urgent work. The pink is the only saturated color in the entire system — every CTA, every action surface, every tension point comes from that one hue, with a signature raspberry-tinted shadow extending 18px below it. Typography is where the system gets unexpectedly loud: Montreal Neue hits 104px at line-height 0.90 with tracking pulled to -6.5%, producing poster-etched density that contradicts the soft surroundings — headlines are set almost on top of themselves. Radii are uniformly generous (32px on cards, 999px on buttons, nothing sharp anywhere), and the atmosphere is amplified by colored radial-gradient glows that make the white space feel lit rather than empty.

## Colors

| Name | Value | Role |
|------|-------|------|
| Raspberry Pulse | `#fd1774` | Primary CTA fill, active states, colored shadow accents — the sole saturated hue in the system, creating urgency against matte pastels |
| Ink Black | `#030712` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. Do not promote it to the primary CTA color |
| Lavender Mist | `linear-gradient(to top, rgb(231, 214, 255) 0%, oklab(0.902604 0.0325668 -0.0481643 / 0.85) 50%, rgba(0, 0, 0, 0) 100%)` | Hero card background, testimonial card wash, section surface — the dominant pastel; Hero gradient base — soft lavender fading downward into white; Composite atmospheric glow — purple/pink/teal/amber radial halos blending on white canvas |
| Mint Cream | `#e3f7d6` | Feature card surface, success-tinted badges, body wash — pastel green for nature/wellness cues |
| Butter Cream | `#fff1cd` | Warning-tinted badges, warm section wash, pill highlights |
| Sky Wash | `#ddf5fb` | Soft section background, alternate surface, and quiet card fill |
| Sand Wash | `#f4efe9` | Warm neutral section surface, cream card backgrounds |
| Carbon | `#171717` | Dark elevated surface for cards, headers, and contained panels. Do not promote it to the primary CTA color |
| Steel | `#6b7280` | Muted body text, secondary borders, de-emphasized labels |
| Silver | `#e5e7eb` | Hairline dividers, ghost button borders, list separators |
| Pure White | `#ffffff` | Page canvas, card surfaces, button text, ghost button fill |
| Lime Zest | `#64d71e` | Green decorative accent for icons, marks, and small graphic details. Use as a supporting accent, not as a status color |
| Teal Current | `#4bb7cf` | Blue decorative accent for icons, marks, and small graphic details. Use as a supporting accent, not as a status color |

## Typography

### Montreal Neue — Sole interface typeface. Weight 500 for nav, buttons, and emphasis; weight 400 for body. Display sizes (56–104px) use line-heights under 1.0 (0.90–0.98) with aggressive negative tracking (-0.025em to -0.065em) — this is the system's signature move. Body sizes (14–23px) sit at 1.38–1.50 line-height with minimal tracking. The contrast between poster-tight headlines and airy body copy is the rhythm.
- **Substitute:** Inter (free) or General Sans (Fontshare) — pick Inter for accessibility, General Sans for closer geometric match to Montreal Neue's round forms
- **Weights:** 400, 500
- **Sizes:** 14px, 15px, 16px, 17px, 19px, 23px, 28px, 56px, 59px, 61px, 64px, 70px, 80px, 85px, 86px, 104px
- **Line height:** 0.90 – 1.50
- **Letter spacing:** -0.065em at 104px → -0.005em at 16px, scaling with size
- **OpenType features:** `"ss01" on`

### Georgia — Sporadic decorative serif used in one card context — appears to break the sans-only system intentionally, possibly for a quoted/styled statistic. Treat as accent-only, never body.
- **Substitute:** Source Serif Pro (free)
- **Weights:** 700
- **Sizes:** 80px
- **Line height:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.45 | -0.07px |
| body-sm | — | — | 16px | 1.5 | -0.08px |
| subheading | — | — | 23px | 1.38 | -0.12px |
| heading-sm | — | — | 28px | 1.05 | -0.56px |
| heading | — | — | 56px | 0.98 | -1.4px |
| heading-lg | — | — | 64px | 0.96 | -2.56px |
| display | — | — | 80px | 0.92 | -4px |
| display-xl | — | — | 104px | 0.9 | -6.76px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **cards:** 32px
- **badges:** 32px
- **images:** 24px
- **buttons:** 999px
- **nav-pills:** 999px
- **small-cards:** 16px
- **feature-cards:** 20px

## Components

### Primary CTA Button
**Role:** Filled pill button for the main conversion action

Raspberry Pulse (#fd1774) fill, white text, 999px radius, 14px 24px padding, Montreal Neue 16px weight 500. Carries the signature colored shadow rgba(253, 23, 116, 0.6) 0px 14px 35px -18px. Use for 'Book a demo' and any single highest-priority action per screen.

### Ghost Button
**Role:** Secondary action surface

Pure white fill with Ink Black (#030712) text, 1px Silver (#e5e7eb) border, 999px radius, 14px 24px padding, 16px weight 500. Pairs beside the primary CTA. The 'Discover Tedy' variant in the hero adds a small circular icon with a Raspberry border before the label.

### Auth Button
**Role:** Account/sign-in action

Carbon (#171717) fill, white text, 999px radius, 14px 24px padding. Visually distinct from the pink CTA so users never confuse 'book a demo' with 'sign in'.

### Navigation Bar
**Role:** Top-level site navigation

White background, full-width, 18px vertical padding, 1200px max-width centered content. Logo left, nav links center (text-only with dropdown chevrons), utility controls right: language pill (EN/ON) in a white outlined pill, then primary CTA, then auth button. Nav items are 16px Montreal Neue weight 500, Ink Black.

### Hero Card
**Role:** Hero left column with headline and CTAs

Lavender Mist (#e5d6ff) fill, 32px radius, 40-48px padding, contains display-xl headline (104px, lh 0.90, tracking -0.065em), body subtext, and CTA pair stacked vertically. The lavender card is the page's most visually dominant surface.

### Photo Collage
**Role:** Hero right column image grid

2x2 grid of lifestyle photos (candid, joyful people), each image cropped with 24px radius, with 8-12px gaps. The bottom-left image overlaps slightly into the lavender card area to create depth.

### Pastel Feature Card
**Role:** Product feature explanation surface

White inner card sitting on a colored background (lavender, mint, butter, or sky), 16-20px radius, 24px padding. Contains icon container + heading + body. The card-to-background contrast is the entire visual effect — no shadow needed, just the color difference.

### Floating Product Mockup
**Role:** Screenshot/dashboard preview card

White card with a large browser-frame mockup, 32px+ radius (up to 44-48px on hero-class cards), sits on a pastel background. Carries the dramatic dark shadow stack (rgba(0,0,0,0.35) 0px 30px 80px 0px) — the most elevated element in the system. One per feature section.

### Icon Container
**Role:** Category/feature icon wrapper

Small rounded square (12-16px radius) with a pastel fill (mint, lavender, sky, butter), 24-32px padding, contains a simple line icon. Used inside feature cards and category selectors.

### Pill Badge
**Role:** Inline tag, status, or highlight

Pastel fill (mint, butter, sky, lavender) with a 1px border in the same hue family, 32px radius, 8px 14px padding, 14px Montreal Neue weight 500 Ink Black text. The outline-border treatment makes badges feel like stickers rather than blocks.

### Category Selector Card
**Role:** Multi-choice benefits category picker

White card on a pastel surface, 16px radius, 24px padding, contains a 3-column grid of icon containers. Each icon container holds a category icon (pet, health, travel, etc.) with a label below.

### Testimonial Card
**Role:** Customer quote with photo

Lavender Mist fill, 32-44px radius, split layout: left ~40% contains pull-quote text (large quote mark glyph, body copy, attribution), right ~60% contains a large candid portrait photo with 24px radius that breaks the card's right edge slightly. The photo extends beyond the card to create a 'peek' effect.

### Trust Logo Bar
**Role:** Social proof strip

White background, single row of 6-8 customer logos in grayscale, evenly distributed with generous horizontal spacing. No logo card backgrounds — logos sit directly on white. Sits between hero and first content section.

### Stat Highlight Card
**Role:** Dashboard preview stat

White card on a pastel background with a semi-circular gauge chart and metric list. Small inline pills ('You have X', 'Average impact: 680 days') use mint or butter pastel fills with 32px radius — mini version of the Pill Badge.

### Section Divider
**Role:** Visual break between content bands

No hard divider — sections are separated by switching pastel surface color and 80px vertical gap. The white-to-pastel-to-white rhythm is the divider.

## Do's and Don'ts

### Do
- Set headlines at 56px+ with line-height under 1.0 and tracking between -0.025em and -0.065em — this is the system's signature typographic move
- Use Raspberry Pulse (#fd1774) exclusively for primary CTA fills and its companion shadow — never apply it to text, icons, or decorative elements
- Apply 32px radius to all cards, images, and badges; 999px to all buttons and nav pills — no sharp corners anywhere
- Let body copy breathe at 17px / line-height 1.43 with minimal tracking (-0.005em) — the contrast between airy body and tight headlines is the rhythm
- Layer pastel surface washes (lavender, mint, butter, sky) behind white cards to create section hierarchy without shadows
- Center content at 1200px max-width with 80px section gaps — spaciousness is part of the brand
- Use Montreal Neue weight 500 for nav, buttons, and labels; weight 400 for body and descriptive text
- Place the colored radial-gradient ambient glow on the hero and key feature areas to make white space feel lit

### Don't
- Don't introduce a second saturated color — the entire accent system hinges on Raspberry Pulse being the only hot hue
- Don't set body text at display tracking (-0.04em or tighter) — tracking must scale with size
- Don't use sharp 0-4px corner radii on cards or images — the system is uniformly round
- Don't apply the Raspberry Pulse shadow to non-CTA elements — the colored shadow is reserved for the primary action
- Don't use dark UI surfaces except for the auth button and intentional dark cards — light mode is structural
- Don't set display type with line-height above 1.05 — the poster-tight stacking is essential
- Don't add new fonts — Montreal Neue carries the system; Georgia is a one-off accent only
- Don't use borders where a color contrast would work — the pastel-on-white relationship is cleaner than hairlines
- Don't set display sizes below 56px when the text is a true headline — the scale jumps are intentional

## Elevation

- **Primary CTA Button:** `rgba(253, 23, 116, 0.6) 0px 14px 35px -18px`
- **Floating Product Mockup Card:** `inset rgba(255, 255, 255, 0.08) 0px 1px 0px 0px, inset rgba(255, 255, 255, 0.03) 0px -1px 0px 0px, rgba(0, 0, 0, 0.35) 0px 30px 80px 0px`
- **Generic Elevated Element:** `rgba(17, 24, 39, 0.16) 0px 28px 52px 0px`
- **Badge Outline:** `rgb(255, 241, 205) 0px 0px 0px 1px`

## Surfaces

- **Page Canvas** (`#ffffff`) — Default page background — pure white
- **Lavender Surface** (`#e5d6ff`) — Hero and testimonial card backgrounds
- **Mint Surface** (`#e3f7d6`) — Feature card backgrounds, body washes
- **Butter Surface** (`#fff1cd`) — Warm section washes, warning-tinted cards
- **Sky Surface** (`#ddf5fb`) — Cool section washes, info backgrounds
- **Sand Surface** (`#f4efe9`) — Warm cream card backgrounds
- **Card Surface** (`#ffffff`) — White cards sitting on pastel washes
- **Dark Surface** (`#171717`) — Auth buttons, dark image overlays

## Imagery

Photography dominates the visual system: candid, high-key lifestyle shots of diverse young adults laughing, working, and connecting — never staged corporate portraits. Images are tightly cropped, warm-toned, and arranged in 2x2 collages or as large breakout portraits that slightly exceed their card edges. Treatment is rounded (24px radius), never full-bleed, and the warm color grading harmonizes with the pastel surface washes. No illustrations, no abstract graphics, no product screenshots-as-marketing — when product UI appears, it sits inside a floating mockup card with a dramatic shadow. Iconography is line-based and minimal, living inside pastel rounded-square containers. Photography is the emotional engine; UI is the logic.

## Layout

Page model is max-width 1200px centered with generous side padding. The hero is a two-column split: lavender text card left (≈45% width) with a 2x2 photo collage right (≈55%), the bottom-left photo slightly overlapping the card to break the grid. Below the hero sits a single-row trust logo bar on white. Content sections alternate between pastel-wash backgrounds and white, each section using a 2-column layout (text left, floating mockup right) or single-column centered. Cards inside sections use white-on-pastel contrast rather than borders. Vertical rhythm is spacious — 80px between sections, 24px inside cards, 16px between elements. Navigation is a top white bar with pill-shaped utility controls; no sticky/sidebar patterns. The overall flow is: hero → trust → alternating feature bands (3-4 sections) → testimonial → footer.

## Similar Brands

- **Headspace** — Same pastel-surface-on-white rhythm, soft rounded geometry, and warm candied color palette that signals wellness and care
- **Maven** — Similar pill-shaped buttons, generous 32px+ card radii, and a single accent color used with restraint against soft backgrounds
- **Linear** — Comparable typographic confidence — display sizes set with tight tracking and near-zero line-height to create density against airy surroundings
- **Notion** — Shares the minimalist white canvas with selective pastel washes, pill controls, and the discipline of one typeface doing everything
- **Wispr Flow** — Same approach to hero composition — pastel text card on one side, candid photo collage on the other, with the same warm/friendly tone
