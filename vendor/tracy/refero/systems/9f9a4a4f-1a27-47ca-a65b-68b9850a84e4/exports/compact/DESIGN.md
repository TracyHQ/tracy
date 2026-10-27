# Antimetal — Style Reference
> editorial observatory on cream paper — a quiet morning in a research journal where restraint signals confidence and the serif does the heavy lifting

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Antimetal operates in a quiet editorial register: warm cream paper, a distinctive contemporary serif (Test Signifier) at weight 400 for every headline, and an almost entirely achromatic palette where color appears only as a small constellation of decorative dots and a single muted chartreuse accent. The visual grammar borrows from print design — drop caps, pull quotes, section numbering in tracked monospace, dashed hairline dividers — rather than from typical SaaS dashboards. Components are flat and pill-shaped; the navigation is a liquid-glass capsule; borders are dashed 1px at 10% black opacity. Everything whispers, even the CTA. The serif at regular weight doing the work of bold is the single most defining choice: Antimetal does not shout authority, it earns it through typographic restraint and generous breathing room.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment | `#d7d7d0` | Page canvas — warm gray field that recedes behind content, used as the dominant full-bleed background |
| Cream | `#f7f6f3` | Primary surface — card backgrounds, FAQ rows, section bands, pulled slightly warmer than white to avoid clinical feel |
| Bone | `#fdfcfa` | Elevated card surface — nearly white with a faint warm cast, for content blocks that need to feel slightly above the cream layer |
| Bistre | `#1a1614` | Primary text, dark filled buttons, active strokes — warm near-black that replaces pure #000, never harsh on the cream |
| Graphite | `#66635f` | Secondary body text, nav labels, supporting copy — the workhorse mid-tone that keeps paragraphs quiet |
| Flint | `#a8a7a1` | Muted helper text, dashed dividers, disabled chrome, low-emphasis stroke — sits between graphite and the canvas |
| Slate | `#53504c` | Tertiary text and sub-labels — slightly darker than graphite for labels that need quiet emphasis |
| Ash | `#2a2724` | Hover/pressed state on dark buttons and video timestamp chips — a mid-point between bistre and black |
| Quill | `#e3e3de` | Hairline dividers, ghost button borders, nav capsule background, tab resting surface — the lightest warm gray that still reads as a line |
| Chartreuse Whisper | `#e2e67d` | Sole chromatic accent — appears as a small punctuation mark, badge fill, or highlight wash; deliberately desaturated so it never dominates |

## Typography

### Test Signifier — All display and heading text from sub-heading through display — a custom contemporary serif with distinctive flared terminals. Used at weight 400 across every size, never bolded; negative letter-spacing tightens large sizes (ls=-0.037em at 54px, -0.021em at 48px). Substitute: "Noto Serif", Georgia, serif.
- **Substitute:** Noto Serif, Georgia, serif
- **Weights:** 400
- **Sizes:** 24px, 36px, 48px, 50px, 54px
- **Line height:** 1.00, 1.10, 1.20
- **Letter spacing:** -0.037em at 54px, -0.021em at 48px, 0 at 24px

### Geist — Body, nav, buttons, and all UI chrome — a neutral grotesque that stays out of the serif's way. Weight 500 is reserved for nav and button labels that need a half-step of emphasis. Default letter-spacing -0.01em gives crispness at small sizes. Substitute: "Inter", system-ui, sans-serif.
- **Substitute:** Inter, system-ui, sans-serif
- **Weights:** 400, 500
- **Sizes:** 14px, 16px, 18px, 20px
- **Line height:** 1.00, 1.50
- **Letter spacing:** -0.01em uniform

### Geist Mono — Section numbering labels, eyebrows, metadata, and the "05 · FAQ" style markers — always uppercase, tracked at 0.06–0.1em, the only text that announces itself through tracking rather than weight. Substitute: "JetBrains Mono", ui-monospace, monospace.
- **Substitute:** JetBrains Mono, ui-monospace, monospace
- **Weights:** 400
- **Sizes:** 10px, 11px
- **Line height:** 1.20, 1.50
- **Letter spacing:** 0.06em at 11px, 0.1em at 10px
- **OpenType features:** `"tnum" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | 1px |
| body-sm | — | — | 14px | 1.5 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.5 | — |
| heading-sm | — | — | 24px | 1.2 | — |
| heading | — | — | 36px | 1.1 | — |
| heading-lg | — | — | 48px | 1.1 | -1.008px |
| display | — | — | 54px | 1.1 | -1.998px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 120px
- **Card padding:** 40px
- **Element gap:** 16px

### Border Radius

- **cards:** 4px
- **buttons:** 9999px
- **nav-capsule:** 82px
- **pills-large:** 999px

## Components

### Dark Pill Button
**Role:** Primary action CTA — the only filled button in the system

Background #1a1614, text #f4f4e7, full-pill radius 9999px, padding 12.5px vertical / 24.5px horizontal, font Geist 14px weight 500. The warm dark fill on warm cream paper reads as confident rather than aggressive. Used for "Book a demo" and primary conversions. Never appears more than once per viewport.

### Ghost Outlined Button
**Role:** Secondary action — paired with the dark pill to create contrast without competing for attention

Transparent background, border 1px solid in current text color at 92% opacity (#1a1614 at 0.92), text #1a1614, radius 0px (rectangular not pill), padding 24px on all sides, Geist 14px weight 500. The sharp corners deliberately contrast the pill's softness, making the two-button pair read as a typographic rhythm rather than a hierarchy of importance.

### Liquid-Glass Navigation Capsule
**Role:** Sticky top navigation with backdrop-filter blur

Floating pill shape with radius 82px, backdrop-filter blur(8–24px) saturate(1.75–1.8) brightness(1.1), semi-transparent fill #cfcfc8bd, inset shadow rgba(0,0,0,0.08) 0 0 10px 0 for depth, 1px hairline border. Internal layout: left-aligned secondary links, centered wordmark with antimetallic icon glyph, right-aligned sign-in + dark pill CTA. Sits over content with visible refraction.

### FAQ Accordion Row
**Role:** Expandable question/answer list

Background #f7f6f3, no radius, padding 20–24px vertical, 1px dashed border on all sides at #1a1614 10% opacity (the dashed hairline is the signature separator style). Question text in Test Signifier 24px weight 400, plus icon right-aligned in Bistre. Expanded state reveals body copy in Geist 16px below the dashed divider.

### Section Header with Monospace Marker
**Role:** Editorial section opener — every major section is numbered and labeled

Two-line composition: top line is "05 · FAQ" or "06 · STAY UP TO DATE" in Geist Mono 10–11px uppercase, letter-spacing 0.1em, color #66635f. Below, the section heading in Test Signifier 36–48px weight 400 in Bistre. A short descriptor paragraph in Geist 20px color #66635f sits beside the heading in a two-column layout for the FAQ section.

### Drop Cap Body Paragraph
**Role:** Long-form editorial content block

First letter of the first paragraph rendered as a large outlined initial cap in Test Signifier at roughly 2.2x the body size, positioned with negative margin to overlap the line above. Body text in Geist 16px line-height 1.5 color Bistre. Used for the "Production engineering, as practiced today…" essay block. Creates a magazine-article cadence uncommon in tech product sites.

### Pull Quote Block
**Role:** Featured testimonial or key statement

Large quote in Test Signifier 36–48px weight 400 with curly opening quote " above, attribution below in Geist 14px — name in Bistre, role/company in Graphite. Quote marks are typographic, not glyphs. Paired with a video thumbnail on the left in a two-column layout. No background, no border — floats in the cream space.

### Video Thumbnail Card
**Role:** Embedded video player surface

Rectangular video still with a centered circular play button (cream fill, dark triangle icon) overlaid. Duration timestamp "2:07" in a small dark pill (#2a2724 background, cream text) bottom-left, brand mark bottom-right. No border or radius beyond a small 4px clip on the timestamp chip. Photographic content is high-contrast with desaturated tones to match the achromatic system.

### Research Log Entry
**Role:** Blog or research post row in a list

Single-line entry with post title in Test Signifier 24px color Bistre, metadata in Geist Mono 10px uppercase tracked: date, author, read time. Title is the link; hover shifts color to Graphite. Separated from neighbors by 1px dashed #1a1614 10% border. Compressed, text-forward, no thumbnails — the list reads like a table of contents.

### Network Visualization Graphic
**Role:** Decorative hero illustration — a dandelion/constellation of connected nodes

Radiating lines from a single center point terminating in small filled circles in four colors: Bistre black, Chartreuse yellow, warm orange (#f59e3a), and olive (#9a9d3e). Lines drawn in Flint at 0.3–0.5px. No animation by default. Occupies the right half of the hero on desktop, sits below headline on mobile. Functions as the only multi-color element on the page.

### View All Outlined Button
**Role:** Tertiary navigation action at section end

Rectangular with 1px solid border in Bistre, Geist 14px weight 500, padding 12px 24px, radius 0. Sits right-aligned in section footers. Subordinate to the dark pill and ghost outlined button — it is the quietest of the three button treatments and never appears in the hero.

## Do's and Don'ts

### Do
- Set all headings in Test Signifier weight 400 — never bold the serif, the entire brand identity depends on the quiet authority of regular weight doing display work.
- Use 1px dashed borders in #1a1614 at 10% opacity for all dividers and accordion separators; solid lines are reserved for button outlines and the nav capsule.
- Pair every primary CTA (dark pill) with a secondary ghost outlined button; never let the dark pill stand alone in a button group.
- Number every major section with a Geist Mono 10–11px uppercase marker at letter-spacing 0.1em in #66635f, format as "05 · SECTION NAME".
- Keep the canvas at #d7d7d0 (warm gray) and surfaces at #f7f6f3 (cream); never use pure white or pure black — the warm cast is the signature.
- Reserve chartreuse #e2e67d for single-element accents (one badge, one highlight, one dot); it must never appear as a fill on large surfaces.
- Use the 82px pill radius for the navigation capsule and 9999px for buttons; cards and dividers stay rectangular at 0–4px.

### Don't
- Do not bold any heading — Test Signifier at weight 400 is non-negotiable; introducing 600/700 destroys the editorial register.
- Do not use solid borders for content separators; dashed 1px is the only hairline treatment allowed inside the page.
- Do not place more than one filled dark button per viewport; the dark pill loses authority when repeated.
- Do not introduce saturated blue, red, or green for buttons or alerts; the only chromatic color is the desaturated chartreuse accent.
- Do not use drop shadows on cards or content blocks; depth is achieved through the liquid-glass nav and warm-gray layering only.
- Do not set body text in the serif — Geist handles all body, nav, and UI; the serif is display-only.
- Do not use the network/dandelion graphic in contexts other than the hero; it is a singular signature, not a reusable pattern.

## Elevation

Depth is created through warm-gray surface layering and the liquid-glass navigation, never through drop shadows. The only shadows in the system are the inset rgba(0,0,0,0.08) glows on the nav capsule that simulate refraction. Content blocks are flat; separation is communicated by background color shifts and dashed hairlines, not by elevation.

## Surfaces

- **Parchment Canvas** (`#d7d7d0`) — Base page background, the warm gray field that everything sits on
- **Cream Surface** (`#f7f6f3`) — Content cards, FAQ rows, pull-quote backgrounds — the standard elevated surface
- **Bone Card** (`#fdfcfa`) — Lightest surface for content that needs to feel slightly above the cream layer
- **Quill Line** (`#e3e3de`) — Hairline borders, ghost button backgrounds, nav capsule resting fill

## Imagery

Minimal photographic content. The hero pairs text with a single decorative graphic — a radial network/dandelion of colored dots (black, chartreuse, warm orange, olive) connected by fine lines to a single center point, representing autonomous agents radiating from a system. Video content appears as dark, high-contrast thumbnails with a centered cream play button. The Google logo in the testimonial is rendered as a grayscale image. No lifestyle photography, no product screenshots, no 3D renders. The page is 90% typography and white space; when imagery appears it is either the signature network graphic or a single video frame.

## Layout

Max-width ~1200px centered content with full-bleed warm-gray sections. The hero is a two-column split: headline + subtext + button pair on the left (60% width), network visualization on the right (40%). Below the hero, sections alternate between cream and parchment backgrounds with generous 120px vertical gaps. Section openers use a two-column header: serif heading left, short descriptor right. Content blocks are either two-column (text + media) or single-column centered. The FAQ uses a full-width accordion constrained to the content max-width. The research log is a single-column text list. Navigation is a floating liquid-glass capsule centered at the top, not a full-width bar. Buttons are always paired (filled + ghost) and never stacked alone.

## Similar Brands

- **Linear** — Same cream/gray paper feel, same generous whitespace, same restraint in UI chrome — though Linear is more geometric and Antimetal is more editorial
- **Anthropic** — Same custom serif for headlines at weight 400, same warm neutral palette, same quiet authority through typographic restraint rather than visual volume
- **Stripe** — Same editorial use of serif type for technical product marketing, same dashed-border detail treatment, same warm off-white surfaces
- **Felt** — Same warm gray canvas with cream surfaces, same pill-shaped navigation, same approach of letting typography carry the brand rather than color
