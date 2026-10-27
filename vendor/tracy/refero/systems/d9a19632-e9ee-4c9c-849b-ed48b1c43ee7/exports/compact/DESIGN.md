# Nuxt — Style Reference
> terminal glow in deep space. Build dark, contained interface planes where green appears as a switched-on signal against blue-black surfaces.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Nuxt — terminal-lit framework workshop. The site holds a near-black blue canvas beneath a thin, glassy header, then punctuates documentation-like density with white display type and electric #00dc82 green. Large 72px and 48px Public Sans headlines are tightly tracked and bluntly bold, while compact feature copy, hairline outlines, code panes, and quiet muted-blue navigation keep the page grounded in a developer tool rather than a promotional poster.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Canvas | `#020618` | Page background, header field, dark controls, command surfaces |
| Midnight Panel | `#080e21` | Card surfaces, code-editor body, contained product panels |
| Deep Slate | `#0f172b` | Selected dark tabs, secondary dark buttons, inset control surfaces |
| Steel Outline | `#1d293d` | Hairline card outlines, image frames, dark raised button fills |
| Blue Steel | `#314158` | Inset control rings, subdued control borders, navigation separators |
| Muted Fog | `#90a1b9` | Body copy, inactive navigation, secondary labels, supporting metadata |
| Pale Frost | `#e2e8f0` | High-emphasis navigation text, secondary button labels, light icon strokes |
| Signal White | `#ffffff` | Display headings, selected tab labels, inverted button fills |
| Nuxt Signal | `#00dc82` | Filled getting-started buttons, logo, release markers, highlighted display words — vivid green acts as a precise activation signal in the blue-black interface |
| Vue Link | `#42b883` | Partner-technology links and small ecosystem references |
| Vite Link | `#a156fe` | Vite ecosystem links and compact technology references |
| Nitro Link | `#fb848e` | Nitro ecosystem links and compact technology references |

## Typography

### Public Sans — The universal UI and editorial face: 16px/400 body text, 14px/500 navigation, 14px/600 section labels, 16px/500 buttons, and 48px or 72px/700 displays. The -0.025em tracking at 48px and 72px compresses the heavy display weight into framework-tool directness rather than oversized marketing softness.
- **Substitute:** Inter, Arial, sans-serif
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px, 12px, 14px, 15px, 16px, 18px, 20px, 48px, 72px
- **Line height:** 1.00, 1.14, 1.20, 1.33, 1.40, 1.43, 1.50, 1.56, 1.60, 1.71
- **Letter spacing:** -1.2px at 48px and -1.8px at 72px; normal at UI sizes

### ui-monospace — Code editor content, terminal commands, and implementation snippets; the system monospace face makes product demonstrations read as live tooling rather than decorative mockups.
- **Substitute:** SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.71
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro-label | Public Sans | 500 | 10px | 1.2 | 0px |
| caption | Public Sans | 400 | 12px | 1.33 | 0px |
| nav | Public Sans | 500 | 14px | 1.43 | 0px |
| feature-title | Public Sans | 600 | 14px | 1.43 | 0px |
| code | ui-monospace | 400 | 14px | 1.71 | 0px |
| body | Public Sans | 400 | 16px | 1.5 | 0px |
| body-strong | Public Sans | 500 | 16px | 1.5 | 0px |
| eyebrow-heading | Public Sans | 500 | 18px | 1.56 | 0px |
| section-display | Public Sans | 700 | 48px | 1 | -1.2px |
| hero-display | Public Sans | 700 | 72px | 1 | -1.8px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1440px
- **Section gap:** 64px
- **Card padding:** 12px
- **Element gap:** 8px

### Border Radius

- **tabs:** 6px
- **cards:** 8px
- **pills:** 16777200px
- **images:** 6px
- **inputs:** 6px
- **buttons:** 6px

## Components

### Global Header
**Role:** 64px-tall top navigation with brand, documentation links, utility controls, and repository count

Use a 64px-high Void Canvas #020618 bar with a 1px Steel Outline #1d293d bottom divider. Keep navigation at 14px/500 Public Sans in Muted Fog #90a1b9, reserve Pale Frost #e2e8f0 for active utility labels, and space compact groups on the 8px grid.

### Release Announcement Pill
**Role:** Small version or release-status link

Set 12px/600 Public Sans Nuxt Signal #00dc82 inside a fully pill-shaped 16777200px-radius control. Use a 6px internal rhythm and keep the treatment compact enough to sit above a hero heading.

### Nuxt Signal Button
**Role:** Filled public conversion button

Use a #00dc82 fill, 6px radius, and 8px 12px padding. Label text is 16px/500 Public Sans in Deep Slate #0f172b; do not add a drop shadow.

### White Utility Button
**Role:** High-contrast secondary public button

Use Signal White #ffffff fill with Deep Slate #0f172b text, 16px/500 Public Sans, 6px radius, and 8px 12px padding. This is the light counterweight to the green conversion button.

### Dark Outline Button
**Role:** Secondary media, navigation, or product-demo control

Use transparent or Void Canvas #020618 backing with Pale Frost #e2e8f0 text, a 1px inset Blue Steel #314158 ring, 6px radius, and 6px 10px padding. Maintain 16px/500 Public Sans for labeled controls.

### Ghost Navigation Control
**Role:** Low-emphasis text control for inactive nav and tab choices

Use transparent background, Muted Fog #90a1b9 text, 4px radius, and no added padding beyond its navigation layout. Keep labels at 14px/500 Public Sans and separate adjacent items by 16px or 24px.

### Editor Demonstration Panel
**Role:** Contained product showcase with a tab rail, file tree, and code area

Build the outer panel on Midnight Panel #080e21 with an 8px radius and 1px Steel Outline #1d293d ring. Use Deep Slate #0f172b for the selected file row, Signal White #ffffff for selected labels, Muted Fog #90a1b9 for inactive tabs, and 14px/400 ui-monospace for code.

### Editor Tab
**Role:** Product-demo mode selector

Use a 6px radius tab with 6px 10px padding; selected tabs sit on Deep Slate #0f172b with Signal White #ffffff text, while unselected tabs are transparent with Muted Fog #90a1b9 text.

### Module Repository Card
**Role:** Carousel item for a package, description, and repository metrics

Use Midnight Panel #080e21 with an 8px radius and a 1px Steel Outline #1d293d ring. Apply 12px internal padding, 16px/500 Pale Frost #e2e8f0 package text, 14px/400 Muted Fog #90a1b9 description text, and 8px gaps between icon, title, and metrics.

### Feature Capability Item
**Role:** Borderless feature-grid cell

Keep the cell flush to Void Canvas #020618 with no card fill or shadow. Use a small Nuxt Signal #00dc82 outline icon, a 14px/600 Pale Frost #e2e8f0 title, 14px/400 Muted Fog #90a1b9 copy, and 8px vertical separation.

### Command Snippet
**Role:** Copyable installation or terminal command

Use Void Canvas #020618 with a 1px Steel Outline #1d293d border and 6px radius. Set the command in 14px/400 ui-monospace with Pale Frost #e2e8f0 text, use 8px vertical and 12px horizontal padding, and place a compact copy icon at the trailing edge.

### Carousel Pagination Dot
**Role:** Compact state indicator below horizontal card collections

Use small circular markers on Void Canvas #020618 with 6px gaps. The active marker is Signal White #ffffff; inactive markers use Steel Outline #1d293d.

## Do's and Don'ts

### Do
- Use Void Canvas #020618 as the default page field and Midnight Panel #080e21 for contained product surfaces.
- Set display headlines in Public Sans 700 at 72px/72px or 48px/48px with -1.8px or -1.2px tracking.
- Use Nuxt Signal #00dc82 for filled getting-started actions, release markers, logo treatment, and isolated headline emphasis.
- Apply 6px radii to controls and inputs; use 8px radii for standard cards.
- Build spacing from the 4px base unit, using 8px element gaps, 12px card padding, and 64px section gaps.
- Outline panels and controls with 1px Steel Outline #1d293d or inset Blue Steel #314158 rings instead of soft cast shadows.
- Keep body and inactive navigation copy in Muted Fog #90a1b9; reserve Signal White #ffffff for headings and selected states.

### Don't
- Do not use gradients; the interface relies on flat blue-black planes and single-color green punctuation.
- Do not round controls into 9999px pills except compact release markers and badge-like status controls.
- Do not use shadows with blur or vertical offset; use the 0 0 0 1px #1d293d panel ring.
- Do not turn all buttons green; use #00dc82 only for conversion-oriented public actions and use dark or white utility variants elsewhere.
- Do not introduce large soft cards around feature-grid items; feature cells remain borderless on #020618.
- Do not set display headings at semibold weights or positive tracking; retain Public Sans 700 and -0.025em tracking.
- Do not use ecosystem link colors #42b883, #a156fe, or #fb848e as global semantic status colors.

## Elevation

Elevation is drawn as exact 1px perimeter or inset rings, never as floating blur. Panels use 0 0 0 1px #1d293d, while compact controls use 0 0 0 1px inset #314158; this keeps every surface reading like an editor pane or terminal window.

## Surfaces

- **Void Canvas** (`#020618`) — Global page field, header, dark command controls
- **Midnight Panel** (`#080e21`) — Cards, editor bodies, contained module surfaces
- **Deep Slate** (`#0f172b`) — Selected editor rows, dark button fills, inset control states
- **Steel Outline** (`#1d293d`) — Panel boundaries, image frames, subtle raised dark controls

## Imagery

The page is text- and UI-dominant, with the editor demonstration serving as the hero visual and repository cards acting as product-data tiles. Graphics are contained rather than full-bleed: dark framed panes, small monochrome or green line icons, and compact code syntax sit on blue-black fields. There is no lifestyle photography, illustration, or decorative gradient atmosphere; visual space is allocated to real interface anatomy, file trees, tabs, command snippets, and metrics.

## Layout

The page is a full-width, blue-black documentation-marketing composition within a 1440px container system. A fixed-feeling 64px top bar runs across the canvas; the hero below uses a left-aligned text block and right-aligned editor demonstration, with a release pill above the 72px display and a small command line below the action row. Subsequent sections are separated by thin horizontal rules and broad 64px vertical rhythm: a left-aligned 48px heading introduces a four-column feature grid, then a left-aligned modules introduction leads into a three-card horizontal carousel with centered pagination dots. Content stays compact inside sections, with 8px and 16px local gaps, rather than alternating into large colored bands.

## Similar Brands

- **Vercel** — Dark developer-platform pages use high-contrast typography, contained product demonstrations, and hairline interface framing.
- **Astro** — Framework marketing combines oversized technical headlines with documentation-like feature grids and compact developer controls.
- **Svelte** — Open-source framework presentation uses bold product messaging alongside code and ecosystem content rather than lifestyle imagery.
- **Linear** — Dark surfaces are separated by precise low-contrast borders and sparse saturated accent color.
- **Raycast** — Product visuals are framed as dark, dense application panes with restrained navigation and compact utility controls.
