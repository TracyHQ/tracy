# Resend — Style Reference
> black velvet with violet neon

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Resend lives in a near-total darkness — pure black canvas, hairline graphite borders, and white-on-black typography that feels like reading text printed on matte glass. The hero is anti-decorative: a single large serif headline at 96px Domaine next to a 3D black cube, with no gradient wash and no marketing illustration. The brand mark is a tight violet (#9281f7) that appears in email-address strings, status icons, and code samples — never on buttons. A monospaced font (Commit Mono) carries the developer identity through every code block, badge, and inline label, making the page read like a terminal wrapped in a luxury interface. Components are sharp-cornered or gently rounded (6px / 16px), low-elevation, and rely on 1px borders rather than shadows to separate layers. Motion is restrained but expressive: fade-and-slide hero text, subtle WebGL rotation on the hero cube, and short 150ms ease-out transitions on hover.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#000000` | Page background, card surfaces, overlay scrims — the entire canvas |
| Graphite Hairline | `#292d30` | 1px borders on cards, inputs, buttons, code blocks, dividers — defines every layer separation |
| White | `#ffffff` | Primary headings, hero text, button labels, icon fills on dark surfaces |
| Bone White | `#f0f0f0` | Body text, secondary headings, stroke outlines on icons — the primary reading color |
| Ash Gray | `#a1a4a5` | Muted body text, badge labels, icon strokes — third-tier text and metadata |
| Smoke Gray | `#abafb4` | Link color, inactive button text, supporting captions — fourth-tier text |
| Iron | `#6e727a` | Subtle decorative strokes, disabled states, low-emphasis borders |
| Charcoal | `#464a4d` | Inline code text, muted labels — text that should disappear into the surface |
| Iris Violet | `linear-gradient(to right bottom in oklab, rgb(146, 129, 247) 0%, rgb(154, 84, 220) 100%)` | Violet text accent for links, tags, and emphasized short phrases; Diagonal violet-to-magenta gradient on icon containers and brand badges |
| Iris Violet Glow | `#baa7ff` | Violet text accent for links, tags, and emphasized short phrases |
| Signal Blue | `#3b9eff` | Blue action color for filled buttons, selected navigation states, and focused conversion moments. |
| Sky Blue | `#70b8ff` | Blue text accent for links, tags, and emphasized short phrases |
| Pulse Green | `#3ad389` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Alarm Red | `#ff9592` | Red text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Crimson | `#ff6465` | Red wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Amber | `#ffca16` | Yellow text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Amber Glow | `#ffd60a` | Yellow wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Surface Gradient | `linear-gradient(rgb(27, 27, 27), rgb(3, 3, 3))` | Subtle card-to-canvas surface lift — used in edge fades and elevated panels |

## Typography

### Inter — Body copy, UI labels, navigation, buttons, links. The workhorse — appears 1280 times across every non-code surface.
- **Substitute:** Inter (Google Fonts), Söhne, system-ui
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 14px, 16px, 18px, 24px
- **Line height:** 1.00, 1.33, 1.43, 1.50, 1.60

### Domaine — Hero display type — weight 400 at 96px with -0.01em tracking creates an editorial, almost-printed feel. Only used twice on the entire page for the largest hero statement.
- **Substitute:** GT Sectra, Tiempos Headline, Playfair Display
- **Weights:** 400
- **Sizes:** 77px, 96px
- **Line height:** 1.00
- **Letter spacing:** -0.01em
- **OpenType features:** `"ss01", "ss04", "ss11"`

### aBC Favorit — Section headlines and sub-headlines. The 56px weight-400 with -0.05em tracking is the signature — extreme negative tracking on a geometric sans creates a compressed, confident display feel that contrasts the editorial Domaine hero.
- **Substitute:** Inter Display, Söhne Breit, GT America
- **Weights:** 400, 500
- **Sizes:** 14px, 16px, 20px, 56px
- **Line height:** 1.00, 1.20, 1.30, 1.50
- **Letter spacing:** -0.05em at 56px, +0.025em at 14px
- **OpenType features:** `"ss01", "ss04", "ss11"; "ss01", "ss03", "ss04"`

### Commit Mono — Code blocks, inline code, terminal-style badges, API labels. Monospaced presence is the developer's identity signal — appears 814 times, rivaling Inter.
- **Substitute:** JetBrains Mono, Berkeley Mono, IBM Plex Mono
- **Weights:** 400
- **Sizes:** 12px, 14px, 16px
- **Line height:** 1.33, 1.43, 1.50

### Helvetica — Helvetica — detected in extracted data but not described by AI
- **Weights:** 400, 600, 700
- **Sizes:** 14px
- **Line height:** 1, 1.71

### -apple-system — -apple-system — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.5, 1.55
- **OpenType features:** `"liga" 0`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | 0px |
| body-sm | — | — | 14px | 1.43 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1 | 0px |
| heading-sm | — | — | 24px | 1.5 | 0px |
| heading | — | — | 56px | 1.2 | -2.8px |
| heading-lg | — | — | 77px | 1 | -0.77px |
| display | — | — | 96px | 1 | -0.96px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 96px
- **Card padding:** 32px
- **Element gap:** 16px

### Border Radius

- **cards:** 16px
- **badges:** 6px
- **inputs:** 6px
- **buttons:** 6px
- **large-panels:** 24px

## Components

### Primary Button (Ghost on Black)
**Role:** Default CTA — 'Get started', 'Log in'

Transparent background, 1px border in #292d30, white text (#ffffff), 6px radius, 12px 16px padding. Hover increases border opacity to white. This is the signature button — never filled, never colorful.

### Nav Link Button
**Role:** Top navigation items — 'Features', 'Company', 'Resources'

Transparent background, no border, text color #f0f0f0 at 14px Inter weight 400, 0px padding. Underline or color shift on hover to #ffffff.

### Text Link with Chevron
**Role:** Inline CTAs — 'Documentation', 'Get started >'

No background, no border, white or #f0f0f0 text at 16px Inter, trailing chevron icon in same color. Restrained, terminal-like.

### Hero Announcement Pill
**Role:** 'Announcing Resend Forward >' badge above hero headline

Transparent fill, 1px border in #292d30, #f0f0f0 text at 14px Inter, 9999px (pill) radius, 6px 12px padding. Small chromatic accent chevron.

### Section Card
**Role:** Content cards in feature sections and testimonial grid

Black background (#000000), 1px border in #292d30, 16px radius, 32px padding, no shadow. Cards rely on the border to separate from the black canvas.

### Testimonial Card
**Role:** Customer quote cards in 'Beyond expectations' section

Black background, 1px #292d30 border, 16px radius, 24px padding. Contains quoted text at 16px Inter, avatar (32px circle), name at 14px weight 500 in #f0f0f0, role/title in #a1a4a5.

### Code Block / Terminal Window
**Role:** Developer-facing code snippets and API examples

Black background, 1px #292d30 border, 16px radius, Commit Mono at 12-14px. Syntax highlighting uses #9281f7 for strings/keywords, #3b9eff for filenames, #3ad389 for success values, #ff9592 for errors. Optional traffic-light dots in top-left for terminal aesthetic.

### Logo Grid
**Role:** Customer logos — Warner Bros, Max, Raycast, etc.

Inline-display logos at their native colors on black canvas, centered in a 4-column grid with 60px row gap. No card wrappers, no labels — just the marks breathing against black.

### Status Indicator Dot
**Role:** Email event status — delivered, opened, clicked, bounced, complained

2-3px diameter filled dot, no border, paired with label text in Commit Mono. Colors map to semantics: #3ad389 delivered, #70b8ff opened, #baa7ff clicked, #ff9592 bounced, #ffca16 complained.

### Email Address Badge
**Role:** 'from:' addresses in code samples and UI

No background, Commit Mono at 12-14px, text color #9281f7 (Iris Violet). The violet-on-black makes email identifiers the most readable code element — a deliberate developer-UX choice.

### Icon Container
**Role:** Rounded-square containers for app icons in integrations grid

32x32 or 48x48 rounded square (16px radius), subtle gradient fill (oklab violet→magenta), white or violet stroke icon inside. Creates the only chromatic surface on the page.

### 3D Hero Cube
**Role:** WebGL-rendered black geometric cube in hero

Full-opacity black cube with subtle edge highlights in #292d30, rotating slowly. No glow, no color — a sculptural object that anchors the right side of the hero against the black canvas.

### Footer Link Row
**Role:** Minimal footer with two text links

Two text links ('Privacy', 'Terms') at 14px Inter in #a1a4a5, separated by space, no decorative elements. Footer is intentionally minimal — no logo, no columns.

## Do's and Don'ts

### Do
- Use pure #000000 as the page canvas — never off-black or tinted dark grays for the background.
- Separate all UI layers with 1px borders in #292d30, not shadows. Cards, inputs, code blocks all rely on hairline borders against the black canvas.
- Use Commit Mono for any code, email address, or developer-facing string. Keep Inter for prose and UI chrome.
- Keep buttons ghost/outlined: transparent fill, 1px border, white text. Never use a filled colorful button as the primary CTA.
- Use 6px radius for buttons, badges, inputs. Use 16px radius for cards and code windows. Never mix — the radius scale is two values.
- Let Iris Violet (#9281f7) mark code strings and developer identifiers. It is the only brand color and should feel like syntax highlighting, not decoration.
- Apply tight -0.05em letter-spacing at 56px display sizes and -0.01em at 96px hero sizes. The compressed tracking is what makes the headlines feel confident.

### Don't
- Don't add gradients, glows, or chromatic washes to the hero or section backgrounds. The canvas is flat black.
- Don't use filled accent-color buttons (blue, violet, green) as primary actions. Buttons stay ghost or white-text-on-black.
- Don't use multiple border radii on a single surface. Cards are 16px, buttons/badges/inputs are 6px — pick one per component.
- Don't introduce colored card backgrounds. Cards sit on black with hairline borders; no #292d30 fills.
- Don't use shadows for elevation. The design relies on 1px borders and subtle backdrop blurs, not drop shadows.
- Don't pair Iris Violet with large type as a decorative heading color. It belongs to code and developer identifiers only.
- Don't break the monochrome-with-one-violet discipline by adding multiple accent hues to UI chrome. The status colors (green, blue, red, amber) are reserved for data/status indicators.

## Elevation

Elevation is achieved through 1px hairline borders (#292d30) against a flat black canvas, never through drop shadows. The only shadow token in active use is a faint 1px ring (rgba(176, 199, 217, 0.145)) on icon containers, used sparingly to suggest a subtle light source rather than depth.

## Surfaces

- **Void** (`#000000`) — Primary page canvas, full-bleed black
- **Graphite** (`#292d30`) — Hairline borders defining card and input surfaces against the void
- **Surface Lift** (`#0b0e14`) — Elevated panels and overlay scrims via subtle gradient
- **Backdrop Blur** (`#000000f2`) — Modal and navigation overlays with blur(25px)

## Imagery

Imagery is almost entirely WebGL-rendered 3D objects (black cube in hero, rotating geometric forms) and inline product UI screenshots shown inside dark code windows. No photography, no illustrations, no lifestyle imagery. Logos in the trust bar are inline SVGs at native colors. Icons are 1px-1.5px stroke outlines in #f0f0f0 or #a1a4a5. The visual language is: black canvas, 3D object as hero anchor, dark code windows as product proof, white SVG logos as social proof. Nothing decorative — every visual element is either structural (cube) or demonstrative (code window, logo).

## Similar Brands

- **Linear** — Same black-canvas, hairline-border aesthetic with restrained chromatic accents and sharp typography
- **Vercel** — Near-identical pure-black backgrounds with white typography and minimal border-based elevation
- **Plaid** — Dark-mode developer-tool identity with monospaced code emphasis and single-accent palette
- **Railway** — Black canvas with terminal-style code windows as the primary product showcase
- **Stripe (dark mode)** — Editorially confident display type on black with hairline borders and ghost buttons
