# cthdrl — Style Reference
> gallery wall at midnight

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Cthdrl operates in pure negative space: a pitch-black canvas where a single warm bone-white carries every word, line, and interface element. Typography is the architecture — oversized display weights compress into tight leading (0.85) to create monolithic headline slabs, while a monospaced face handles navigation, metadata, and body copy at intentionally small sizes. There are no fills, no shadows, no rounded surfaces, and no chromatic accents in the UI layer itself; color appears only as full-bleed gradient sections (deep maroons, violets, olive) that act as atmospheric chapter breaks. The system feels less like a website and more like a printed broadsheet or gallery wall: silence as the primary material, cream-on-black text as the only voice.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bone | `#e7ded1` | Primary text, hairline borders, navigation labels, link color, icon strokes — the sole chromatic element in the UI layer, a warm off-white that avoids clinical sterility |
| Void | `#000000` | Page canvas, section backgrounds, every surface — pure black, not a near-black |
| Maroon Gradient | `linear-gradient(rgb(76, 11, 2), rgb(91, 48, 82))` | Full-bleed atmospheric section background — deep oxidized red creating a candlelit warmth against the surrounding void |
| Violet Gradient | `linear-gradient(rgb(76, 11, 2), rgb(91, 48, 82))` | Full-bleed atmospheric section background — deep indigo wash, a cold counterpoint to the maroon sections |
| Crimson Gradient | `linear-gradient(rgb(152, 29, 38), rgb(76, 49, 48))` | Full-bleed atmospheric section background — burnt blood red, the most aggressive gradient stop |
| Plum Gradient | `linear-gradient(rgb(182, 1, 34), rgb(83, 48, 59))` | Full-bleed atmospheric section background — dark mulberry, a muted violet-red transition |
| Olive Gradient | `linear-gradient(rgb(168, 180, 40), rgb(69, 68, 58))` | Full-bleed atmospheric section background — sickly yellow-green, the only non-red gradient, used sparingly for contrast |

## Typography

### NB Akademie — Display and heading typeface. Custom serif used exclusively for monumental headlines at 121px with extremely tight leading (0.85) that makes characters nearly touch. The 400 weight at display size is deliberate restraint — the scale and tight tracking do the work that bold weight would do in other systems. Letter-spacing tightens further at larger sizes.
- **Substitute:** GT Sectra, Tiempos Headline, or any transitional serif with low contrast and geometric proportions
- **Weights:** 400
- **Sizes:** 32px, 35px, 121px
- **Line height:** 0.85–1.20
- **Letter spacing:** -0.016em to -0.01em

### NB Akademie Mono — UI and monospace workhorse — navigation, body text, metadata, links, icons, and the 32px mid-scale heading tier. At 11px the negative tracking (-0.045em) compresses characters into a dense data-stream aesthetic. The monospaced face contrasts with the display serif to create a document/blueprint duality: editorial headlines above, technical metadata below.
- **Substitute:** JetBrains Mono, IBM Plex Mono, or Berkeley Mono
- **Weights:** 400
- **Sizes:** 11px, 32px
- **Line height:** 1.00–1.20
- **Letter spacing:** -0.045em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.2 | -0.495px |
| subheading | — | — | 32px | 1.2 | -1.44px |
| heading | — | — | 35px | 1.2 | -0.56px |
| display | — | — | 121px | 0.85 | -1.936px |

## Spacing & Layout

**Density:** spacious

- **Section gap:** 50px
- **Card padding:** 0px
- **Element gap:** 10-11px

### Border Radius

- **all:** 0px

## Components

### Display Headline
**Role:** Hero and section headlines

NB Akademie at 121px, weight 400, line-height 0.85, letter-spacing -0.016em. Bone (#e7ded1) on Void (#000000). Occupies full viewport width, often broken across 3-4 lines. A thin horizontal rule or short em-dash prefix marks the opening line. No max-width constraint — text breathes to the edges.

### Navigation Bar
**Role:** Top-level site navigation

NB Akademie Mono at 11px, uppercase, weight 400, letter-spacing -0.045em. Bone text on Void. Fixed thin top bar with logo left, primary nav center, counter/indicator right. Navigation items separated by 30px horizontal padding. No background fill, no border — floats directly on the black canvas.

### Section Counter
**Role:** Page position indicator (e.g. 0/14)

NB Akademie Mono 11px, Bone. Positioned top-right. Italic-style format with slash separator. Serves as a pagination metaphor, treating the site as a 14-page document.

### Outlined Link
**Role:** Inline and standalone links

Bone text with a 1px Bone border on one or two sides, or underlined in Bone. No background fill, no pill shape. Links are identified by their border treatment alone — the outlined-action border (ACTION_BORDER=12) is the only visual signal. Padding 0px vertical, 0px horizontal within text flow.

### Metadata Block
**Role:** Supporting information under headlines

NB Akademie Mono 11px, uppercase, Bone. Arranged in 3-column or 4-column grid at the bottom of hero sections. Location, contact prompt, and studio description in tight monospace columns. 10px element gap, 30px column padding.

### Arc Divider
**Role:** Section separator and decorative geometry

Thin 1px Bone circle or arc line drawn at large scale (800px+ diameter) behind content. Creates a sense of orbital geometry against the black void. Partially visible, never fully rendered — the incompleteness is the point.

### Gradient Section Background
**Role:** Full-bleed chromatic page break

One of the six detected linear gradients (maroon→plum, crimson→earth, olive→charcoal, etc.) applied edge-to-edge as a section background. No borders, no radius. Text within these sections uses Bone or Void depending on the gradient's luminance. Functions as a 'chapter change' in a printed catalog.

### Project Index Item
**Role:** List entry in a project gallery or case study index

NB Akademie Mono 11px or NB Akademie 32px, Bone text. Minimal — project title and a 1px Bone top/bottom border creating a row. No thumbnail, no description. The index reads as a typeset table of contents.

## Do's and Don'ts

### Do
- Use only #e7ded1 for all text, borders, icons, and interactive elements on a #000000 canvas
- Set display headlines at 121px with line-height 0.85 and letter-spacing -0.016em in NB Akademie
- Use NB Akademie Mono at 11px with -0.045em letter-spacing for all body, nav, and metadata text
- Apply 0px border-radius to every element — no exceptions, no rounded corners anywhere
- Use full-bleed gradient sections (maroon, violet, crimson) as the only chromatic moments, applied edge-to-edge with no padding or containment
- Maintain 0px padding and no fill on all links and buttons — identify interactive elements by Bone borders or underlines only
- Keep 50px between major sections and 10-11px between inline elements to preserve the editorial rhythm

### Don't
- Never introduce a second text color — the system is monochrome in the UI layer; chromatic color exists only in full-bleed gradient sections
- Never use rounded corners, box-shadows, or background fills on any component
- Never set body or UI text above 11px in NB Akademie Mono — the face is reserved for technical/metadata scale
- Never use a bright or saturated color for buttons, links, or interactive states — interactivity is signaled by borders, not fills
- Never apply gradients to text, icons, or component surfaces — gradients are full-bleed backgrounds only
- Never constrain the page to a max-width container — the layout bleeds to viewport edges, mimicking a printed sheet
- Never use weight 600+ — every typeface runs at 400; scale and tracking create hierarchy, not weight

## Elevation

The design uses zero elevation. There are no shadows, no z-axis surfaces, no floating panels. Spatial separation is achieved through generous negative space and the black void itself — elements exist on a single plane, distinguished only by their position and the thin Bone lines between them. This is a design that trusts emptiness as a structural material.

## Surfaces

- **Void** (`#000000`) — Primary canvas — every page, every section defaults to this
- **Gradient Fields** (`#4c0b02`) — Full-bleed chromatic section backgrounds acting as chapter dividers — never cards, never elevated surfaces

## Imagery

The site uses almost no photography or illustration. Visual interest comes entirely from typographic scale, the black void, thin geometric arc lines drawn at large scale behind content, and the occasional full-bleed gradient field. Where images appear (project showcases), they are likely product crops or editorial photography with no rounded corners, bleeding to viewport edges. The imagery strategy is anti-imagery: text and geometry are the visuals.

## Layout

Full-bleed layout with no max-width constraint — the canvas extends to viewport edges on all sides. The hero is a massive editorial headline occupying the full viewport height, with a thin arc or circle line drawn at 800px+ diameter behind it as the only graphical element. Below the headline, a 3-4 column metadata row in 11px monospace provides supporting information. Navigation is a fixed thin top bar with no background fill. Section transitions happen through full-bleed gradient fields rather than borders or spacing. The grid is asymmetric: headline-left, counter-right, metadata columns unevenly weighted. The overall rhythm is that of a printed broadsheet or exhibition catalog — spacious vertical sections, generous breathing room, text-first composition.

## Similar Brands

- **Pentagram** — Editorial typography-first layout with no decorative chrome, relying on typographic scale and generous negative space
- **Resn** — Dark canvas with large display headlines and sparse UI — content and typography as the entire visual system
- **Manual (manual.co)** — Full-bleed gradient sections as chapter breaks with monochrome text overlay, broadsheet editorial rhythm
- **Locomotive** — Custom serif display type with monospaced metadata, gallery-like restraint and zero decorative elements
