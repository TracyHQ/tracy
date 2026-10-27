# Spotify — Style Reference
> Darkened record store at midnight — every surface recedes so the album art can glow.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Spotify operates as a darkened cinema for music: a near-black canvas lets album artwork and artist photography supply all the color, while the chrome itself stays nearly monochrome to keep focus on the content. The interface is compact, information-dense, and built around horizontal scrolling rails of square album cards and circular artist portraits. One signature vivid green (#1ed760) punctuates the system for primary actions, play states, and brand identity, while a purple-to-blue gradient appears only in premium promotional banners. Buttons are fully pill-shaped (9999px), cards carry a modest 6px radius with a generous drop shadow, and typography is a tight, geometric sans-serif that speaks at conversational volumes — never shouting, always functional.

## Colors

| Name | Value | Role |
|------|-------|------|
| Void Black | `#000000` | Primary canvas, page background — deepest layer of the dark surface stack |
| Obsidian | `#121212` | Card surfaces, raised panels, modal backgrounds — one step up from the canvas |
| Graphite | `#1f1f1f` | Elevated controls, hover surfaces, filled button backgrounds — the interactive surface tier |
| Ash Gray | `#333333` | Input borders, subtle dividers, inactive control outlines |
| Steel Mist | `#767676` | Muted text, secondary nav, disabled labels — text that fades into the background |
| Cloud Gray | `#b3b3b3` | Secondary body text, metadata, timestamps — readable but never competing with content |
| Pure White | `#ffffff` | Primary text, headings, light icon fills, pill button fills — the highest-contrast element on the dark canvas |
| Spotify Green | `#1ed760` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Premium Magenta | `#af2896` | Gradient anchor for premium promotional banners, subscription upsell surfaces |
| Premium Cobalt | `#509bf5` | Gradient terminus for premium promotional banners, feature callouts on subscription screens |
| Amber Glow | `#a16b1b` | Decorative warmth — album artwork occasionally carries this tonal range |

## Typography

### SpotifyMixUI — Primary UI typeface — handles all body copy, navigation, buttons, metadata, and small headings. Weight 400 carries body and labels, weight 600 appears in tab headers and emphasized metadata, weight 700 anchors section titles. The 4px size range (11–16px) keeps the entire interface at conversational volume, never editorial. Substitute: Inter, IBM Plex Sans, or DM Sans as freely available alternates with similar geometric warmth.
- **Substitute:** Inter
- **Weights:** 400, 600, 700
- **Sizes:** 11px, 12px, 13px, 14px, 16px
- **Line height:** 1.20, 1.33, 1.50

### SpotifyMixUITitle — Rail and section headings — the 24px bold treatment for 'Trending songs', 'Popular artists', etc. is the only typographic moment that breaks above body size. Substitutes should be a geometric grotesque with a tall x-height and even stroke contrast.
- **Substitute:** Inter
- **Weights:** 700
- **Sizes:** 24px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.33 | — |
| body | — | — | 14px | 1.5 | — |
| heading | — | — | 24px | 1.2 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Section gap:** 32px
- **Card padding:** 12px
- **Element gap:** 12px

### Border Radius

- **tags:** 9999px
- **cards:** 6px
- **inputs:** 4px
- **buttons:** 9999px
- **artistImages:** 9999px

## Components

### Pill Button — Green Primary
**Role:** High-emphasis action button

Filled pill with #1ed760 background, #000000 text, weight 700 at 14px. 9999px border radius, 12px vertical / 32px horizontal padding. No border. Used for 'Log in' and confirmatory actions. Sits as the only chromatic button in the system.

### Pill Button — White Secondary
**Role:** Medium-emphasis action

Filled white pill (#ffffff) with #000000 text, weight 700 at 14px. 9999px radius, 12px 32px padding. Functions as the secondary CTA paired with the green primary — e.g. 'Sign up free' in the premium banner. High contrast against the dark canvas.

### Pill Button — Ghost Outline
**Role:** Low-emphasis action

Transparent fill with a 1px white border at reduced opacity, white text. 9999px radius. Used for secondary nav items and 'Create playlist' / 'Browse podcasts' CTAs inside the sidebar.

### Album Card
**Role:** Content tile for albums, singles, playlists

Square 1:1 album artwork on #121212 background, 6px border radius, 0px 8px 24px rgba(0,0,0,0.5) shadow. Title in #ffffff at 16px weight 400 below the image; artist/subtitle in #b3b3b3 at 14px. 12px padding around the text block. No border.

### Artist Card
**Role:** Circular artist portrait with name

1:1 image cropped to full circle (9999px radius) on transparent background. Artist name in #ffffff at 16px below, role label ('Artist') in #b3b3b3 at 14px. No card surface or shadow — the circular image floats directly on the void canvas.

### Sidebar Library Panel
**Role:** Left-rail persistent navigation container

#000000 background, full-height column, 8px horizontal padding. Houses 'Your Library' header with + icon, then scrollable list of playlist/artist shortcuts. No visible border between sidebar and main content — separation is achieved through the surface tier alone.

### Playlist Prompt Card
**Role:** Onboarding call-out inside the library

Rounded rectangle at 6px radius on #121212 with 0 8px 24px shadow. Bold heading in #ffffff at 16px, supporting copy in #b3b3b3 at 14px, and a pill ghost button below. 12px internal padding. Example patterns: 'Create your first playlist' and 'Let's find some podcasts to follow'.

### Top Navigation Bar
**Role:** Global header

Horizontal bar with #000000 background. Left cluster: home icon button, then search field. Right cluster: text nav links (Premium, Support, Download) at 14px weight 600 in #b3b3b3, vertical divider, 'Install App' link, 'Sign up' ghost button, and 'Log in' green pill. Search field is #1f1f1f with 9999px radius.

### Search Field
**Role:** Global search input

#1f1f1f background, 9999px radius (pill shape), #ffffff at low-opacity placeholder text, 14px SpotifyMixUI. Expands on focus. Left-aligned search icon in #b3b3b3. No visible border; the surface tier difference is the only separator.

### Content Rail Header
**Role:** Section title bar

Section name in #ffffff at 24px weight 700 (SpotifyMixUITitle), right-aligned 'Show all' link in #b3b3b3 at 14px weight 700. 12px vertical padding above the rail content. No background or border.

### Horizontal Content Rail
**Role:** Scrollable card row

Flex row of album or artist cards with 16px column gap. Overflow scrolls horizontally. Cards are fixed-width (albums ~180px, artists ~180px circles) with 6px radius for squares and full circle for portraits. No visible scrollbar.

### Premium Banner
**Role:** Full-width subscription promotion

Sticky bottom strip with 90deg linear-gradient from #af2896 to #509bf5. Left text block: 'Preview of Spotify' bold white + descriptive copy in white at reduced opacity. Right: 'Sign up free' white pill button at 9999px radius. No border or shadow — the gradient IS the visual weight.

### Language Selector
**Role:** Footer utility control

Ghost pill button at 9999px radius, #ffffff border, globe icon + 'English' label in #ffffff at 14px weight 700. 8px vertical / 12px horizontal padding. Sits in the bottom-left of the sidebar above the premium banner.

## Do's and Don'ts

### Do
- Use 9999px border-radius for every button, tag, and search field — the pill shape is non-negotiable for Spotify's identity.
- Apply 6px radius to all square content cards (albums, playlists) and 9999px for circular artist portraits — never mix radii within the same card type.
- Reserve #1ed760 for the single most important action per screen — log in, play, confirm. Never use it for secondary links, metadata, or decorative elements.
- Keep all text between 11px and 24px. The system is compact; no body copy should exceed 16px, and only section headings reach 24px.
- Use #000000 for the page canvas, #121212 for content cards, and #1f1f1f for interactive controls — maintain this three-tier surface hierarchy on every screen.
- Apply the 0px 8px 24px rgba(0,0,0,0.5) shadow only to content cards lifted off the canvas, never to navigation, buttons, or inputs.
- Let album artwork and artist photography supply all chromatic color in the interface. The chrome itself should remain monochrome with #ffffff and #b3b3b3 as the only text colors.

### Don't
- Do not introduce a new chromatic accent color. The entire system runs on one green (#1ed760) plus the magenta-to-cobalt gradient for premium promotions.
- Do not use sharp corners (<4px radius) on any interactive element. Pills and soft 6px squares are the only acceptable shapes.
- Do not set body text below 11px or above 16px. The 4px size band is deliberate and compact.
- Do not use #1ed760 for hover states on white or dark buttons — green is exclusively a primary action fill, never a state indicator.
- Do not apply the premium magenta-to-cobalt gradient outside of subscription/promotional contexts. It is reserved for upsell moments.
- Do not use white or light backgrounds for any surface. The system is dark-first; even elevated cards stay at #1f1f1f or below.
- Do not add multi-layer shadow stacks, colored glows, or neumorphic effects. The single rgba(0,0,0,0.5) drop shadow is the only elevation treatment.

## Elevation

- **Album / Playlist Card:** `0px 8px 24px 0px rgba(0, 0, 0, 0.5)`

## Surfaces

- **Void Canvas** (`#000000`) — Page background, left sidebar, footer areas
- **Obsidian Card** (`#121212`) — Album cards, playlist prompt cards, content surfaces
- **Graphite Control** (`#1f1f1f`) — Search bar, elevated buttons, hover states

## Imagery

Imagery IS the product. The interface is a frame for user-consumed content: square album covers, circular artist portraits, and playlist cover art. Treatment is clean, uncropped (except to square or circle), no filters or overlays on content imagery. Card shadows (0px 8px 24px rgba(0,0,0,0.5)) give artwork dimensional lift off the void canvas. No illustrations, no abstract graphics, no lifestyle photography in the UI itself — the page is a gallery. Icons are minimal, monochromatic, and outlined or filled in white at reduced opacity. The only branded graphic element is the gradient premium banner.

## Layout

The page uses a two-column layout: a fixed left sidebar (~340px) for 'Your Library' and navigation, and a flexible main content area that scrolls independently. The main area is organized as vertically stacked horizontal rails — each rail is a section heading (24px left-aligned, 'Show all' right-aligned) followed by a horizontally scrolling row of cards. Cards are uniform-width within each rail (albums: 180px squares, artists: 180px circles). Spacing between rails is 32px; between cards within a rail is 16px. The top bar is a full-width navigation strip with left-cluster icons/search and right-cluster text links and action buttons. A full-width gradient premium banner is sticky at the bottom of the viewport. There are no section dividers, background color changes, or visual separators between rails — the surface stays uniformly #000000, and hierarchy comes from typography and spacing alone.

## Similar Brands

- **Apple Music** — Same dark-first media browsing pattern with horizontal content rails, square album art cards, and a near-monochrome chrome that lets artwork supply the color
- **YouTube Music** — Identical rail-based home feed with circular artist images and square album tiles, dark background, and pill-shaped search/controls
- **Tidal** — Same high-contrast dark interface with album-artwork-driven color and horizontal scro rails of square content tiles
- **SoundCloud** — Dark canvas, compact dense card grids, pill navigation, and a near-monochrome interface that treats user-uploaded artwork as the primary visual content
