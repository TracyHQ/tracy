# Mockups made easy — Style Reference
> Editorial design studio on white paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Maneken's visual system is gallery-first: a near-white canvas lets photographic mockup work dominate while a single saturated blue acts as the only chromatic voice in the interface. Typography does the heavy lifting — a custom display face (TWKEverett) towers over the page in oversized 77–110px headlines with tight 1.0–1.2 leading, creating an editorial magazine feel rather than a typical SaaS dashboard. Inter handles everything functional at compact 14–18px sizes, creating a deliberate tension between theatrical display type and utilitarian UI. Surfaces stay flat with 10px radii, borders lean heavily on pure black hairlines, and elevation is reserved for the image content itself via soft, multi-layer drop shadows.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Blue | `#0050b7` | Primary action buttons, logo dot accent, active nav strokes — the only chromatic color in the system creates unmistakable focus against the monochrome frame |
| Ink | `#000000` | Primary text, icon fills, hairline borders, image outlines — true black anchors the monochrome structure with maximum contrast (21:1 on white) |
| Paper | `#ffffff` | Card surfaces, button text on dark, image backgrounds — the bright surface that makes photographic content pop |
| Carbon | `#10151c` | Dark surface backgrounds, body text on light cards, nav bar fills — near-black with a barely-perceptible blue undertone that warms the deep neutral |
| Fog | `#f4f4f4` | Page canvas background, hero section fill, soft card surfaces — the warm off-white that separates page chrome from white content cards |
| Ash | `#eaeaea` | Hairline dividers, subtle section borders, input outlines — sits between fog and white for the gentlest structural separation |
| Graphite | `#86868b` | Muted subheadings, secondary metadata, heading accents — the mid-gray that steps text down without going fully gray |
| Graphite Smoke | `#3e3e3e` | Alternate button background, dark UI surface variant — a warm dark gray for secondary filled actions when blue is too prominent |
| Stone | `#a6a6a6` | Nav background overlays, tertiary surface tint — lightest functional gray for layering context |

## Typography

### Inter — All UI chrome: navigation, buttons, body text, card labels, footer, links, inputs, icons. Weight 800 for the MANEKEN wordmark and key emphasis; weight 500 for nav items; weight 400 as the UI default. The 200px instance is a decorative oversized treatment, not a working type size.
- **Substitute:** system-ui or -apple-system as fallback
- **Weights:** 400, 500, 600, 800
- **Sizes:** 10px, 14px, 15px, 18px, 24px, 28px, 40px, 200px
- **Line height:** 1.00, 1.20, 1.25, 1.40
- **Letter spacing:** normal

### TWKEverett — Display headlines and hero copy at 55–110px with near-zero leading (1.0–1.1). The custom serif-grotesque hybrid gives the page editorial weight — headlines behave like magazine covers, not SaaS cards. Used at 22–28px for lead paragraphs where Inter would feel too neutral.
- **Substitute:** GT Sectra, Recoleta, or Tiempos Headline
- **Weights:** 400, 500
- **Sizes:** 16px, 22px, 24px, 28px, 55px, 60px, 77px, 110px
- **Line height:** 1.00, 1.10, 1.20, 1.45
- **Letter spacing:** normal (no tracking adjustment — the tight sizes and condensed letterforms provide their own density)

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400, 500
- **Sizes:** 13px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | — |
| body-sm | — | — | 14px | 1.4 | — |
| body-lg | — | — | 18px | 1.4 | — |
| subheading | — | — | 22px | 1.2 | — |
| heading-sm | — | — | 28px | 1.2 | — |
| heading | — | — | 40px | 1.25 | — |
| heading-lg | — | — | 55px | 1.1 | — |
| display | — | — | 77px | 1 | — |
| display-xl | — | — | 110px | 1 | — |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 10px

### Border Radius

- **hero:** 15px
- **cards:** 10px
- **icons:** 3px
- **pills:** 100px
- **images:** 10px
- **buttons:** 10px

## Components

### Primary Action Button
**Role:** Filled CTA — single chromatic anchor for conversion moments

Background #0050b7, white text (#ffffff), Inter weight 500 at 15px. Padding 10px 20px. Border-radius 10px. No border, no shadow. Suffix arrow character (→) in same white. This is the only filled chromatic button in the system — use sparingly to preserve its signal value.

### Secondary Outline Button
**Role:** Ghost/outline variant for less emphatic CTAs

Transparent background, 1px solid #000000 border, black text Inter weight 500 at 15px. Padding 10px 20px. Border-radius 10px. Used when the primary blue button already exists on the page and a second action is needed.

### Navigation Link
**Role:** Top nav menu items

Inter weight 500 at 15px, color #000000, no underline. Horizontal padding 6–10px. Spacing between nav items 18–20px. Active state not visually decorated — relies on context.

### Logo Lockup
**Role:** Brand mark in header

"MANEKEN" set in Inter weight 800, all caps, tightly tracked, color #000000. Followed by a 4px solid #0050b7 circular dot at baseline level. The blue dot is the only chromatic mark in the wordmark.

### Display Headline
**Role:** Hero and section titles — the page's signature type moment

TWKEverett weight 400 at 77–110px, line-height 1.0, color #000000. Two-line stacks are common ("Mockups / made easy"). The first line carries the noun, the second the verb — creates a reading pause. No italic, no gradient, no decoration.

### Section Subtitle
**Role:** Supporting line under a display headline

Inter weight 400 at 18–24px, color #86868b or #000000, centered, max-width ~600px. Tightens the relationship between hero headline and CTA below.

### Mockup Image Card
**Role:** Gallery tiles showing creator output

Full-bleed photographic image, no padding inside, 10px border-radius, 1px solid #000000 border. Layered soft drop shadow: rgba(0,0,0,0.01) 0px 90px 40px, rgba(0,0,0,0.05) 0px 50px 30px, rgba(0,0,0,0.09) 0px 20px 20px, rgba(0,0,0,0.1) 0px 6px 10px. Shadow is wide and gentle, not sharp — it lifts images off the canvas without theatrical depth.

### Creator Profile Card
**Role:** Image with creator attribution overlay

Same 10px radius and border as the image card. Attribution row sits below or overlays the bottom: small Inter 14px label with a 20px circular avatar (or pill). No box shadow on the card itself — shadow only on the image.

### Section Header Block
**Role:** Centered text block introducing a gallery or feature section

Display headline (TWKEverett 40–60px) + subtitle (Inter 18px #86868b) + optional primary CTA button, all centered. 80px vertical padding above and below. The block creates a clear breath between visual galleries.

### Cookie Consent Banner
**Role:** Bottom-left dismissible notice

White (#ffffff) background, 10px border-radius, subtle 1px border. Two-line body text (Inter 14px black) + filled black "Okay" button (Inter 500 white text, 10px radius). Fixed to bottom-left with ~16px margin from viewport edge.

### Top Navigation Bar
**Role:** Sticky/fixed site header

White (#ffffff) or transparent background, no border in scrolled state, full-width with centered nav links. Logo flush left, auth actions flush right ("Log in" text + filled blue "Sign up" button). Nav items horizontally centered as a group. Min-height ~56px.

## Do's and Don'ts

### Do
- Use TWKEverett at 77–110px with line-height 1.0 for hero and section display headlines — its tight leading is the signature of the page
- Reserve #0050b7 Signal Blue for primary action buttons, the logo dot, and active states only; never use it for body text, icons, or decorative borders
- Apply 10px border-radius to all cards, buttons, images, and interactive surfaces as the universal corner language
- Layer the four-stop soft drop shadow stack on photographic image cards to lift them off the #f4f4f4 canvas
- Set Inter body text at 14–18px weight 400–500 — the UI voice is compact and functional, never theatrical
- Use #000000 for hairlines, icons, and text — true black at 1px provides the structural skeleton of the layout
- Keep section gaps at 80px to create editorial breathing room between content bands

### Don't
- Don't introduce additional accent colors — the system is monochromatic plus one blue; a second hue breaks the signal
- Don't use sharp, high-alpha shadows on UI elements — soft, low-alpha, large-radius shadows are reserved for photographic content only
- Don't set display headlines in Inter — TWKEverett is the only face permitted above 40px; using Inter at 77px flattens the editorial moment
- Don't use filled blue buttons for secondary actions; ghost/outline (#000000 border) preserves the blue's scarcity
- Don't add gradients, glows, or glassmorphism — the system is flat with single-layer surfaces
- Don't reduce border-radius below 10px for primary surfaces; the 10px corner is the system baseline, not 8px or 6px
- Don't use color for information hierarchy — rely on type weight, size, and the #86868b Graphite step to step text down, not chromatic variation

## Elevation

- **Image Card:** `rgba(0, 0, 0, 0.01) 0px 90px 40px 0px, rgba(0, 0, 0, 0.05) 0px 50px 30px 0px, rgba(0, 0, 0, 0.09) 0px 20px 20px 0px, rgba(0, 0, 0, 0.1) 0px 6px 10px 0px`
- **Elevated Card:** `rgba(0, 0, 0, 0.01) 0px 550px 220px 0px, rgba(0, 0, 0, 0.05) 0px 310px 190px 0px, rgba(0, 0, 0, 0.09) 0px 140px 140px 0px, rgba(0, 0, 0, 0.1) 0px 35px 75px 0px`

## Surfaces

- **Canvas** (`#f4f4f4`) — Page background — warm off-white that distinguishes chrome from content
- **Card** (`#ffffff`) — Content surfaces, image cards, navigation bar, modals
- **Dark Surface** (`#10151c`) — Dark mode cards, dark section backgrounds, near-black text on light cards

## Imagery

Photography is the product. Every section beyond the hero is a dense image grid showing mockup output on real-world surfaces — coffee cups, tote bags, billboards, laptops, signage, apparel, packaging. Images are tightly cropped on their subjects with no lifestyle staging, no stock photography warmth. The grid uses 4–5 columns at desktop width with 8–10px gaps so tiles feel like a contact sheet rather than a card gallery. Images carry a 1px black border plus the four-layer soft shadow, which is the only border treatment in the system. There is no illustration, no abstract graphic, no product screenshot of the editor itself in the visible surface — the mockups ARE the product story.

## Layout

Full-bleed page canvas in #f4f4f4 with content centered at a max-width of ~1200px. The hero is a centered text stack: massive two-line display headline, single-line Inter subtitle, and one filled blue CTA — no hero image, no side-by-side split. Below the hero, the page alternates between a full-bleed edge-to-edge image grid and centered section header blocks. The first gallery shows 4 columns of tightly packed mockup tiles with minimal gap; later sections use 4-column creator cards with attribution. Navigation is a fixed top bar with centered links, logo flush left, auth actions flush right. Section rhythm is generous: 80px vertical padding separates every band. The overall page reads top-to-bottom as headline → gallery → headline → gallery, like an editorial portfolio rather than a feature checklist.

## Similar Brands

- **Linear** — Same monochrome-first approach with a single saturated blue accent on an off-white canvas; both use compact Inter-based UI type paired with oversized display moments
- **Framer** — Editorial gallery-driven landing page with image grids as the primary content surface, tight spacing, and restrained chromatic palette
- **Read.cv** — Magazine-style layout rhythm with centered text stacks, large editorial headlines, and dense image grids below the fold
- **Are.na** — Quiet, white-canvas design tool aesthetic that lets user-generated visual content dominate while chrome stays minimal and functional
