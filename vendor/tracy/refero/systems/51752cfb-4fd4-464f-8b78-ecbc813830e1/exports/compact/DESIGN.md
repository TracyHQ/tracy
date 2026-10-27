# Deta Surf — Style Reference
> Open notebook floating in a clear blue sky. A serif headline drifts above a pill-shaped search bar while tilted content cards orbit like ideas in a thought bubble.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Deta Surf treats the web like a cumulus notebook — a pale blue sky gradient carries the hero, content cards tilt and float at the edges, and the interface itself feels weightless. The signature typographic tension sits between Gambarino serif headlines and Switzer geometric sans: the words feel handwritten, the UI feels engineered. Tanker appears sparingly as an all-caps accent (16-19px, +0.05em tracking) on tags and small display elements, breaking the otherwise clean system with a crafted, editorial touch. Components hover rather than sit: cards carry a single hairline shadow at 5% opacity, filled buttons gain depth from a #006dc8 inset highlight, and the single brand blue (#009afc) appears only where the user must act. The whole system breathes — 8px base, generous 32px section gaps, 30px rounded hero search bar, and pill-shaped controls everywhere signal a contemplative, low-friction product.

## Colors

| Name | Value | Role |
|------|-------|------|
| Surf Blue | `#009afc` | Primary CTA fill, focused interactive state — the only vivid color in the system, reserved for actions that complete a task |
| Deep Current | `#006dc8` | Inset button highlight, pressed state, button shadow tint — creates the lifted feel under filled CTAs |
| Sky Wash | `linear-gradient(180deg, #4a9eff 0%, #7bb8ff 50%, #a8d5ff 100%)` | Pill badges (Open Source tag), outlined action borders, soft highlight washes — the cool whisper of brand blue on neutral surfaces |
| Sky Veil | `linear-gradient(180deg, #4a9eff 0%, #7bb8ff 50%, #a8d5ff 100%)` | Hero background gradient bottom stop — fades the sky into white at the page floor |
| Ink | `#000000` | Headlines, primary body text, icon strokes — the typographic anchor of every screen |
| Paper | `#ffffff` | Card surfaces, search bar, button text, inverted surfaces — the floating layer above Mist Gray |
| Mist | `#f3f4f6` | Page canvas, recessed card backgrounds — the air that everything floats on |
| Hairline | `#e5e7eb` | Borders, dividers, input outlines — the structural skeleton holding the airy layout together |
| Stone | `#d1d1d1` | Subtle outer shadows on elevated cards — softer than Hairline, only for depth |
| Slate Blue | `#5b6882` | Secondary text, metadata, icon strokes, muted labels — the only chromatic neutral, gives UI text a cool undertone that matches the sky |
| Silver | `#808080` | Tertiary helper text, disabled links — the quietest voice in the system |

## Typography

### Switzer — Primary UI typeface — nav, body, buttons, cards, metadata, badge labels. A geometric sans that stays neutral so the Gambarino serif and Tanker display can carry personality. Caps at weight 500 by convention; the system never goes bold.
- **Substitute:** Inter, Geist, Manrope
- **Weights:** 400, 500
- **Sizes:** 12, 14, 15, 16, 17, 18, 20, 60
- **Line height:** 1.00, 1.11, 1.20, 1.40, 1.43, 1.45, 1.50, 1.56, 1.60
- **Letter spacing:** -0.0090em

### Gambarino — Hero headlines (36-60px) and editorial subheads — a modern serif with high contrast strokes that gives the page a literary, considered voice. The serif/sans split is the system's signature typographic move.
- **Substitute:** Fraunces, Source Serif Pro, Lora
- **Weights:** 400, 500
- **Sizes:** 16, 18, 20, 36, 40, 48, 60
- **Line height:** 1.00, 1.11, 1.20, 1.40, 1.50, 1.56
- **Letter spacing:** -0.0100em

### Tanker — Small all-caps display accent — appears in compact tags and section eyebrows at 16-19px with +0.05em tracking. Tanker is the system's editorial punctuation, used sparingly to mark transitions and categories without competing with Gambarino.
- **Substitute:** Bebas Neue, Anton, Oswald
- **Weights:** 400
- **Sizes:** 16, 19
- **Line height:** 1.30, 1.50
- **Letter spacing:** 0.0500em

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 16px
- **Line height:** 1.5
- **Letter spacing:** -0.009

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | -0.108px |
| body-sm | — | — | 14px | 1.43 | -0.126px |
| body | — | — | 16px | 1.5 | -0.144px |
| subheading | — | — | 18px | 1.45 | -0.162px |
| heading-sm | — | — | 20px | 1.4 | -0.2px |
| heading | — | — | 36px | 1.2 | -0.36px |
| heading-lg | — | — | 48px | 1.11 | -0.48px |
| display | — | — | 60px | 1 | -0.6px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 12-16px

### Border Radius

- **cards:** 12px or 16px
- **badges:** 9999px
- **inputs:** 16px
- **buttons:** 9999px (pill) or 16px (rounded rect)
- **searchBar:** 30px
- **largeCards:** 42px

## Components

### Top Navigation Bar
**Role:** Persistent header across all pages

Transparent over the hero sky gradient. Logo (pink-to-orange gradient diamond) + wordmark on the left, nav links (Switzer 14px/500) in the center, GitHub star count pill (#ffffff background, 9999px radius, 1px #e5e7eb border) on the right. Height ~64px, no background fill until scroll.

### Announcement Pill Badge
**Role:** Hero status callout (e.g. 'Now Open Source')

Inline pill with #cfe9fd background, 1px #cfe9fd border, 9999px radius, 6px 12px padding. Label text at 14px Switzer weight 500 in #006dc8. Preceded by a small dot indicator in #009afc. Sits inline with supporting copy.

### Hero Headline
**Role:** Primary page-level statement

60px Gambarino weight 400, #000000, letter-spacing -0.6px, line-height 1.00. Centered above the search bar. The serif is the page's emotional anchor — it carries voice while the Switzer UI stays neutral.

### Hero Subhead
**Role:** Supporting copy beneath the headline

18px Switzer weight 400, #5b6882, line-height 1.45, letter-spacing -0.162px. Centered, max-width ~640px. Lighter weight and cool gray distinguish it from the headline without needing a size jump.

### Hero Search Bar
**Role:** Primary interaction surface — the hero CTA

White card (#ffffff), 30px border-radius, padding 16px 20px, shadow rgba(0,0,0,0.05) 0px 1px 2px. Contains: left-side tab segmented control (Web Search | Notebook) with a small icon for each, placeholder text in #808080 at 16px Switzer, and a filled Surf Blue Create Note button anchored to the right (16px radius, white text, 12px 24px padding, the full button shadow stack).

### Segmented Tab Control
**Role:** Mode switcher inside the search bar

Two segments side by side, no visible container. Each segment: 14px Switzer weight 500, #5b6882 inactive / #000000 active, paired with a 16px line icon. Active segment carries a subtle visual weight shift (color + weight bump), not a background fill — the bar itself provides the container.

### Primary CTA Button (Filled)
**Role:** Single dominant action per screen

#009afc background, white text, 16px border-radius, 12px 24px padding, 16px Switzer weight 500. Shadow: rgba(0,0,0,0.1) 0px 10px 15px -3px + rgba(0,0,0,0.1) 0px 4px 6px -4px, plus rgb(0,109,200) 0px -4px 0px 0px inset for the lifted-from-below effect. The inset blue is the signature — it makes the button feel pressed up from the surface rather than glued on.

### Large Download Button
**Role:** Hero secondary action

Same Surf Blue fill as the primary CTA but larger: 18px Switzer weight 500, 16px 32px padding, 16px radius. Shadow stack rgba(0,0,0,0.1) 0px 4px 6px -1px + rgba(0,0,0,0.1) 0px 2px 4px -2px. Sits centered below the search bar with ~24px gap.

### Outlined Pill Badge
**Role:** Tags, status labels, category markers

9999px radius, 1px #cfe9fd border, transparent or #cfe9fd background at 30% opacity, text 14px Switzer weight 500 in #006dc8, 6px 12px padding. Soft, cool, secondary to the filled button — used for categorical metadata, not actions.

### Floating Content Card
**Role:** Preview of notebook entries, saved pages, bookmarks

White card (#ffffff), 12-16px border-radius, 16px padding, 1px #e5e7eb border, shadow rgba(0,0,0,0.05) 0px 1px 2px. Title at 16px Switzer weight 500 #000000, metadata rows at 14px Switzer weight 400 #5b6882, link text at 14px #006dc8 with underline. Slight rotation (-3° to +3°) in the hero creates the floating-cumulus effect.

### Book Cover Card
**Role:** Physical-product or book-style previews

16px radius, shadow rgba(0,0,0,0.1) 0px 10px 15px -3px, no border. Contains a full-bleed image (book cover or product shot) with a slight perspective tilt. Used in the hero to break the all-digital card pattern with a tactile object.

### Recessed Card Surface
**Role:** Secondary content blocks, metadata panels

#f3f4f6 background, 16px border-radius, 16px padding, 1px #e5e7eb border, no shadow. Sits one level below Paper cards — used for grouping secondary information that should not compete with the primary content.

## Do's and Don'ts

### Do
- Use 9999px radius for all pill buttons, nav items, and tag badges
- Use 30px radius for the hero search bar — this generous rounding is a signature
- Pair 60px Gambarino headlines with 18px Switzer weight 400 subheads in #5b6882
- Apply the sky gradient only to full-bleed hero or section backgrounds — never to cards
- Use #009afc exclusively for filled primary CTAs; never for decorative fills, icons, or text
- Keep card elevation at a single hairline shadow: rgba(0,0,0,0.05) 0px 1px 2px
- Use Tanker at 16-19px with +0.05em tracking for small all-caps section markers

### Don't
- Don't use #009afc for anything other than filled primary action buttons
- Don't apply Gambarino to body copy, buttons, or UI labels — it is headline-only
- Don't use font weights above 500 — Switzer and Gambarino cap at 500
- Don't apply shadows heavier than rgba(0,0,0,0.1) — the system stays whisper-light
- Don't use sharp corners (radius < 8px) on interactive elements
- Don't use the sky gradient on card or panel surfaces — reserve it for atmospheric backdrops
- Don't place #006dc8 text on #ffffff smaller than 14px — it falls below 4.5:1 contrast at smaller sizes

## Elevation

- **Floating content card:** `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px`
- **Hero search bar:** `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px`
- **Primary CTA button (filled):** `rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px`
- **Primary CTA button (inset highlight):** `rgb(0, 109, 200) 0px -4px 0px 0px inset`
- **Secondary button:** `rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px`

## Surfaces

- **Sky Canvas** (`#a8d5ff`) — Hero full-bleed gradient backdrop — the atmospheric base layer
- **Mist Ground** (`#f3f4f6`) — Page background below the hero and inside recessed panels
- **Paper** (`#ffffff`) — Cards, search bar, nav, floating content previews
- **Surf Blue Surface** (`#009afc`) — Filled CTA buttons — the only chromatic surface

## Imagery

Imagery is sparse, contained, and floaty. The hero scatters 4-5 cards at slight angles around a centered search bar: a blue book cover, a notebook entry card, a hand holding colorful pills (lifestyle product shot), and a data visualization card. Treatment: each visual is wrapped in its own rounded card (12-16px radius) with the standard 5% shadow, tilted -3° to +3° to suggest they're drifting. Photography is bright, high-key, and tightly cropped on objects — no environmental context, the object IS the hero. No illustrations or abstract graphics; the sky gradient does the atmospheric work. Icons throughout the UI are 1.5-2px stroke line icons in #5b6882, mono-weight, no fills.

## Layout

Max-width 1200px centered content within a full-bleed sky gradient hero. Hero is a single centered column: announcement pill → 60px serif headline → 18px subhead → large rounded search bar → download button, with floating preview cards arranged asymmetrically around the hero at slight angles (z-pattern reading flow). Section transitions are seamless — the sky gradient fades to white, then Mist Gray (#f3f4f6) sections alternate with white card blocks at 64px gaps. No sidebar, no mega-menu. Navigation is a single transparent top bar that becomes a white surface on scroll. Content density stays low — one idea per screen, generous breathing room, cards never appear in grids tighter than 2-up.

## Similar Brands

- **Are.na** — Same airy editorial density — serif headlines floating above a light canvas with rounded cards orbiting the focal element
- **Readwise Reader** — Same pill-shaped controls, single vivid blue accent, and generous radius on the primary interaction surface
- **Notion** — Same low-contrast neutral system (#e5e7eb borders, #f3f4f6 surfaces) and restrained single-accent color discipline
- **Linear** — Same whisper-light shadow approach (5% opacity, 1-2px blur) and pill-button geometry
- **Obsidian** — Same typographic confidence pairing a serif voice with a geometric sans for UI, and the same contemplative, low-density layout
