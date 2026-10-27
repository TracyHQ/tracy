# 10X HUB — Style Reference
> ink and ember poster wall

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

10X Hub operates as a high-contrast editorial system built on pure black, pure white, and a single vivid red (#ff1841) that acts as both accent and full section background. The design is deliberately raw and unembellished — massive unweighted typography dominates the hero, controls reduce to pill shapes or hairline underlines, and there is no shadow language or surface elevation to soften edges. The page reads as a brutalist poster: sections alternate between ink-black voids and coral-red fields, with the white canvas peeking through for form areas and body content. Every interface element is stripped to its minimum viable form — a border, a radius of 999px, a single fill color — so the visual weight stays on the words and the red interruption.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ember Red | `#ff1841` | Red supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Bloodline | `#7b0016` | Decorative dark red stroke, link hover states, secondary accent where a deeper red register is needed against white |
| Obsidian | `#000000` | Hero section background, primary body text, icon strokes, input field text — the structural darkness |
| Paper White | `#ffffff` | Page canvas base, text on dark backgrounds, input field backgrounds |
| Ash | `#e8e6e6` | Card surfaces, subtle section backgrounds, hairline divider highlights on dark |
| Steel | `#949494` | Muted borders, inactive control outlines, secondary dividers |
| Charcoal | `#212121` | Deep surface layer — elevated panels, dark card backgrounds behind red sections |
| Fog | `#bebcbc` | Light border variant for input fields on white, subtle structural lines |
| Mist | `#c7c7c7` | Disabled control borders, tertiary structural lines |

## Typography

### Arial — Micro UI text — toggle labels, badge text, button micro-copy, fine print; Arial's universality here is deliberate, keeping tiny text neutral and system-native
- **Substitute:** system-ui, Arial, Helvetica
- **Weights:** 400
- **Sizes:** 10px, 13px
- **Line height:** 1.20
- **Letter spacing:** normal

### 10X Display (custom — madefor-text variant) — Hero display headline — the massive '10X HUB' wordmark and large section openers; weight 400 at near-300px with letter-spacing -0.064em creates a poster-scale compression that fills the viewport edge-to-edge
- **Substitute:** Druk Wide, Inter Black, or system sans at the same size
- **Weights:** 400
- **Sizes:** 187px, 298px
- **Line height:** 1.00–1.20
- **Letter spacing:** -0.064em

### Helvetica W01 Roman — Workhorse for all body copy, form labels, subheadings, navigation, and secondary headings up to 45px; the only weight available is 400, forcing visual hierarchy to come from size and color contrast rather than weight shifts
- **Substitute:** Helvetica Neue, Inter, Arial
- **Weights:** 400
- **Sizes:** 13px, 14px, 15px, 18px, 31px, 45px
- **Line height:** 1.00–1.60
- **Letter spacing:** normal

### wfont_9aea05_daebdda91ced4d119f7837b7bae26e19 — wfont_9aea05_daebdda91ced4d119f7837b7bae26e19 — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 24px, 298px
- **Line height:** 1

### madefor-text — madefor-text — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 187px
- **Line height:** 1.2
- **Letter spacing:** -0.064

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.4 | — |
| body-sm | — | — | 14px | 1.4 | — |
| body | — | — | 15px | 1.4 | — |
| body-lg | — | — | 18px | 1.4 | — |
| heading-sm | — | — | 31px | 1.3 | — |
| heading | — | — | 45px | 1.3 | — |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **tags:** 999px
- **cards:** 12px
- **inputs:** 0px
- **buttons:** 999px

## Components

### Ember Pill Button
**Role:** Primary action trigger

Filled red (#ff1841) pill button with white text, border-radius 999px, padding 10px 20px, font-size 13px Arial weight 400. Used for 'Submit resource →' and other conversion actions. The pill shape is the only rounding convention in the system.

### Ghost Outline Button
**Role:** Secondary or low-emphasis action

Transparent fill with 1px white or #949494 border, border-radius 999px, padding 8px 20px, white or dark text. Used for toggle state containers, secondary navigation, and upload actions. Interior element (like the toggle knob) is a small red circle.

### Underline Input
**Role:** Form field for text entry

No box, no background — just a 1px bottom border (#000000 on white sections, #212121 on dark). Label text floats above at 13–15px Helvetica. Focus state thickens the bottom border to 2px or shifts it to #ff1841. Placeholder text in #949494.

### Upload File Button
**Role:** File attachment trigger

Pill-shaped ghost button matching the Ghost Outline pattern — transparent fill, dark border on red background, border-radius 999px, contains a small plus icon and 'Upload file' label in Helvetica 14px.

### Toggle Switch
**Role:** Binary on/off control in the header

Pill-shaped container (border-radius 999px, ~40px wide) with a circular knob. Off state: transparent fill with #949494 border, knob on left. On state: red (#ff1841) fill with red knob — the knob is the same color as the track, creating a flat solid block.

### Dot Grid Logo Mark
**Role:** Brand identity icon in the header

3×3 grid of small filled circles arranged in a square, rendered in white on dark backgrounds. Functions as a compact brand mark that echoes the grid structure of the 10X concept (10 dots = 10×).

### Massive Display Headline
**Role:** Hero-level typographic element

Text rendered at 187–298px in the custom display face, weight 400, line-height 1.0, letter-spacing -0.064em. Fills the full viewport width. The text is white on black or black on red — never colored or gradient.

### Red Full-Width Section
**Role:** Content section with branded background

Full-bleed #ff1841 background spanning the viewport width. Contains form fields, labels, and body copy in black (#000000) or near-black. No inner container or max-width constraint visible — content flows edge-to-edge with 20px padding from viewport edges.

### Form Section Header
**Role:** Section title within a colored background

Helvetica 45px weight 400, line-height ~1.0, black text on the red section background. No decorative underline or accent — the type size alone carries the hierarchy.

### Footer Attribution Badge
**Role:** Third-party platform credit

Small pill-shaped badge in the bottom corner with a 'W' icon, text 'Built with WIX STUDIO'. White background, dark text, border-radius 999px, font-size 10px Arial. Functions as a persistent floating element across sections.

### Word-Spaced Subtitle
**Role:** Micro-headline beneath the display headline

Individual words of a sentence ('Get and share resources that let you do better work') spaced at wide intervals (~120–160px apart) across the full width, Helvetica 13px, in #949494. Creates a typographic rhythm that mirrors the display headline's breadth.

### Sticky Top Bar
**Role:** Global navigation and primary CTA

Fixed top bar with left-aligned dot grid logo, right-aligned toggle and red 'Submit resource' pill button. No background fill — elements float directly on the section color beneath. Height ~40px.

## Do's and Don'ts

### Do
- Use border-radius 999px for all interactive elements — buttons, toggles, tags, badges. Sharp corners belong only to form input bottom borders and structural layout lines.
- Render hero and display headlines at 187–298px with the custom display face, weight 400 only, line-height 1.0, letter-spacing -0.064em. Never bold or compress further.
- Alternate between #000000 and #ff1841 for full-bleed section backgrounds. White (#ffffff) appears only as a transient surface for form areas and body content.
- Use #ff1841 as the sole chromatic color. Every red element — button, toggle, section background — draws from the same Ember Red token.
- Set body and subheading type in Helvetica at 13–45px, weight 400 only. Build hierarchy through size jumps, not weight changes.
- Keep all UI controls flat — no shadows, no gradients, no glassmorphism. Depth comes from color field transitions (black → red → white), not elevation.
- Place micro-labels and word-spaced subtitles in #949494 to recede behind the primary message while maintaining readability.

### Don't
- Do not introduce a second accent color. The system is binary: achromatic structure with one red rupture.
- Do not use font-weight 600+ anywhere. The entire system operates at weight 400; bolding breaks the typographic discipline.
- Do not add shadows or elevation to cards or buttons. Flatness is the design language — #ff1841 on #000000 is the only depth mechanism.
- Do not use border-radius values between 2px and 12px for buttons or interactive elements. The system jumps from 0 (input underlines) to 12px (cards) to 999px (pills).
- Do not place the display font at sizes below 100px. The custom display face is designed for poster-scale rendering; using it at body size destroys its character.
- Do not use #000000 as a background on the red sections or #ff1841 on the black sections. The red and black must meet as direct transitions, not through a dark-red intermediate.
- Do not add photography, illustration, or decorative graphics. The system is pure typography and flat color — imagery would dilute the poster-like clarity.

## Elevation

No shadows exist in this system. Depth is created exclusively through color contrast — a red section on a black page, white text on black, black text on red. Cards do not float; they sit flat against the colored field. This flatness is the design.

## Surfaces

- **Paper White** (`#ffffff`) — Base page canvas and form field background
- **Ash** (`#e8e6e6`) — Subtle card surfaces and light dividers
- **Charcoal** (`#212121`) — Elevated dark surface behind or between red sections
- **Obsidian** (`#000000`) — Hero background — the deepest surface, full-bleed
- **Ember Red** (`#ff1841`) — Branded content section background — not a UI surface in the traditional sense but a full-bleed visual field

## Imagery

No photography, illustration, or product imagery is present. The visual system is pure typography and flat color fields. The only graphical elements are the dot-grid logo mark, simple plus icons inside upload buttons, and the circular toggle knob — all geometric, all monochrome or red. The 10X brand identity is carried entirely by type scale and color alternation, not by imagery.

## Layout

Full-bleed page with no max-width container. Sections span the entire viewport width with no gutters or margins. The hero is a pure black field with the display headline and word-spaced subtitle centered vertically. The red form section follows as another full-bleed band, with a 3-column form grid (left column for personal fields, center for resource fields, right for uploads) at 20px column gaps. Navigation is a minimal floating top bar with no background. The overall rhythm is: black void → red field → black void, creating a binary visual alternation that functions like a poster spread.

## Similar Brands

- **Wix Studio** — Same high-contrast black-and-white base with a single vivid accent, same massive unweighted display type, and the persistent 'Built with WIX STUDIO' badge confirms the direct relationship
- **Framer** — Bold minimalism with alternating full-bleed dark and light sections, pill-shaped controls, and typography that fills the viewport
- **Notion** — Extremely restrained UI with near-zero decoration, relying on type scale and color contrast for hierarchy rather than shadows or borders
- **Vercel** — Dark-dominant canvas with stark white type, no shadow language, and a single accent for interactive states
