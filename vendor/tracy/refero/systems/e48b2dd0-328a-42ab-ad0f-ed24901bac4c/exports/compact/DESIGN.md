# Adcker — Style Reference
> Giant brutalist poster on warm museum paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Adcker operates as a typographic monolith: one warm cream canvas, one near-black ink, and display type so large it becomes architecture. The entire interface runs on the tension between oversized editorial headlines and whisper-quiet metadata, with no chromatic accents to soften the impact. Every visual decision is editorial — this reads like the opening spread of a print magazine, not a software product. The 0% colorfulness is deliberate: chromatic color would dilute the authority that sheer typographic scale already provides. The only non-text element that breaks the monochrome spell is a single candid photograph literally embedded inside the headline, treating the image as punctuation rather than decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#191919` | All text, headlines, borders, link colors — the sole foreground color in the entire system. Near-black rather than pure black adds warmth that harmonizes with the cream canvas |
| Bone Canvas | `#efedea` | Page background, card surfaces, nav bar — the warm off-white ground that makes the near-black ink read with high contrast (15.1:1 AAA) without feeling harsh or clinical |
| Stone Veil | `#e3e1de` | Subtle surface variation against Bone Canvas — used sparingly for secondary panels or section backgrounds to create depth without introducing color |

## Typography

### nhm — Primary type system spanning body (16-21px) to extreme display (173-185px). Weight 400 carries both the whisper-quiet metadata and the 185px display headlines — the system trusts the scale to create hierarchy rather than reaching for bold weights. Letter-spacing tightens aggressively to -0.05em at display sizes to prevent the large counters from feeling airy.
- **Substitute:** Neue Haas Grotesk, Inter, Helvetica Neue
- **Weights:** 400, 700
- **Sizes:** 16, 21, 173, 185
- **Line height:** 0.78, 1.00, 1.10, 1.20
- **Letter spacing:** -0.8px at 16px, -1.05px at 21px, -8.65px at 173px, -9.25px at 185px

### psl — Mid-scale display for subheadings and section titles. Sits between body text and the extreme display tier, carrying -0.015em tracking for controlled density at smaller display sizes.
- **Substitute:** Inter, Söhne
- **Weights:** 400
- **Sizes:** 34, 69
- **Line height:** 1.00, 1.20
- **Letter spacing:** -0.51px at 34px, -1.035px at 69px

### psr — Body text alternative at 21px with normal tracking — used for longer-form passages where the tighter nhm spacing would feel constrained.
- **Substitute:** Inter, system-ui
- **Weights:** 400
- **Sizes:** 21
- **Line height:** 1.00
- **Letter spacing:** normal

### Kumbh Sans — Alternate display family at extreme sizes, sharing the same -0.05em tracking and tight 0.78-0.80 line-height as nhm. Provides a geometric counterpoint to nhm's neo-grotesque character for typographic variation within display lockups.
- **Substitute:** Kumbh Sans (Google Fonts)
- **Weights:** 400
- **Sizes:** 173, 185
- **Line height:** 0.78, 0.80
- **Letter spacing:** -8.65px at 173px, -9.25px at 185px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.2 | -0.8px |
| body | — | — | 21px | 1 | -1.05px |
| subheading | — | — | 34px | 1 | -0.51px |
| heading | — | — | 69px | 1 | -1.035px |
| display | — | — | 173px | 0.78 | -8.65px |
| display-lg | — | — | 185px | 0.8 | -9.25px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1400px
- **Section gap:** 200px
- **Card padding:** 32px
- **Element gap:** 8px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 0px

## Components

### Top Navigation Bar
**Role:** Minimal site header

Fixed-position bar with logo (Adcker) left-aligned and 'Menu' text right-aligned. No background fill or border — sits directly on Bone Canvas. All text at 16px nhm 400 in Ink Black. The absence of a visible container reinforces the editorial, borderless aesthetic.

### Editorial Display Headline
**Role:** Hero typographic lockup

Centered text at 173-185px nhm 400, line-height 0.78-0.80, letter-spacing -0.05em. Text fills the viewport width. Photographs and media elements are embedded inline within the text flow (not overlaid), cropped to the shape of the characters they replace. No background, no border, no shadow — pure typographic presence on Bone Canvas.

### Metadata Label
**Role:** Small editorial annotation

Tiny text annotations like 'Showreel' or 'We're built for' at 16-21px nhm 400 in Ink Black. Positioned with generous whitespace adjacent to the dominant display element. These act as quiet directional cues rather than interactive elements.

### Showreel Player
**Role:** Video showcase container

Full-bleed or large contained video frame on Bone Canvas, referenced by the 'Showreel' metadata label. No visible chrome, controls, or border — the video IS the component. 0px radius, no shadow.

### Case Study Card
**Role:** Project portfolio entry

Flat card on Bone Canvas with no border or shadow. Internal spacing: 32px padding. Contains a project title at heading size (69px) and metadata at caption size (16px). Images are flush, 0px radius, extending to card edges.

### Text Link
**Role:** Inline navigation

Underlined link with 2px padding-bottom and 20px padding-right spacing. Uses Ink Black color with a border-bottom in the same color. No fill, no background, no interactive state color change — the underline IS the interactive affordance.

### Section Divider
**Role:** Visual section break

No visible divider element — sections are separated by the 200px vertical gap alone. The cream canvas flows seamlessly between content blocks, with the massive scale of display type providing implicit section boundaries.

### Full-Bleed Image Block
**Role:** Photography showcase

Edge-to-edge images at 0px radius, no border, no shadow. Photography is candid and human — warm skin tones, natural expressions, no studio staging. Images may be embedded within text lockups or stand alone as full-viewport sections.

## Do's and Don'ts

### Do
- Use display sizes exclusively at 173px or 185px — anything between 70px and 170px breaks the typographic extremes the system is built on
- Maintain line-height 0.78-0.80 for display type to keep the massive headlines from drifting apart vertically
- Set letter-spacing to -0.05em on all display text (nhm and Kumbh Sans tiers) to compensate for the wide counters at extreme sizes
- Use the full 200px section gap between major content blocks — compact spacing here would undermine the editorial gravitas
- Embed photographs inline within display text lockups rather than placing them as separate elements beside the text
- Keep all text weight 400 unless explicitly calling for the nhm 700 weight — the system derives hierarchy from scale, not weight
- Let the Bone Canvas (#efedea) serve as both background and surface — the monochromatic discipline is the point

### Don't
- Never introduce chromatic colors, brand accents, or semantic state colors — the 0% colorfulness is the system
- Never apply border-radius to any element — all corners are sharp (0px) to preserve the brutalist editorial feel
- Never use shadows, glows, or elevation effects — the system is completely flat
- Never use body text larger than 21px or smaller than 16px — the gap between body and display is intentional and vast
- Never use a centered CTA button with a colored fill — interactive elements are text links with underlines, not buttons
- Never set display type at line-height above 0.85 — the tight leading is what makes 185px text feel like a single sculptural object
- Never overlay text on dark backgrounds to create contrast — invert by using Ink Black (#191919) as a full surface, not as a treatment

## Surfaces

- **Bone Canvas** (`#efedea`) — Primary page background and dominant surface
- **Stone Veil** (`#e3e1de`) — Secondary surface for subtle layering
- **Ink Black** (`#191919`) — Inverted surface for dark sections or contrast blocks

## Imagery

Photography is used sparingly but with high impact — one candid human portrait visible, cropped tightly and embedded directly within a display headline as inline content. The treatment is raw: natural color, warm skin tones, no filter or grading that would clash with the cream canvas. Images carry no border, no radius, no shadow — they sit flush against the Bone Canvas. The role of imagery is punctuation, not decoration: a single photograph interrupting a wall of text creates more impact than a gallery grid. No illustrations, no icons visible, no abstract graphics. The system communicates through type alone, with photography as the sole non-textual element.

## Layout

The page model is full-bleed with centered content alignment. The hero is a massive centered typographic statement ('THE ART * ( ) OF HACKING SOCIAL') that fills the viewport vertically, with a small photograph embedded inline within the text. Navigation is a minimal top bar — logo left, 'Menu' right — sitting directly on the cream canvas with no container or border. The hero bleeds edge-to-edge with generous breathing room (200px) between sections. No visible grid structure, no card layouts, no sidebars. The content rhythm is: oversized editorial display → quiet metadata → embedded media → massive whitespace → repeat. The layout reads as a scrolling poster, not a traditional web page.

## Similar Brands

- **Buck (buck.co)** — Same oversized editorial display type and monochromatic discipline with photography embedded in headlines
- **Gunner (gunnercooke.com style work)** — Extreme typographic scale, 0% colorfulness, and the same editorial poster-page treatment
- **Resn (resn.co.nz)** — Bold creative agency aesthetic with massive display headlines and near-zero chromatic color
- **Locomotive (locomotive.ca)** — Typography-as-architecture approach with flat surfaces and warm off-white canvases
- **Ueno (ueno.co)** — Brutalist creative agency layouts with extreme type sizes and embedded media in text lockups
