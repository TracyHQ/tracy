# Arc — Style Reference
> Scalloped editorial playground

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Arc's site reads like a warm editorial spread sliced with a craft-paper cutter: vanilla cream canvases, scalloped section edges that ripple between every band, and a single vivid violet that floods large blocks like a color-soaked page turn. Serif headlines (Marlin) pair with clean sans-serif UI (Inter) to create an editorial-meets-product tension, while the browser itself — not photography — is the hero, rendered as large interactive mockups with sidebar spaces, folders, and inline chat. The palette is mostly paper and ink; the violet is atmospheric punctuation rather than interactive color, and the wavy dividers do most of the personality work that shadows and gradients do on other sites.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Iris | `#3139fb` | Full-bleed section backgrounds, brand atmosphere, sidebar chrome inside the browser mockup — a single high-saturation violet floods entire bands so the page reads as editorial color blocking, not UI state |
| Deep Violet | `#2702c2` | Darker accent layer within violet sections, pressed or active states inside the brand color, secondary headings on violet — deepens the iris without shifting hue |
| Oat | `#fffadd` | Primary page canvas and hero gradient base — warm cream that reads as paper rather than screen white, the default surface everything else sits on |
| Linen | `#fffcec` | Secondary warm surface for cards, nav backgrounds, and footer — a half-step warmer than Oat, used when a layer needs to lift off the canvas without going white |
| Paper White | `#ffffff` | Pure white for browser-mockup card interiors, text on dark surfaces, and the scalloped divider ridges that separate colored bands |
| Obsidian | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Granite | `#696969` | Muted body copy, secondary descriptions, and helper text — mid-gray that recedes against Oat without disappearing |
| Olive Stone | `#595853` | Subtle secondary text and warm-leaning gray for fine print — slightly olive-shifted to harmonize with the cream canvas instead of fighting it |

## Typography

### Marlin Soft SQ — Softer variant of Marlin for nav, subheadings, and secondary display sizes (28–40px) — the rounded terminals feel friendly against Marlin's sharper display cuts
- **Substitute:** GT Sectra Soft, Söhne Soft, or Inter Display
- **Weights:** 500, 700
- **Sizes:** 14px, 16px, 28px, 40px, 46px
- **Line height:** 0.93, 0.98, 1.07, 1.10, 1.20
- **Letter spacing:** -0.05em, -0.04em, -0.02em

### Marlin — Primary display serif for hero headlines and large editorial pull-quotes at 46px; weight 400 for body 16px — the contrast between hairline serif body and heavy serif display is the site's typographic signature
- **Substitute:** GT Sectra, Tiempos Headline, or DM Serif Display
- **Weights:** 400, 700, 800
- **Sizes:** 16px, 46px
- **Line height:** 0.93, 1.20
- **Letter spacing:** -0.04em

### InterVariable — UI text, labels, and interface annotations — the workhorse sans for everything inside the browser mockup and supporting copy around the page
- **Substitute:** Inter, Söhne, or General Sans
- **Weights:** 500, 600, 700
- **Sizes:** 12px, 17px
- **Line height:** 1.20, 1.50
- **Letter spacing:** 0.033em

### ABC Favorit Mono — Micro-labels, tags, and category markers at 12px with wide tracking (up to 0.15em) — the monospaced rhythm breaks the serif/sans pattern and signals 'metadata'
- **Substitute:** JetBrains Mono, ABC Diatype Mono, or IBM Plex Mono
- **Weights:** 400, 700
- **Sizes:** 12px
- **Line height:** 1.20
- **Letter spacing:** 0.033em, 0.05em, 0.15em

### ABC Oracle — Secondary serif body at 20–24px for longer descriptive paragraphs that sit between the Marlin display headlines — bridges display and UI without switching families
- **Substitute:** ABC Diatype, Source Serif, or Tiempos Text
- **Weights:** 400
- **Sizes:** 20px, 24px
- **Line height:** 1.20
- **Letter spacing:** normal

### Exposure VAR — Tight display headline at 36px with 1.0 line-height — used sparingly for emphasis where a more compressed cut is needed than Marlin provides
- **Substitute:** ABC Diatype Display Tight, Druk, or Söhne Breit
- **Weights:** 700
- **Sizes:** 36px
- **Line height:** 1.00
- **Letter spacing:** -0.02em

### -apple-system — -apple-system — detected in extracted data but not described by AI
- **Weights:** 600
- **Sizes:** 14px
- **Line height:** 2.07
- **Letter spacing:** -0.01

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0.4px |
| body-sm | — | — | 14px | 1.2 | -0.14px |
| heading-sm | — | — | 24px | 1.2 | 0px |
| heading | — | — | 28px | 1.1 | -0.56px |
| heading-lg | — | — | 40px | 1.07 | -1.6px |
| display | — | — | 46px | 0.98 | -2.3px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48px
- **Card padding:** 24px
- **Element gap:** 24px

### Border Radius

- **nav:** 8px
- **cards:** 8px
- **links:** 4px
- **pills:** 22px
- **buttons:** 8px

## Components

### Scalloped Section Divider
**Role:** The signature boundary between every colored band

Wavy scalloped edge that separates sections — rendered as a series of semicircular cutouts along the bottom of each band, creating a craft-paper or stamp-edge effect. Color is Paper White (#ffffff) when bridging a violet section, or Oat (#fffadd) when bridging a cream section. The scallops are uniform circles, approximately 16–20px diameter, creating a repeating rhythm that replaces the standard hard edge. This is the single most distinctive visual element on the site.

### Dark CTA Button
**Role:** Primary call-to-action — the 'Try Dia' button

Obsidian (#000000) fill with Paper White (#ffffff) text, 8px border-radius, shadow rgba(0,0,0,0.1) 0px 5px 5px 0px. Horizontal padding 16px, vertical padding 10px. Includes a small Arc rainbow icon to the left of the label and a right-arrow after the text. Font: Marlin Soft SQ 500 at 14px. The dark button against the cream canvas creates strong contrast without needing chromatic color.

### Top Navigation Bar
**Role:** Sticky header across all sections

Sits on top of the Electric Iris (#3139fb) band. Transparent or Linen (#fffcec) background with no visible border. Left: Arc rainbow icon. Center/right: nav links (Max, Mobile, Developers, Students, Blog) in Paper White, 14px, with small arrow icons. Horizontal padding 32px. The nav maintains the same scalloped bottom edge that defines the rest of the site.

### Browser Product Mockup
**Role:** Hero visual — the Arc browser rendered as a large interactive element

Full browser window with traffic-light buttons (red/yellow/green circles), URL bar showing 'Dia — New Chat', and a split layout: left sidebar for spaces/folders, right content area. Window has 8px radius, subtle shadow rgba(0,0,0,0.25) 0px 2px 8px 0px. Internal surfaces use Paper White (#ffffff) on Linen (#fffcec) sidebar. This mockup replaces product photography as the primary visual.

### Browser Sidebar
**Role:** Left-rail navigation within the browser mockup

Linen (#fffcec) background, 8px radius on interactive items. Contains space tabs (small icon + label) and folder items. Active space has Obsidian (#000000) text and bold weight; inactive items use Granite (#696969). 12px Inter Variable 500 for labels. Vertical padding 8px between items. The sidebar changes background color per section — Linen in cream sections, Electric Iris in violet sections.

### Space Tab
**Role:** Individual space or folder item in the browser sidebar

Small icon (Gmail, Calendar, etc.) + label. 8px radius, 10px horizontal padding, 8px vertical padding. Inactive: Granite text, transparent background. Active: Obsidian text, Paper White background with subtle border. The icon is a brand-colored thumbnail — a saturated miniature of the service's visual identity.

### Chat Bubble — User
**Role:** User-typed message in the AI chat interface

Electric Iris (#3139fb) background with Paper White (#ffffff) text, 22px border-radius (pill shape). Font: Inter Variable 500 at 16px, line-height 1.50. Right-aligned. Padding 12px 20px. The vivid violet against the white content area makes the user's message pop without needing an avatar.

### Chat Bubble — AI Response
**Role:** AI-generated response in the chat interface

No background fill — sits directly on Paper White (#ffffff). Text in Obsidian (#000000), 16px Marlin Soft SQ 500, line-height 1.20. Left-aligned. A small 'Thought for 5 seconds' meta-label in Granite (#696969) at 12px sits above. Bold inline emphasis on key phrases.

### Workspace Panel (Violet Section Sidebar)
**Role:** Left navigation inside the violet brand section

Solid Electric Iris (#3139fb) background. Space icons in Paper White at 40×40px with 8px radius. Section headers ('Work', 'Personal') in Paper White at 12px, letter-spacing 0.033em. Folder items below in Paper White at 14px. The active workspace (e.g., 'onetwothree') has a Paper White pill background with Electric Iris text — inverted contrast.

### Testimonial Marquee Strip
**Role:** Horizontal scrolling press quotes at the bottom of sections

Full-width band on Paper White (#ffffff) background. Quote text in Obsidian (#000000) at 17px Marlin Soft SQ 500. Source attribution (Bloomberg, Inverse, Inc.) in Granite (#696969) with a closing quotation mark. Separated by bullet points. The strip auto-scrolls horizontally and sits between scalloped dividers.

### Category Micro-Label
**Role:** Monospaced tag or category marker

ABC Favorit Mono 400 at 12px, letter-spacing 0.15em (wide tracking), uppercase. Text in Obsidian (#000000) or Paper White (#ffffff) depending on background. No background fill — just tracked text that signals 'metadata' or 'category'. Used sparingly to label sections without creating visual weight.

### Hero Gradient Banner
**Role:** The cream-to-pink gradient behind the hero headline

Soft horizontal gradient from Oat (#fffadd) on the left through a very pale pink/lavender to a slightly cooler cream on the right. Applied as the hero section background. The gradient is subtle — the warm-to-cool shift is felt more than seen. Below the headline sits the Dark CTA Button centered.

## Do's and Don'ts

### Do
- Use the scalloped divider as the boundary between every colored section — never a hard horizontal line or thin border
- Set display headlines at 46px Marlin 400/700/800 with letter-spacing -2.3px; the tight tracking on the serif is what makes the editorial voice work
- Use Electric Iris (#3139fb) for full-bleed section backgrounds only — never for text, icons, or small UI elements
- Pair serif headlines (Marlin) with sans-serif UI (Inter Variable) — the typographic contrast carries the editorial-meets-product tension
- Default to 8px border-radius for cards, buttons, and nav items; reach for 22px only for pill-shaped chat bubbles and the occasional tag
- Use ABC Favorit Mono at 12px with 0.15em tracking for micro-labels and category markers — the wide tracking on mono breaks the serif/sans pattern and signals metadata
- Keep shadows minimal: rgba(0,0,0,0.1) 0px 5px 5px 0px for buttons, rgba(0,0,0,0.25) 0px 2px 8px 0px for elevated mockups — let the scalloped dividers and color blocking do the spatial work

### Don't
- Don't use Electric Iris (#3139fb) for CTA buttons or interactive accents — it's atmospheric, not interactive; buttons stay dark
- Don't add gradients to UI components — the site has no detected gradients; the only gradient is the hero cream-to-pink wash
- Don't use 0px or 4px border-radius on cards or buttons — the minimum visible radius is 8px; sharp corners break the craft-paper feel
- Don't pair two serif families on the same line — Marlin and Marlin Soft SQ are the only serifs; mixing with ABC Oracle is fine for body but never two display serifs
- Don't use bright white (#ffffff) as the page canvas — the warm Oat (#fffadd) cream is the default; white is reserved for mockup interiors and scalloped ridges
- Don't apply heavy drop shadows to text or small elements — shadows appear only on buttons and the browser mockup window
- Don't replace the scalloped dividers with SVG waves, diagonal cuts, or straight lines — the semicircular scallop rhythm is the site's single most recognizable feature

## Elevation

- **Dark CTA Button:** `rgba(0, 0, 0, 0.1) 0px 5px 5px 0px`
- **Browser Product Mockup:** `rgba(0, 0, 0, 0.25) 0px 2px 8px 0px`

## Surfaces

- **Oat Canvas** (`#fffadd`) — Default page background; warm cream reads as paper
- **Linen Card** (`#fffcec`) — Secondary surface that lifts off the canvas with a half-step warmer tone
- **Paper White** (`#ffffff`) — Pure white for browser-mockup card interiors and scalloped divider ridges
- **Electric Iris Band** (`#3139fb`) — Full-bleed brand section background — atmospheric color blocking
- **Deep Violet Layer** (`#2702c2`) — Deeper accent within violet sections for hierarchy

## Imagery

The browser product mockup IS the imagery. No product photography, no lifestyle shots, no illustration — the Arc browser rendered as a large interactive window (traffic lights, URL bar, sidebar spaces, inline chat) is the primary visual on every section. Within the mockup, real content fills the viewport: a flower photograph in MMMHome, an architectural blueprint in the violet section, a calendar/event card. These are screen-captured UI states, not staged photos. The mockup is full-width, sits on the section's colored background, and casts a single soft shadow. No icons system visible — the product IS the icon.

## Layout

Full-bleed colored bands stack vertically with scalloped transitions between each. The page is not a single scrollable canvas with sections — it's a sequence of color-blocked plates (cream → violet → cream → violet) that each feel like a page turn. Within each band, content is max-width ~1200px and centered. The hero is a centered headline stack (h1 + subtext + CTA) over a cream gradient with a large browser mockup below. Violet sections split into a left workspace sidebar (250–300px) and a right content area showing the full browser viewport. The scalloped edge runs the full width at the bottom of every band, creating a continuous wavy rhythm down the page. Navigation is a minimal top bar that persists across all sections, sitting on the first violet band.

## Similar Brands

- **Notion** — Same warm cream canvas with playful editorial layouts, serif-meets-sans typography pairing, and minimal use of shadow
- **Figma** — Same product-as-hero approach where the app interface replaces photography, paired with bold single-color section blocks
- **Linear** — Same tight letter-spacing on display headings and commitment to a single vivid accent color for atmospheric depth
- **Gumroad** — Same craft-paper warmth, playful irregular section boundaries, and willingness to break clean-SaaS conventions
- **Stripe** — Same editorial typography discipline — serif display headlines paired with clean sans body, high contrast, generous spacing
