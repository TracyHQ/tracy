# SuperHi Basic Income — Style Reference
> violet column beside white broadsheet

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

SuperHi Basic Income is a two-color editorial system: a permanent electric-violet column anchored to the left edge, a white broadsheet of generous typography scrolling to its right. The palette is ruthlessly binary — #2727e6 and #ffffff — with no shadows, gradients, or secondary surfaces to dilute the message. Typography carries all the personality: Basis (a geometric sans) handles every functional role, DDC (a more humanist display face) appears only where character is needed, and line heights breathe generously (1.46–1.67 for body text). Components are flat and shape-defined — pill tags at 50px radius, softly rounded buttons at 16px, a dotted globe illustration as the only graphic. The mood is campaign-poster confidence: one loud color, zero decoration, and text that does the heavy lifting.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Iris | `#2727e6` | Violet accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Paper White | `#ffffff` | Right content canvas, card and elevated surfaces, sidebar text and illustration on the violet panel |

## Typography

### Basis Grotesque — The workhorse — body, buttons, links, most headings, sidebar labels, and numbered list markers. Weight 500 carries buttons and emphasized inline text, 700 is reserved for strong emphasis within body copy. Its geometric neutrality lets the single accent color do the talking.
- **Substitute:** Basis Grotesque (free, Indian Type Foundry) → Inter, Söhne, or IBM Plex Sans
- **Weights:** 400, 500, 700
- **Sizes:** 13, 14, 16, 21, 24, 32, 48px
- **Line height:** 1.14–1.67
- **Letter spacing:** normal at all sizes

### DDC — A more humanist display face used sparingly for select headings where a softer, less geometric voice is wanted. Its tight line height (1.00–1.14) is the signature: DDC pulls double duty as type and as a graphical block. Substitute with a humanist sans that has stronger character than Basis — Söhne Breit, ABC Diatype Mono, or Tiempos Headline at low weight.
- **Substitute:** ABC Diatype, Söhne Breit, or PP Neue Montreal
- **Weights:** 400
- **Sizes:** 21, 24px
- **Line height:** 1.00–1.14

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.46 | — |
| body | — | — | 16px | 1.67 | — |
| subheading | — | — | 21px | 1.33 | — |
| heading-sm | — | — | 24px | 1.25 | — |
| heading | — | — | 32px | 1.17 | — |
| display | — | — | 48px | 1.14 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Section gap:** 64px
- **Card padding:** 32px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 50px
- **cards:** 0px
- **buttons:** 16px

## Components

### Fixed Violet Sidebar
**Role:** Brand panel

Full-height fixed left column (~33% viewport width), #2727e6 background, contains dotted globe illustration centered vertically, brand wordmark 'SUPERHI BASIC INCOME' at top in white uppercase, and status label 'APPLICATIONS CLOSED' at bottom — all white text on violet. No padding inside, but elements align to a central vertical axis.

### Sidebar Wordmark
**Role:** Brand label

White uppercase text on #2727e6, Basis 14px weight 500, centered horizontally in sidebar, with a 1px white horizontal rule below it as a divider. Sits at the top of the sidebar.

### Sidebar Status Label
**Role:** Status indicator

White uppercase text on #2727e6, Basis 14px weight 500, centered horizontally at the bottom of the sidebar, preceded and followed by short white horizontal rules — functions as a 'closed' stamp.

### Dotted Globe Illustration
**Role:** Sole graphic element

White dot-matrix sphere on #2727e6 sidebar, takes ~60% of sidebar height, centered. Several larger solid white dots scattered across the sphere surface act as location markers. No animation, no labels — pure texture.

### Display Heading
**Role:** Section opener

Basis 48px weight 400, #2727e6, line-height 1.14, tight letter-spacing. Used for the page-level hero statement. Can be 2–4 lines, left-aligned within the right content column.

### Section Heading
**Role:** Content section label

Basis 32px weight 400, #2727e6, line-height 1.17, sits in the left sub-column of the right content area. Acts as the 'title' for each content block, paired with a longer body in the right sub-column.

### Subheading (DDC variant)
**Role:** Character heading

DDC 21–24px weight 400, #2727e6, line-height 1.00–1.14. Reserved for moments needing typographic warmth — used 1–2 times per page max. Its tight leading makes it read almost as a shape.

### Body Text
**Role:** Long-form copy

Basis 16px weight 400, #2727e6, line-height 1.67 (the most generous in the system). Long paragraphs encouraged — the generous leading signals editorial confidence rather than UI density.

### Underlined Inline Link
**Role:** Text link

Basis 14–16px weight 500, #2727e6, with a 1px #2727e6 underline at baseline. No hover state change needed — the entire system is static. Underline is always present, never removed on hover.

### Outlined Action Button
**Role:** Primary interactive element

White background, 1.5px solid #2727e6 border, 16px border-radius, padding 8px 16px (or 16px 32px for larger versions), Basis 14–16px weight 500, #2727e6 text. This is the only button variant — the system never uses filled buttons. ACTION_BORDER=176 confirms this is the primary interactive treatment.

### Pill Tag / Status Pill
**Role:** Compact label

#2727e6 background, 50px border-radius (fully rounded), white text, Basis 13px weight 500, padding 4px 8px. Used sparingly for inline metadata or small status labels.

### Numbered List Item
**Role:** Ordered list

Each item opens with a circled number (① ② ③) in #2727e6, followed by Basis 16px weight 500 #2727e6 heading text, then a Basis 16px weight 400 description below. Spacing between items: 24px.

### Arrow Bullet List (FAQ)
**Role:** Disclosure / question list

Each item prefixed with a right-pointing triangle marker (▸) in #2727e6, text is Basis 16px weight 500 #2727e6, vertically spaced 8px apart. Used for FAQ-style question lists.

### Two-Column Content Block
**Role:** Layout primitive

The right content area is internally split: a narrow left sub-column (~40%) holds the section heading in Basis 32px, a wider right sub-column (~60%) holds the body text and links. Column gap is 32–48px. This nested two-column pattern repeats down the page.

## Do's and Don'ts

### Do
- Use only #2727e6 and #ffffff — never introduce a third color, a gradient, or a shadow
- Set body line-height to 1.67 and display line-height to 1.14 — the breathing room IS the typographic system
- Make the left sidebar a fixed full-height #2727e6 panel with the dotted globe and white sidebar text; treat it as a permanent brand surface, not a navigation widget
- Use the outlined button (1.5px #2727e6 border, 16px radius, white fill) as the only action variant — never create a filled button
- Use Basis for everything functional and reserve DDC for 1–2 display moments per page where humanist character is needed
- Use 50px radius for tags and 16px radius for buttons — the two-value radius system is the complete shape language
- Underline every link with a 1px #2727e6 rule at baseline; never remove the underline on hover since the system is static

### Don't
- Do not add a third color, a muted neutral gray for secondary text, or a tinted background — all non-white surfaces must be #2727e6 or pure white
- Do not add drop shadows, inner shadows, or glow effects — the system is completely flat and any elevation will feel foreign
- Do not fill buttons with #2727e6 — the system is outlined-only; a filled button would break the editorial restraint
- Do not use DDC for body text, buttons, or functional UI — it is a display face for 1–2 moments per page max
- Do not use border-radius values outside 0, 16px, and 50px — there are exactly two rounded shapes in the system and everything else is square
- Do not break the split-screen layout with a top navigation bar, hamburger menu, or sidebar collapse — the violet column is permanent
- Do not set body line-height below 1.46 or display line-height above 1.25 — the tight-display / loose-body rhythm defines the typographic voice

## Elevation

No shadows. The system is completely flat — visual hierarchy comes from the two-color contrast, typographic scale, and generous whitespace, never from elevation. Any shadow would break the broadsheet metaphor.

## Surfaces

- **Violet Column** (`#2727e6`) — Fixed full-height left sidebar — the brand surface that anchors the layout
- **Paper Canvas** (`#ffffff`) — Main content area to the right of the sidebar; the only place body copy, links, and headings live

## Imagery

Almost no imagery. The only visual asset is a hand-drawn-style dotted globe illustration rendered in white dots on the violet sidebar — a dot-matrix sphere that occupies the entire left column. No photography, no product screenshots, no decorative icons, no avatars. Where icons appear (checklist circles, arrow markers, circled numbers) they are pure typographic Unicode characters in #2727e6, not graphic assets. The page is overwhelmingly text-dominant; the globe is the visual punctuation.

## Layout

Split-screen: a fixed left sidebar (~33% viewport width) stays locked on screen in solid #2727e6, while the right ~67% scrolls independently as a white content canvas. Within the right canvas, content is organized into a nested two-column grid — a narrow heading sub-column on the left and a wider body sub-column on the right, separated by 32–48px. Major sections (hero, 'Free money', 'Got a question?', 'Further reading') are stacked vertically with 64px between them. The sidebar never changes — it carries the brand wordmark, globe illustration, and status label from top to bottom. Navigation is minimal: no top bar, no hamburger, no breadcrumbs — the sidebar IS the navigation. Content density is comfortable: paragraphs are long but breathing room between blocks is generous, giving the page an editorial broadsheet rhythm rather than a dense product UI feel.

## Similar Brands

- **Stripe Press** — Same editorial broadsheet approach — white canvas, single accent color, generous typography, minimal decoration, text that carries the entire visual weight
- **Substack** — Similar two-column newsletter layout with a persistent left brand column and white content reading area, plus the same restraint to a two-color palette
- **Kickstarter campaign pages** — Same single-accent-color campaign-poster energy with a flat layout, large display text, and an emphasis on the proposition rather than UI chrome
- **Mubi** — Editorial single-accent discipline with a strong typographic voice and no decorative imagery beyond a few signature graphic elements
- **Notion** — Ruthless two-color simplicity and zero-shadow flat surfaces; both systems prove that one chromatic color plus white is enough to carry a brand
