# Tilda — Style Reference
> Paper sketchbook with coral crayon

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Tilda operates on a near-monochrome canvas with a single vivid coral accent doing all the emotional work. The aesthetic is editorial-illustration-meets-builder-tool: flat, hand-drawn line art fills the left side of heroes, generous whitespace breathes around light-weight headlines, and one orange-coral button is the only spot of color in an otherwise achromatic interface. Typography carries the personality — TildaSans at weight 300 whispers across 60-78px hero headlines, while the coral accent is rationed for primary actions, illustration fills, and icon highlights. Components are confident and pill-shaped: 100px radius buttons, flat surfaces with no shadows, thin black borders instead of elevation. The system should feel like a design magazine that accidentally became a product page.

## Colors

| Name | Value | Role |
|------|-------|------|
| Coral Signal | `#fa8669` | Orange supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Ink Black | `#000000` | Primary text, button strokes, dark mode contrast pairs, icon outlines |
| Carbon | `#222222` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Graphite Deep | `#171717` | Dark surface blocks, footer regions, inverted section backgrounds |
| Plum Ink | `#2a2a2a` | Secondary dark surface, hover states on dark backgrounds |
| Smoke | `#7f7f7f` | Muted helper text, placeholder text, disabled icon outlines |
| Silver | `#cccccc` | Button hover backgrounds, disabled controls, subtle surface tints |
| Bone | `#efefef` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Paper White | `#ffffff` | Page canvas, card elevation, button text on dark fills, content surface |

## Typography

### Times — Times — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 16px
- **Line height:** 1.2

### TildaSans — Primary brand typeface for all interface text — display headlines at 60-78px use weight 300 (whisper-weight creates editorial calm), section headings at 34-48px use weight 400, body sits at 16-20px weight 400, micro-labels and nav use weight 500-600. The wide weight range (100-700) and tracking ladder allow the same family to serve everything from super-light hero whispers to crisp button labels.
- **Substitute:** Inter, Manrope, or DM Sans
- **Weights:** 100, 300, 400, 500, 600, 700
- **Sizes:** 13, 14, 15, 16, 18, 19, 20, 22, 24, 26, 28, 34, 36, 42, 44, 46, 48, 60, 72, 78
- **Line height:** 1.13-2.00
- **Letter spacing:** 0.0380em, 0.0630em, 0.0710em, 0.1790em

### Arial — System fallback for small UI metadata, icon labels, and micro-text where TildaSans might not load
- **Substitute:** system-ui
- **Weights:** 100, 300, 400, 500
- **Sizes:** 11, 13, 14
- **Line height:** 1.20, 2.00

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.4 | 0.071px |
| body-sm | — | — | 15px | 1.45 | — |
| subheading | — | — | 20px | 1.45 | — |
| heading-sm | — | — | 24px | 1.4 | — |
| heading | — | — | 34px | 1.35 | 0.038px |
| heading-lg | — | — | 48px | 1.23 | — |
| display | — | — | 72px | 1.17 | 0.063px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96-120px
- **Card padding:** 32-48px
- **Element gap:** 16-24px

### Border Radius

- **tags:** 100px
- **cards:** 0px
- **images:** 0px
- **inputs:** 100px
- **buttons:** 100px

## Components

### Coral Primary Button
**Role:** The single most important interactive element — the only chromatic button in the system

Filled pill button, #fa8669 background, #ffffff text, 100px border-radius, 14-16px vertical padding, 28-32px horizontal padding, TildaSans weight 500-600 at 14-16px. Used for 'Create a website for free' and all primary conversion actions.

### Ghost Outline Button
**Role:** Secondary action paired with the coral CTA

Transparent or #ffffff background, 1px #000000 border, #000000 text, 100px radius, 14px 28px padding, TildaSans weight 500 at 14-16px. Pairs alongside the coral CTA as the lower-commitment option ('Overview').

### Inverted Dark Button
**Role:** Account/auth actions in navigation

Solid #000000 or #222222 background, #ffffff text, 100px radius, 10px 20px padding, TildaSans weight 500 at 14px. Used for 'Sign Up' and 'Log In' in the top nav to contrast against ghost/primary buttons.

### Top Navigation Bar
**Role:** Persistent site navigation

White background, #ffffff, 1px #efefef or transparent bottom border, horizontally aligned with brand wordmark left and nav links right. Nav links in TildaSans 14px weight 500, #000000. Height ~60px, max-width 1200px centered with 24-32px horizontal padding.

### Hero Split Section
**Role:** Above-the-fold introduction

Two-column layout at 1200px max-width: left column holds flat illustration (black line art with coral fills), right column holds TildaSans 48-60px weight 300 headline, 16-18px weight 400 subtext in #222222, and CTA pair. Section gap 96-120px from nav and from next section.

### Centered Editorial Section
**Role:** Narrative content between features

Centered stack within 1200px max-width: eyebrow label in TildaSans 13px weight 500 with 0.071em tracking, 48-60px weight 300 headline, 18-20px body paragraph in #222222 at max-width ~600px. No background change — pure white.

### Feature Card
**Role:** Product feature presentation

Flat #ffffff or #efefef surface, no border, no shadow, 32-48px padding. Contains illustration left and copy right. Corner radius is 0 — cards are sharp-edged to contrast with pill buttons. Often uses a thin black rule beneath.

### Brand Illustration Block
**Role:** Atmospheric visual identity

Full-height illustration on white or #efefef background. Black line art at 1.5-2px stroke weight, with selective coral (#fa8669) fills on key objects (hearts, characters' clothing, icons). No gradients, no shadows — pure flat graphic style.

### Pill Badge / Tag
**Role:** Category labels, section eyebrows, metadata

100px radius, 4px 12px padding, TildaSans 13px weight 500 with 0.071em tracking. Background #efefef with #000000 text, or #000000 with #ffffff text. All-caps or sentence case.

### Hairline Divider
**Role:** Section separation without visual weight

1px #efefef or #cccccc horizontal line spanning the content width. Used instead of background color changes to separate sections while maintaining the all-white feel.

### Footer Region
**Role:** Site footer with links and legal

#ffffff or #171717 background, TildaSans 14-16px weight 400 text. Links at weight 500, #000000 or #ffffff depending on background. 96px top padding, generous link spacing via 20-24px row gap.

### Language Selector
**Role:** Locale picker, bottom-right floating

Fixed-position pill in bottom-right, 100px radius, white background with 1px #efefef border, TildaSans 13px weight 500. Globe icon + language code.

## Do's and Don'ts

### Do
- Use 100px border-radius on all buttons, tags, badges, and language selectors — pill shape is the signature component geometry
- Use TildaSans weight 300 for all headlines 48px and above; let the large size and light weight carry the editorial calm
- Use #fa8669 sparingly — reserve for primary CTAs, illustration accents, and key icons; never for body text or borders
- Default to #ffffff canvas; use #efefef only for distinct card surfaces or section breaks
- Use 1px solid #efefef or #000000 borders for component separation instead of box-shadows
- Keep illustrations flat with 1.5-2px black line work and selective coral fills — no gradients, no dimension
- Maintain 96-120px section gaps to preserve the breathing, magazine-like vertical rhythm

### Don't
- Don't add box-shadows to any component — flat surfaces and hairline borders are the elevation language
- Don't use #fa8669 for non-CTA elements: no coral borders, no coral body text, no coral card backgrounds
- Don't set border-radius below 100px on buttons or tags — sharp or moderately rounded buttons break the pill system
- Don't use weight 600+ for headlines — the whisper-weight contrast at 300-400 is the typographic signature
- Don't introduce additional accent colors; the monochrome + coral binary is the entire palette
- Don't apply heavy backgrounds to body sections — keep the dominant experience white/achromatic
- Don't use gradient fills on illustrations or backgrounds — flat color is mandatory

## Elevation

No shadows. The design system uses flat surfaces distinguished only by background color (white vs #efefef vs #cccccc) and 1px hairline borders. Elevation is communicated through spatial separation and surface tone, not shadow. This is a deliberate editorial choice — shadows would feel too 'SaaS dashboard' and undermine the magazine-like, hand-drawn aesthetic.

## Surfaces

- **Paper White** (`#ffffff`) — Page canvas, content backdrop
- **Bone** (`#efefef`) — Card surface, secondary section backgrounds, ghost button fill
- **Silver** (`#cccccc`) — Hover state, disabled surface
- **Carbon** (`#222222`) — Inverted section, dark surface block

## Imagery

Hand-drawn flat illustrations dominate the visual language: black line art at 1.5-2px stroke weight with selective coral (#fa8669) fills on focal elements (hearts, character clothing, key objects). The illustration style is editorial and slightly whimsical — characters with simplified proportions, floating UI elements, dotted halftone textures. Illustrations are always contained, never full-bleed, and sit on the left side of hero/feature splits. No photography. No 3D renders. No gradients. The visual hierarchy relies on the contrast between the minimal coral-and-white UI and the busier illustrated moments.

## Layout

Max-width 1200px centered container with 24-32px horizontal padding. Hero follows a split pattern: 50/50 illustration-left + text-right, with the coral CTA and ghost button stacked horizontally. Subsequent sections alternate between centered editorial stacks (eyebrow → headline → paragraph) and split feature blocks (illustration-left, text-right). Sections are separated by 96-120px vertical gaps on a continuous white canvas. No alternating dark/light bands — the page stays achromatic throughout, with #efefef reserved for card surfaces and #171717 only in the footer. Navigation is a minimal top bar: brand left, links right, no mega-menu.

## Similar Brands

- **Webflow** — Same no-code builder category, similar split-hero layout with illustration left + text right, pill-shaped CTAs, and light-weight display headlines
- **Squarespace** — Editorial typography-first approach with extra-large light-weight headlines on white canvas, single accent color rationed for CTAs
- **Framer** — Near-monochrome interface with one bold accent color, large display type, and illustration-driven hero sections
- **Notion** — Flat surfaces, no shadows, hairline dividers as the primary separation mechanism, generous whitespace
- **Figma** — Pill-shaped buttons with high border-radius, flat card surfaces, editorial weight contrast between display and body text
