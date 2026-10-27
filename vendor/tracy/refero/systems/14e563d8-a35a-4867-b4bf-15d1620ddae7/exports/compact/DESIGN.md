# Substack — Style Reference
> orange ink on a newsroom desk

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Substack reads like a well-worn newsroom dashboard — white canvas, warm near-black text, and one loud signal-orange that marks every act of creation. The visual hierarchy is built from density rather than decoration: thin gray rules separate feed items, avatars are small, metadata is muted, and the reader's eye is trained to find the orange CTA, the orange logo, the orange 'Subscribe' link, the orange 'Create' button. Surfaces stay flat and unbounded — no card shadows, no panel chrome — letting the typography (a compact system-ui chrome paired with a custom serif headline face) carry the editorial weight. The signature gesture is restraint in chrome and loudness in one color: a reading app that looks like a publishing tool.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Orange | `#ff6719` | Orange supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Ink | `#363737` | Primary text — body copy, headings, post titles, timestamps, author names; warm-shifted near-black instead of pure #000 for less aggressive reading |
| Paper | `#ffffff` | Page canvas, card surfaces, input fields, nav background — the dominant surface, occupying the vast majority of the interface |
| Charcoal | `#232525` | Secondary text and high-emphasis link hover state; deeper than Ink for code blocks and emphasis blocks |
| Stone | `#777777` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Ash | `#b6b6b6` | Hairline borders, button outlines, icon strokes, disabled control borders |
| Mist | `#c8c8c8` | Divider lines, subtle icon backgrounds, skeleton placeholder fills |
| Cloud | `#eeeeee` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Slate | `#5e5e5e` | Dark mode surface accent or pressed button state — infrequently used but present in the token set |
| Black | `#000000` | Icon strokes, image overlays, dark accent blocks in promo cards |

## Typography

### system-ui — Primary UI and body font — used for navigation labels, buttons, post body text, metadata, input fields, and all interface chrome. The compact 12-13px metadata and 15-19px body sizes create the dense newsroom feel. Weight 400 for body, 500 for nav items and button labels, 600 for emphasized post titles and section headers.
- **Substitute:** -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 12, 13, 15, 19, 20px
- **Line height:** 1.0–1.54

### Cahuenga — Branded display serif for product-level headings (sidebar headings, sign-up card titles, hero text). The medium weight and tight line-height give it editorial presence without feeling heavy; this is the only font that signals 'this is Substack' beyond the orange color.
- **Substitute:** Charter, 'Iowan Old Style', 'Source Serif Pro', Georgia, serif
- **Weights:** 500
- **Sizes:** 24, 32px
- **Line height:** 1.24, 1.25

### Spectral — Long-form post body serif — used inside reader views and feed post content for editorial readability. The slightly looser line-height (1.20) keeps reading paragraphs comfortable while maintaining the compact newsroom density.
- **Substitute:** Charter, 'Iowan Old Style', 'Source Serif Pro', Georgia, serif
- **Weights:** 400
- **Sizes:** 19px
- **Line height:** 1.20

### JetBrains Mono — Code blocks and inline code within posts — the slight negative tracking (-0.014em) tightens the monospace for better visual alignment with surrounding serif text.
- **Substitute:** 'Fira Code', 'Source Code Pro', Menlo, Consolas, monospace
- **Weights:** 700
- **Sizes:** 14px
- **Line height:** 1.43
- **Letter spacing:** -0.014em

### -apple-system-ui-serif — -apple-system-ui-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 20px
- **Line height:** 1.6

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.2 | — |
| body | — | — | 15px | 1.54 | — |
| subheading | — | — | 20px | 1.6 | — |
| heading-sm | — | — | 24px | 1.25 | — |
| heading | — | — | 32px | 1.24 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 32px
- **Card padding:** 20px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **inputs:** 12px
- **buttons:** 9999px

## Components

### Primary Action Button (Orange Pill)
**Role:** Filled CTA — Create, Get started, Get the app, Subscribe confirmation

Background #ff6719, white text, system-ui weight 500 at 15px, padding 8px 20px, border-radius 9999px (fully pill-shaped). Inset highlight shadow rgba(255,255,255,0.2) on top edge gives a subtle pressed-paper feel. The dominant button — every page has exactly one or two.

### Secondary Action Button (Gray Pill)
**Role:** Ghost/secondary action — Sign in, Less prominent CTAs

Background #eeeeee, text #363737, system-ui weight 500 at 15px, padding 8px 20px, border-radius 9999px. No border, no shadow — the fill alone creates the hierarchy difference from the orange primary.

### Outlined Pill Button
**Role:** Tertiary action — Learn more, alternative flows

Transparent background, border 1px solid #b6b6b6, text #363737, system-ui weight 500 at 15px, padding 8px 20px, border-radius 9999px. Sits alongside the primary button in the hero card as the non-default option.

### Left Sidebar Nav Item
**Role:** Primary navigation entries — Home, Subscriptions, Chat, Activity, Explore, Profile

Icon (20px, stroke #363737) left of label, system-ui weight 500 at 15px, text #363737, vertical padding 6px, horizontal padding 12px, border-radius 8px. Hover state adds #f5f5f5 background. Active state (Home) may add left orange bar or orange text.

### Hero Banner Card
**Role:** Featured callout — onboarding, promotions, featured publications

Teal/dark gradient background, border-radius 12px, padding 24px 32px, Cahuenga 32px heading in white, subtitle in #c8c8c8, orange primary + outlined secondary button row. This is the only gradient surface in the system.

### Feed Post Card
**Role:** Post entry in the main feed

No background or border — just vertical rhythm. Avatar 32px circle, author name (system-ui 15px weight 600 #363737) + timestamp (system-ui 13px #777777), post body text (Spectral 19px #363737), engagement row (heart/comment/share icons, count in #777777 at 13px). Cards separated by 1px #eeeeee hairline.

### Subscribe Link
**Role:** Inline call-to-action next to each post

Text only — 'Subscribe' in #ff6719, system-ui weight 500 at 15px, no underline, no button chrome. Appears at the top-right of each post card, opposite the author/timestamp row.

### Right Sidebar Recommendation Card
**Role:** Up next feed, "Log in or sign up" promo

White background, border-radius 12px, padding 20px, no shadow. Title in Cahuenga 24px #363737, body in system-ui 15px #777777, orange primary button at bottom, optional thumbnail (40px) on feed items.

### Search Input
**Role:** Top of right sidebar — search publications and posts

Full-width pill input, background #ffffff, border 1px solid #b6b6b6, border-radius 9999px, padding 8px 12px 8px 36px (left padding for search icon). Placeholder 'Search Substack' in #777777 at 13px.

### Up Next Feed Item
**Role:** Recommended reading in right sidebar

Horizontal layout: thumbnail (64px, border-radius 8px) left, text block right. Publication name in system-ui 13px weight 500 #363737, headline in system-ui 15px weight 400 #363737, metadata (read time, likes, comments) in #777777 at 12px. No card chrome — separated by 12px vertical gap.

### App Download Floating Button
**Role:** Bottom-right sticky CTA for mobile app

White background, system-ui 15px weight 500, border-radius 9999px, padding 8px 16px, subtle drop shadow rgba(0,0,0,0.1) 0px 4px 6px. The only element with a real drop shadow — signals it's floating above the page.

### Engagement Action Row
**Role:** Like, comment, share, download on each post

Inline icon + count pair, system-ui 13px #777777, 20px icons (stroke #777777), 8px gap between icon and count, 16px gap between actions. No buttons — the entire row is a tappable area.

### AI Annotation Badge
**Role:** App/integration tag on posts (e.g., 'Cursor APP 41 mins')

Small inline badge — icon (16px) + label (system-ui 13px weight 500 #363737) + timestamp (system-ui 13px #777777), separated by 8px gaps, sitting above highlighted/annotated text in the post body.

## Do's and Don'ts

### Do
- Use #ff6719 exclusively for primary action buttons, the logo, and Subscribe links — it is the only chromatic color in the system and loses all signal power if applied to decorative elements
- Pair system-ui (weight 400 body, 500 UI labels, 600 titles) with Cahuenga (24-32px, weight 500) for any page-level headings
- Use 9999px border-radius for all buttons, tags, and pill inputs; use 12px for cards and nav items; never use values outside {4, 8, 12, 9999}px
- Separate feed items with 1px #eeeeee hairlines and 32px gaps — never use card shadows or colored backgrounds to create separation
- Use #363737 for all body and heading text; reserve #000000 for icon strokes and image overlays only
- Set page max-width to 1200px with a three-column layout: ~200px left nav, ~600px center feed, ~300px right sidebar
- Size metadata at 12-13px in #777777 and body text at 15-19px — the newsroom density is a defining feature, not a bug

### Don't
- Do not introduce any chromatic color beyond #ff6719 — no blues, greens, purples, or secondary brand colors; the system is monochrome + orange
- Do not add card shadows, elevation, or panel chrome to feed items — the flat hairline-divided feed is the layout
- Do not use #000000 as a background or primary text color — use #363737 (Ink) for text warmth and #232525 (Charcoal) for emphasis
- Do not use sharp corners (0-4px) on buttons or inputs — pills (9999px) and soft rounds (8-12px) are the only radius values
- Do not use Cahuenga for body text — it is a display serif for headings only; use Spectral for long-form post bodies and system-ui for UI chrome
- Do not set body line-height below 1.4 in the UI chrome — the compact density comes from small font sizes and tight spacing, not cramped leading
- Do not use gradients on buttons, cards, or surfaces — the only gradient in the system is the teal hero banner illustration

## Elevation

- **Buttons (inset highlight):** `rgba(255, 255, 255, 0.2) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.1) 0px -1px 0px 0px inset`
- **Floating App Button:** `rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.06) 0px 2px 4px -1px`

## Surfaces

- **Canvas** (`#ffffff`) — Page background — the dominant surface
- **Recessed** (`#eeeeee`) — Secondary surface — pill button backgrounds (Sign in), input resting states, subtle hover washes
- **Divider** (`#c8c8c8`) — Hairline separators and icon placeholder backgrounds

## Imagery

Photography is user-generated content (author avatars, publication thumbnails, post images) — Substack provides no decorative photography of its own. The hero card uses a teal-to-green gradient with abstract illustration elements (geometric shapes, stylized pen/note objects) as background. Post thumbnails in the right sidebar are small (64px), contained with 8px radius, and function as reading-list previews. The overall visual language is text-dominant — the interface is a canvas for reading, with imagery serving as small visual anchors rather than atmosphere.

## Layout

Three-column desktop layout: fixed left sidebar (~200px, icon + label nav, sticky), center feed (max-width ~600px, vertically scrolling post list), fixed right sidebar (~300px, search + recommendations + sign-up). The center feed is the editorial core — no card chrome, just posts stacked with hairline dividers and 32px section gaps. Hero banner sits at the top of the feed as a single full-width card. The left sidebar contains the brand logo (orange stacked-lines mark), six nav items, and a full-width orange 'Create' button at the bottom. The right sidebar has a search input, a sign-up card, and an 'Up next' reading list. Navigation is minimal — no top bar, no breadcrumbs; the sidebar IS the nav. Content density is high: posts use 12-13px metadata and 15-19px body text, creating a newspaper-feed rhythm rather than a card-grid marketplace feel.

## Similar Brands

- **Medium** — Same editorial reading-app layout with three-column desktop structure, serif body text for long-form posts, and minimal chrome that lets content dominate
- **Twitter/X** — Same three-column feed layout with fixed sidebars, compact metadata-dense post rows, and a single accent color for primary actions (though Twitter uses blue instead of orange)
- **Pocket** — Same reading-list metaphor with right-sidebar recommendations, thumbnail + headline list items, and a flat white interface that treats typography as the primary visual asset
- **Ghost** — Same newsletter-publisher visual language with serif headlines, pill-shaped CTAs, and a monochromatic interface where one accent color carries all interactive weight
