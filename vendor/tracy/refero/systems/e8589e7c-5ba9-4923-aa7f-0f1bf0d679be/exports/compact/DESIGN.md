# Campsite — Style Reference
> sunlit editorial workspace — warm cream paper with one orange stamp of intent

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Campsite is a sunlit editorial workspace — warm cream canvas, near-black Inter typography, and a single vivid orange that marks brand moments. The interface reads like a thoughtfully arranged bulletin board: compact rows, pill-shaped controls, soft 5%-black shadows, and generous breathing room between sections. Color is rationed — chromatic notes appear only in the logo, the paint-splash decorative motifs, a few tags, and semantic states. The density is compact but the layout feels open because of wide gutters and generous section padding; everything important sits on pure white cards floating just above the cream paper beneath them.

## Colors

| Name | Value | Role |
|------|-------|------|
| Campfire Orange | `#ff6b1a` | Logo badge, notification pills, and brand-punctuation moments — a single warm coral that anchors the entire palette against the cream canvas |
| Ember Brown | `#451a03` | Deep brown accent for paint-splash illustration shadows and inline highlight text in testimonials |
| Sunlit Cream | `#fef3c7` | Soft warm wash behind tags, badges, and inline highlights |
| Forest Pulse | `#22c55e` | Green supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Ember Alert | `#ef4444` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Midnight Ink | `#171717` | Primary text, headings, icon strokes, and dark filled buttons |
| Paper White | `#ffffff` | Card surfaces, elevated panels, and the top of the surface stack |
| Parchment | `#fffdf9` | Page canvas — a barely-warm off-white that gives the whole site its sunlit feel |
| Fog Gray | `#f5f5f5` | Muted backgrounds, secondary surface fills, and input field chrome |
| Linen | `#f0f0f0` | Subtle dividers, hover wash on rows, and tag backgrounds |
| Ash Gray | `#a3a3a3` | Muted helper text, placeholder copy, and disabled labels |
| Slate | `#737373` | Secondary text, timestamps, and metadata in lists |
| Graphite | `#525252` | Tertiary text and muted icon strokes |
| Stone | `#8f7668` | Warm muted accent for body copy that should feel quieter than Midnight Ink |

## Typography

### Inter — Sole typeface across UI, headings, and body — no display or serif counterpart. The single-family commitment is deliberate: Inter's geometric neutrality keeps focus on content, and the three-weight range (400 body, 500 metadata, 600 display) carries all hierarchy.
- **Substitute:** Inter Tight or IBM Plex Sans
- **Weights:** 400, 500, 600
- **Sizes:** 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 29, 58
- **Line height:** 1.00–1.80
- **Letter spacing:** -1.8px at 58px display, -0.52px at 29px heading, -0.37px at 22px subheading, +0.25px at 10–12px captions
- **OpenType features:** `"ss01" on, "cv11" on`

### ui-monospace — Inline code fragments and keyboard shortcuts inside the feed
- **Substitute:** JetBrains Mono or IBM Plex Mono
- **Weights:** 400, 600
- **Sizes:** 12
- **Line height:** 1.00

### emoji — emoji — detected in extracted data but not described by AI
- **Weights:** 500, 600
- **Sizes:** 12px, 14px
- **Line height:** 1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | 0.3px |
| body | — | — | 15px | 1.5 | — |
| subheading | — | — | 18px | 1.56 | — |
| heading-sm | — | — | 22px | 1.4 | -0.37px |
| heading | — | — | 29px | 1.2 | -0.52px |
| display | — | — | 58px | 1 | -1.8px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 16-24px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 8-12px
- **pills:** 9999px
- **inputs:** 8px
- **avatars:** 9999px
- **buttons:** 9999px

## Components

### Brand Logo Badge
**Role:** Persistent brand mark in the top-left of every page

28px rounded square (radius 8px) filled with Campfire Orange (#ff6b1a), white 'C' glyph at 16px Inter weight 600 centered inside. Acts as the home button.

### Notification Pill Banner
**Role:** Headline-area announcement strip

Inline pill, 9999px radius, 8px 16px padding, Campfire Orange fill, white text at 13px Inter weight 500. Optional leading 'NEW' tag in a 2-tone orange + dot indicator. Sits above the hero headline.

### Hero Headline
**Role:** First-screen page title

58px Inter weight 600 in Midnight Ink, centered, line-height 1.00, letter-spacing -1.8px. Two short lines max. Followed by a 17–18px Inter weight 400 subtitle in Slate (#737373), centered.

### Section Heading
**Role:** Inter-section title in marketing pages

29px Inter weight 600 Midnight Ink, centered, line-height 1.20, letter-spacing -0.52px. One to two lines.

### Filled Pill Button
**Role:** Primary interactive action

9999px radius, 8px 16px padding, Midnight Ink background, white text at 14px Inter weight 500. No border. Soft inset highlight from the elevation stack to suggest a tactile surface.

### Ghost Pill Button
**Role:** Secondary action / link-style button

9999px radius, 8px 16px padding, transparent background, 1px Linen (#f0f0f0) border, Slate text. On hover: Fog Gray wash.

### App Preview Frame
**Role:** Wrapping frame around product screenshots in marketing

White surface, 12px radius, subtle 5%-black shadow stack from the elevation set, optional browser-chrome header (traffic-light dots, title text) at top. Acts as the visual proof artifact for each feature.

### Sidebar Nav Item
**Role:** Navigation row inside the product app

Compact row, 8px 12px padding, small 16px icon in Slate, 14px Inter weight 500 label in Midnight Ink. Active state: Fog Gray fill, Midnight Ink icon. 9999px radius to match the pill language.

### Post List Item
**Role:** Single row inside the main feed

White card surface, 16px padding, 12px radius. Left: 24px avatar (9999px, colored fill or image). Center: author name 14px Inter weight 600, body 14px weight 400 in Midnight Ink. Right: tag pill (9999px, Sunlit Cream fill, Ember Brown text) and timestamp in Ash Gray.

### Channel Card
**Role:** Discoverable team space tile in the channels section

White card, 12px radius, 16px padding, 1px Linen border. Title 18px Inter weight 600, member avatars stacked (16px, 9999px), and a ghost pill CTA in the corner with a small icon.

### Tag / Status Pill
**Role:** Inline metadata badge

9999px radius, 4px 10px padding, 12px Inter weight 500. Variants: Sunlit Cream fill with Ember Brown text, Forest Pulse fill with white text for success, Ember Alert fill with white text for error.

### Search Input
**Role:** People and content search field

Full-width input, 8px radius, 8px 12px padding, Fog Gray fill, Ash Gray placeholder at 14px Inter weight 400. No visible border — the fill is the chrome. Leading 16px search icon in Ash Gray.

### People List Item
**Role:** Right-rail entry showing a person in the app

32px avatar (9999px), 14px Inter weight 500 name in Midnight Ink, 12px Inter weight 400 status in Ash Gray. 8px 12px padding, no card chrome — sits directly on the Fog Gray panel.

### Testimonial Block
**Role:** Pull-quote between feature sections

Left-aligned body copy at 17px Inter weight 400 in Midnight Ink, with the brand-defining sentence set in Inter weight 600 in Ember Brown. Attribution row below: 24px avatar + 13px Inter weight 500 name in Slate, 12px role in Ash Gray.

### Decorative Paint Splash
**Role:** Page-edge ornamental motif

Organic orange + Ember Brown splatter illustration clipped to the far left/right of the viewport on the hero and mid-page sections. Pure decoration — never carries content, never overlaps text. Anchors the 'creative workspace' mood.

## Do's and Don'ts

### Do
- Use 9999px radius for every interactive element — buttons, tags, avatars, and pills all share the same full-curve language
- Set hero headlines at 58px Inter weight 600 with -1.8px letter-spacing so the type settles into a confident, compressed silhouette
- Layer surfaces as Parchment (#fffdf9) canvas → Paper White (#ffffff) card → Fog Gray (#f5f5f5) inset — never use pure gray borders to separate layers
- Reserve Campfire Orange (#ff6b1a) for logo, notification pills, and one or two brand moments per page — never use it for routine CTAs
- Keep the 4px base unit: use 8px for element gaps, 12–16px for card padding, 64–80px for section gaps
- Apply the soft 5%-black shadow stack to any card that floats above another surface — inset highlight shadows belong only on filled buttons
- Use Inter weight 600 for all display sizes and weight 500 for metadata, never let body copy go above weight 400

### Don't
- Don't introduce a second typeface — the single-family Inter system is the design, not a limitation to work around
- Don't add blue, purple, or any cool chromatic accent — the palette is intentionally warm-only, and a cool note would break the cream-paper mood
- Don't use hard 1px gray borders to separate cards from the canvas — the warm off-white background already does the work
- Don't use Campfire Orange for everyday buttons, links, or icon states — chromatic color is rationed to brand punctuation only
- Don't set headlines above 60px or below 22px without a structural reason — the 22/29/58 scale carries the rhythm
- Don't use sharp 0px or 2px radii on surfaces — the 8–12px range is what makes the cards feel like paper, not glass
- Don't place photography or lifestyle imagery inside the marketing flow — paint splashes and product screenshots are the only visual registers

## Elevation

- **Card / surface elevation:** `0 3px 6px -3px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05), 0 1px 2px -1px rgba(0,0,0,0.05), 0 1px 1px -1px rgba(0,0,0,0.05), 0 1px 0 -1px rgba(0,0,0,0.05)`
- **Filled button / interactive inset:** `0 1px 1px -1px rgba(0,0,0,0.08), 0 2px 2px -1px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06), inset 0 1px 0 #fff, inset 0 1px 2px 1px #fff, inset 0 1px 2px 0 rgba(0,0,0,0.06)`
- **Subtle row / chip:** `0 1px 2px 0 rgba(0,0,0,0.05)`

## Surfaces

- **Parchment Canvas** (`#fffdf9`) — Page background — warm off-white that absorbs the site into editorial paper
- **Paper White** (`#ffffff`) — Card surfaces and the main feed container — pure white lifts content above the canvas
- **Fog Gray** (`#f5f5f5`) — Hover states, secondary panels, and the inside of the people sidebar
- **Sunlit Cream** (`#fef3c7`) — Occasional warm wash for highlighted tags and inline callouts

## Imagery

Imagery is split into three strict registers and nothing else. (1) Decorative paint-splash illustrations in Campfire Orange and Ember Brown clipped to the far left and right of the viewport on hero and mid-page sections — organic, asymmetric, never overlapping text, never carrying meaning. (2) Product screenshots wrapped in a white App Preview Frame with optional browser-chrome header and soft 5%-black shadow — these are the proof artifacts for each feature and always sit centered below their section heading. (3) Avatar circles only — 24–32px, 9999px radius, either a photo or a solid color block with initials, no decorative imagery attached. There is no lifestyle photography, no stock illustration, no 3D renders. Icons throughout the UI are simple, single-weight, monochrome in Slate or Midnight Ink; the brand mark is the only place color lives.

## Layout

Marketing pages follow a centered, max-width-1200px column with generous vertical rhythm. The hero is a single centered stack: notification pill → 58px headline → 17px subtitle → App Preview Frame screenshot, with Campfire Orange paint-splash motifs bleeding off the left and right edges of the viewport. Below the hero, sections alternate between two patterns: a centered section heading followed by an App Preview Frame, and a centered heading followed by a Testimonial Block. All sections use 64–80px vertical padding. The product app itself uses a three-column shell: a compact left sidebar (icons + labels, Fog Gray hover), a white main feed, and a right-side people/online panel on Fog Gray. Navigation is a minimal top bar with right-aligned text links — no dropdowns, no mega-menu, no sticky behavior on marketing pages.

## Similar Brands

- **Notion** — Same warm cream canvas with near-black Inter typography and rationed color use; both treat white cards as paper floating on a slightly warm page
- **Basecamp** — Team-communication product with a similar warm, editorial tone; flat surfaces, compact list rows, and pill-shaped controls over a muted background
- **Linear** — Inter-only typography system with tight letter-spacing on display sizes and a compact, list-driven UI rhythm
- **Coda** — Collaborative workspace that pairs warm off-white surfaces with single-accent brand moments and pill-shaped chips
- **Read.cv** — Editorial product voice with cream backgrounds, Inter typography, and orange as the singular brand color reserved for punctuation moments
