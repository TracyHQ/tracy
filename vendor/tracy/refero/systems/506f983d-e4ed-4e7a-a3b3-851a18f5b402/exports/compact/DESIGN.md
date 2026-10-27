# Featurebase — Style Reference
> Violet-lit support console. Build each page as a dark, quiet stage with a luminous product workspace emerging from the lower edge.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Featurebase is a near-black product stage where dense support-software screenshots sit beneath restrained white typography. The interface uses flat charcoal surface layers, hairline blue-gray borders, and white filled conversion controls; saturated violet is reserved for logo marks, product-state icons, and the glow framing demos. Inter at medium weights keeps navigation and controls compact, while 48px and 36px headings use slight negative tracking to make the page feel composed rather than oversized.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Canvas | `#050608` | Page backgrounds and uninterrupted full-bleed section canvas |
| Ink Surface | `#0a0b0f` | Inset page regions, dark filled controls, and low-level card surfaces |
| Charcoal Panel | `#0f1219` | Product-demo panels, card fills, dark text on white controls, and structural borders |
| Steel Panel | `#151822` | Raised dark controls and secondary panel layers |
| Slate Edge | `#1f1e2a` | Fine borders around dark demo panes, tabs, and outlined controls |
| Cloud White | `#ffffff` | High-emphasis headings, icons, filled action surfaces, and logo marks |
| Frost Text | `#dee1ea` | Lead paragraphs and lower-emphasis navigation text |
| Misted Slate | `#b2b8cd` | Muted body copy, inactive tabs, secondary links, and product-interface labels |
| Quiet Slate | `#8f94a6` | Metadata, subdued icons, and tertiary product-interface text |
| Signal Violet | `#7064f2` | Brand symbol, selected product icons, and violet light sources — a narrowly deployed signal against the black canvas |
| Violet Atmosphere | `linear-gradient(to right, rgba(145, 130, 248, 0.1), rgba(192, 132, 252, 0.1), rgba(145, 130, 248, 0.1))` | Soft demo-edge illumination and decorative feature-section washes |
| Slate Lift | `linear-gradient(to top, rgba(93, 104, 144, 0.15), rgba(93, 104, 144, 0.1), rgba(0, 0, 0, 0))` | Subtle upward background haze behind contained product visuals |

## Typography

### Inter — Use throughout. Weight 500 carries navigation, labels, and display headings; 400 carries explanatory copy; 600 is reserved for compact feature titles and high-emphasis white controls. The 500-weight 48px display treatment is intentionally quieter than a 700-weight marketing headline.
- **Substitute:** Arial, sans-serif
- **Weights:** 400, 500, 600, 700
- **Sizes:** 13px, 14px, 15px, 16px, 18px, 19px, 20px, 23px, 24px, 36px, 48px
- **Line height:** 1.11, 1.25, 1.26, 1.33, 1.38, 1.40, 1.43, 1.50, 1.56, 1.63
- **Letter spacing:** -0.96px at 48px and -0.72px at 36px; normal at 14-23px; 0.7px at selected 14px labels

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | Inter | 500 | 13px | 1.5 | 0px |
| nav | Inter | 500 | 14px | 1.43 | 0px |
| body | Inter | 400 | 16px | 1.5 | 0px |
| feature-heading | Inter | 600 | 18px | 1.56 | 0px |
| lead | Inter | 400 | 23px | 1.5 | 0px |
| section-heading | Inter | 500 | 36px | 1.11 | -0.72px |
| display | Inter | 500 | 48px | 1.38 | -0.96px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Section gap:** 24px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **cards:** 16px
- **links:** 12px
- **pills:** 9999px
- **badges:** 9999px
- **images:** 24px
- **inputs:** 12px
- **buttons:** 12px

## Components

### Public Navigation Bar
**Role:** Top-level public-site navigation

Use a transparent full-width bar over Void Canvas. Set nav items in Inter 14px/500 with 20px line height, Frost Text or Cloud White, 16px vertical and 24px horizontal padding, and 0px radius.

### Header White Conversion Button
**Role:** High-emphasis public navigation conversion control

Fill with rgba(255,255,255,0.92), use Charcoal Panel text at Inter 14px/600, 8px vertical and 16px horizontal padding, a matching border, and 12px radius.

### Hero White Conversion Button
**Role:** Hero conversion control

Use the same rgba(255,255,255,0.92) fill and 12px radius as the header button, with Charcoal Panel text in Inter 14px/500 and 8px by 16px padding.

### Outlined Dark Demo Button
**Role:** Secondary conversion or product-demo control

Use a transparent fill, Cloud White or Frost Text label in Inter 14px/500, a 1px Slate Edge border, 12px vertical and 16px horizontal padding, and 12px radius.

### Hiring Announcement Pill
**Role:** Small promotional link above a display heading

Use Ink Surface with a 1px Slate Edge border, Inter 14px/500 muted text, 9999px radius, and compact 6px to 8px internal spacing. Keep the treatment low-contrast rather than turning it into a white action.

### Product Workspace Frame
**Role:** Contained support-platform product showcase

Build a Charcoal Panel workspace with 16px radius and a 1px Slate Edge border. Organize its desktop content as a left navigation rail, conversation list, central message stream, and right details panel; frame the outer edge with a restrained Signal Violet glow.

### Product Navigation Tab
**Role:** Feature-category switcher above a product demo

Use transparent dark-background tabs with Inter 16px/500 text and 24px line height. Active labels are Cloud White, inactive labels are Misted Slate; use 12px-radius tab containers and 12px by 16px padding where a tab receives a visible surface.

### Dark Feature Section Card
**Role:** Large contained feature module

Use rgba(11,12,17,0.8) over Void Canvas, 16px radius, and the compact shadow 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1). Large editorial feature cards use 80px vertical padding with horizontal content aligned to the page composition.

### Feature Text Block
**Role:** Section introduction paired with a product visual

Set the heading in Inter 36px/500, 40px line height, and -0.72px tracking in Cloud White or #f8f9fc. Follow with Frost Text body copy; separate the text block from its white action button by 16px.

### Product Conversation Card
**Role:** Message, reply, and detail regions within the workspace demo

Use Steel Panel or Charcoal Panel fills with 16px radius and 16px padding. Separate nested rows with 1px Slate Edge lines; message metadata uses Quiet Slate, while selected avatars and status marks use Signal Violet.

### Partner Logo Strip
**Role:** Customer social-proof band

Place a centered Frost Text caption above monochrome Cloud White and Misted Slate logos on Void Canvas. Keep logos unboxed and grayscale; use generous empty black space rather than card containers.

### Floating Support Launcher
**Role:** Persistent help entry point

Use a 9999px Signal Violet circular control with a Cloud White chat icon, positioned over the lower-right page edge. Add a compact dark outline or shadow so it remains separate from a product screenshot.

## Do's and Don'ts

### Do
- Use Void Canvas #050608 as the default page background and reserve Ink Surface #0a0b0f through Steel Panel #151822 for nested layers.
- Set public navigation and compact buttons in Inter 14px/500 with 20px line height.
- Use Inter 48px/500 with -0.96px tracking for the display role and Inter 36px/500 with -0.72px tracking for major section headings.
- Use rgba(255,255,255,0.92) with Charcoal Panel #0f1219 text for filled public conversion buttons.
- Apply 12px radius to buttons and inputs, 16px radius to cards and product frames, and 9999px radius to pills and circular launchers.
- Use 1px Slate Edge #1f1e2a borders to divide dark product panes and outline dark secondary controls.
- Keep Signal Violet #7064f2 concentrated in logo marks, selected states, and soft product-demo illumination.

### Don't
- Do not introduce bright colored filled conversion buttons; public filled actions remain rgba(255,255,255,0.92).
- Do not use radii below 12px for buttons or above 16px for product cards.
- Do not set display headings in 600 or 700 weight; use Inter 500 at 48px or 36px.
- Do not replace Slate Edge #1f1e2a separators with light gray or white dividers.
- Do not turn partner logos into bordered cards; keep them unboxed on Void Canvas #050608.
- Do not spread Signal Violet #7064f2 across body text, full backgrounds, or every control.
- Do not use heavy bright shadows; use the supplied black shadow stacks only on floating panels and raised links.

## Elevation

- **Inset Content Card:** `0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)`
- **Floating Product Panel:** `0 0 0 1px rgba(0, 0, 0, 0.4), 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)`
- **Raised Link Control:** `0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)`

## Surfaces

- **Void Canvas** (`#050608`) — Full-page background and wide section bands.
- **Ink Surface** (`#0a0b0f`) — Subtle inset surfaces and low-level cards.
- **Charcoal Panel** (`#0f1219`) — Product UI panels and prominent dark cards.
- **Steel Panel** (`#151822`) — Raised control and nested-panel layers.
- **Slate Edge** (`#1f1e2a`) — One-pixel dark-surface borders and panel separation.

## Imagery

The site is text-dominant and uses no lifestyle photography. Its main visual language is contained product screenshots: dark support-software interfaces with rounded 16px outer frames, fine blue-gray dividers, miniature avatars and icons, and selective violet glow around outer edges or selected controls. Product visuals function as explanatory evidence rather than decorative illustration; they occupy broad horizontal space beneath copy and retain dense, realistic interface detail. Icons are mostly small monochrome glyphs, with Signal Violet used for the brand mark, selected-state diamonds, and the floating chat launcher.

## Layout

The page is a full-bleed Void Canvas composition with a slim top navigation bar, a centered hero stack, and a product workspace visual rising from the lower hero edge. The opening screen centers the display heading, two-line lead, and paired conversion controls before a large wide demo; the demo is preceded by a horizontal feature-category tab row. Subsequent sections pair a left-aligned 36px section heading and explanatory copy with a wide contained product screenshot below or alongside it, then return to open black bands for centered social proof. The layout is spacious at page scale but product visuals are information-dense, using multi-column app-shell grids with rails, lists, message panes, and details panels. A circular support launcher persists at the lower-right edge.

## Similar Brands

- **Linear** — Dark product canvases, restrained Inter typography, thin dark-surface borders, and a tightly controlled violet accent.
- **Raycast** — Near-black marketing surfaces with bright monochrome type and product UI showcased as the principal visual.
- **Sentry** — Dark developer-tool presentation with dense dashboard screenshots framed by subtle purple illumination.
- **Canny** — Feedback-platform subject matter and UI-led marketing sections built around workflow screenshots rather than photography.
