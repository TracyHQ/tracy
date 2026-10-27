# Spotify — Style Reference
> Nocturnal jukebox control room

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Spotify's web interface is a dense, dark-mode media command center: a near-black canvas punctuated by vibrant album artwork, one signature green accent, and pill-shaped controls. Typography is compact and utilitarian — a custom geometric sans-serif at small sizes that lets album art and artist photography do the visual heavy lifting. The layout is a fixed two-column shell (sidebar + main feed) with card grids of square covers and circular avatars, creating a rhythmic alternation between geometry types. The interface avoids heavy elevation, relying on subtle surface differentiation (#121212 cards on #000000 canvas) and the one large gradient banner to inject energy. The result feels like a DJ's control room: information-dense, acoustically dark, and ready to play at a glance.

## Colors

| Name | Value | Role |
|------|-------|------|
| Spotify Green | `#1ed760` | Green supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Signal Red | `#b85850` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Void Black | `#000000` | Page canvas, top nav background, deepest surface layer |
| Carbon | `#121212` | Card surfaces, sidebar panels, secondary surface layer above canvas |
| Graphite | `#1f1f1f` | Elevated surface — hover states, input fields, selected nav items |
| Smoke | `#292929` | Active navigation background, subtle highlight wash |
| Iron | `#333333` | Input borders, subtle dividers between surface layers |
| Steel | `#535353` | Muted UI elements, secondary borders |
| Fog | `#73777c` | Muted text, secondary icon fills, inactive nav icons |
| Mist | `#b3b3b3` | Secondary text, metadata, artist names, timestamps |
| Bone | `#c5c5c5` | Input placeholder text, subtle captions |
| Pure White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Promo Gradient | `linear-gradient(90deg, rgb(175, 40, 150), rgb(80, 155, 245))` | Sign-up banner gradient endpoint — energetic blue anchor |
| Magenta Glow | `linear-gradient(90deg, rgb(175, 40, 150), rgb(80, 155, 245))` | Promotional banner gradient start — vivid pink-to-blue sweep for marketing CTAs |

## Typography

### SpotifyMixUI — Body, navigation, buttons, metadata, small labels — compact and information-dense, designed to disappear so artwork dominates
- **Substitute:** Inter, system-ui, -apple-system, sans-serif
- **Weights:** 400, 600, 700
- **Sizes:** 11, 12, 13, 14, 16
- **Line height:** 1.20, 1.33, 1.50

### SpotifyMixUITitle — Section headings ('Trending songs', 'Popular artists') — heavy bold weight at modest size keeps headlines assertive without overwhelming card grids
- **Substitute:** Inter weight 700, system-ui bold
- **Weights:** 700
- **Sizes:** 24
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.2 | — |
| body-lg | — | — | 14px | 1.33 | — |
| link | — | — | 16px | 1.2 | — |
| heading | — | — | 24px | 1.2 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Section gap:** 32-48px
- **Card padding:** 12px
- **Element gap:** 8-12px

### Border Radius

- **cards:** 6px
- **small:** 2px
- **images:** 6px
- **inputs:** 500px
- **avatars:** 500px
- **buttons:** 9999px

## Components

### Pill Button (Filled White)
**Role:** Primary conversion button — used for 'Create playlist', 'Browse podcasts', 'Sign up free'

Fully rounded (9999px radius) pill shape, white background (#ffffff), black text in SpotifyMixUI 14px weight 700, 8px vertical / 12px horizontal padding. The only filled button style — stands out as the unambiguous action on a dark surface.

### Ghost Text Button
**Role:** Secondary action — 'Log in', 'Sign up' in the top nav

No background, no border. White (#ffffff) or mist (#b3b3b3) text in SpotifyMixUI 14px weight 700, horizontal padding of 12-16px. Hover state shifts text to pure white.

### Square Album Card
**Role:** Song/trending content tile in horizontal scrollable grids

6px border-radius on the cover image. Below the image: song title in white SpotifyMixUI 14px weight 600, artist name in #b3b3b3 weight 400. Card padding 12px. Entire card sits on #121212 canvas; hover lifts to #1f1f1f background.

### Circular Artist Card
**Role:** Artist profile tile in 'Popular artists' section

Artist photo clipped to full circle (500px radius). Artist name below in white 14px weight 600, 'Artist' label in #b3b3b3 12px. No background fill on the card itself — the circle IS the visual.

### Sidebar Panel
**Role:** Left-column 'Your Library' container

#121212 background, 6px top-left and top-right radius. Internal cards (playlist/podcast prompts) at #1f1f1f with 6px radius, 12px padding. Full-height fixed left column.

### Top Navigation Bar
**Role:** Global header with search, nav arrows, and account actions

#000000 background, 8px vertical padding. Search input is 36px tall, #1f1f1f fill, 500px radius, white placeholder text. Nav arrows are circular icon buttons. Right side: text links + filled white pill for primary action.

### Section Header
**Role:** Horizontal title row above content grids ('Trending songs', 'Popular artists')

SpotifyMixUITitle 24px weight 700 white text on left, 'Show all' link in #b3b3b3 12px on right. 24px row gap to content below.

### Promotional Banner
**Role:** Sticky bottom CTA for free tier sign-up

Full-width, linear-gradient(90deg, #af2896, #509bf5) background. White headline and body text on the left, white pill button on the right. Sits at the viewport floor, always visible.

### Search Input
**Role:** Top-bar search field

#1f1f1f background, 500px border-radius (nearly circular pill). White search icon on the left, white placeholder text. 12px horizontal padding, 8px vertical.

### Navigation Arrow Button
**Role:** Browser-style back/forward controls in top bar

#000000 or transparent background, 9999px radius circular hit area, white chevron icon. 32px diameter.

### Language Selector
**Role:** Footer-level globe icon + language dropdown in sidebar

White globe icon, white 'English' text, 9999px pill border on hover. SpotifyMixUI 14px weight 400.

## Do's and Don'ts

### Do
- Use #121212 as the default card/sidebar surface and #000000 as the page canvas
- Use 6px border-radius for all content cards and image containers
- Use 9999px border-radius for all interactive buttons and tags
- Use 500px border-radius for input fields to create a soft pill shape
- Use #1ed760 exclusively for play buttons, active states, and brand accents
- Use SpotifyMixUI 14px weight 700 for all section headings and button labels
- Use #b3b3b3 for all secondary text (artist names, metadata, timestamps)

### Don't
- Do not use heavy drop shadows — Spotify's elevation comes from surface color shifts, not shadow blur
- Do not use accent colors outside of #1ed760 and the promo gradient — the interface is intentionally monochrome
- Do not mix border-radius families — choose 6px for content, 9999px for actions, and stay consistent
- Do not use light backgrounds or white surfaces in the core interface — the dark canvas is signature
- Do not use typography larger than 24px for headings — Spotify's hierarchy is compact
- Do not place colored buttons on the dark surface — the primary action is always a white pill
- Do not add decorative borders or outlines to cards — surface color alone defines boundaries

## Elevation

- **Promotional Banner / Overlay Cards:** `rgba(0, 0, 0, 0.5) 0px 8px 24px 0px`
- **Input Fields:** `rgb(18, 18, 18) 0px 1px 0px 0px, rgb(124, 124, 124) 0px 0px 0px 1px inset`

## Surfaces

- **Canvas** (`#000000`) — Page background, top navigation bar
- **Sidebar** (`#121212`) — Left library panel, main content wrapper
- **Card** (`#1f1f1f`) — Individual content cards, input fields, elevated tiles
- **Card Hover** (`#292929`) — Interactive card hover state

## Imagery

Album artwork and artist photography are the primary visual content. Covers are presented as tight square crops (1:1 aspect ratio) at 6px radius — sharp enough to feel editorial, soft enough to feel modern. Artist photos are circular crops, emphasizing the face as identifier. No decorative photography, no lifestyle imagery, no abstract graphics in the core interface. The only non-photographic visual is the magenta-to-blue promotional gradient banner at the bottom, which functions as the sole brand-colored energy injection. Icons are minimal, monoline, white on dark — small and functional, never decorative.

## Layout

Fixed two-column shell: a 340px left sidebar ('Your Library') and a fluid main content area. The top bar is a full-width 64px black strip with left-anchored search and right-anchored account actions. Main content scrolls vertically with horizontal card carousels — trending songs in 5-column square grid, popular artists in 5-column circular grid, popular albums/singles continuing the pattern. Section spacing is compact (32-48px between sections). The bottom promotional banner is sticky/fixed at viewport floor. Navigation is purely top-bar + sidebar — no mega-menu, no breadcrumbs. The rhythm alternates: square cards → circular cards → square cards, creating geometric contrast between sections.

## Similar Brands

- **Apple Music** — Same dark-mode media browser with sidebar + horizontal card carousels, square album art tiles, and dense compact typography
- **YouTube Music** — Dark canvas with image-heavy card grids, similar compact sans-serif UI type, and pill-shaped playback controls
- **Tidal** — Near-identical layout structure: fixed sidebar library, horizontal content rails, square covers, dark monochrome interface
- **SoundCloud** — Dark-mode streaming interface with dense card grids, small utilitarian typography, and one brand accent color punctuating a monochrome shell
- **Netflix** — Content-first dark interface with horizontal card carousels, image-dominant tiles, and minimal chrome around the content grid
