# Netflix Spain — Style Reference
> A black cinema lobby with one red exit sign.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Netflix operates in cinematic darkness: a pure black void where vibrant content artwork becomes the visual hero. The interface strips itself down to typography and a single, unambiguous signal of action — Netflix Red. Every surface is some shade of near-black, creating a theatrical environment that makes movie posters, thumbnails, and show artwork explode off the screen. The system is intentionally minimal at the chrome level and maximal at the content level, with the red accent acting as the only warm temperature in an otherwise cold, immersive black space. Cards and feature tiles carry subtle dark-to-dark gradients (deep indigo, burgundy, charcoal) that add atmospheric depth without competing with the photographic content they frame.

## Colors

| Name | Value | Role |
|------|-------|------|
| Netflix Red | `#e50914` | Primary CTAs, brand logo, active states, and the single chromatic accent in the entire system — the only warm color allowed to break the black void |
| Pure Black | `#000000` | Dominant page canvas and deepest surface — the cinematic background that swallows everything non-essential |
| Obsidian | `#0f0f0f` | Elevated surface tone, barely distinguishable from black — used for subtle layering and section dividers |
| Carbon | `#232323` | Card and button surface background — the primary elevated layer above pure black |
| Charcoal | `#2d2d2d` | Deeper card surface and input field background — secondary surface level for nested elements |
| Graphite | `#323232` | Rounded card backgrounds and tertiary surface treatment |
| Slate | `#393939` | Hover states and pressed button backgrounds — a step lighter than carbon for interaction feedback |
| Ash | `#5a5a5a` | Hairline borders and subtle dividers on dark surfaces |
| Steel | `#808080` | Muted body text and inactive helper copy |
| Fog | `#b3b3b3` | Secondary body text, metadata, footer links, and de-emphasized descriptions |
| Pure White | `#ffffff` | Primary headings, body text, input text, and icon fills — the sole text color that carries information weight |
| Cinema Indigo | `linear-gradient(149deg, #192247 0%, #210e17 96.86%)` | Feature card gradient origin — deep blue-violet used as the cool terminus in card background gradients |
| Bordeaux Glow | `radial-gradient(11% 56% at 17% 50%, #461518 0%, rgba(0,0,0,0) 100%)` | Radial highlight origin on feature cards — a warm deep red that adds atmospheric luminosity to card edges |
| Ember Arc | `linear-gradient(0deg, rgba(0,0,0,0) 0%, #6f181d 50%, rgba(0,0,0,0) 100%)` | Horizontal light beam across card midlines — a thin warm glow that bisects feature cards with a soft red line |

## Typography

### Netflix Sans — Netflix Sans is a custom geometric sans optimized for on-screen readability across devices. The wide weight range (400–900) creates a dramatic hierarchy where 900-weight headlines at 56–100px feel like movie marquee titles. Body text stays at 400/500 with tight tracking. The extreme size jump from 24px to 56px signals a sharp two-tier heading system: section titles, then hero displays.
- **Substitute:** Inter or Helvetica Neue
- **Weights:** 400, 500, 700, 900
- **Sizes:** 10px, 12px, 13px, 14px, 16px, 20px, 24px, 56px, 100px
- **Line height:** 1.0–1.6

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | — |
| body | — | — | 14px | 1.5 | — |
| body-lg | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.2 | — |
| heading-sm | — | — | 24px | 1.17 | — |
| heading | — | — | 56px | 1 | — |
| display | — | — | 100px | 1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 12px
- **Element gap:** 12px

### Border Radius

- **cards:** 8px
- **links:** 2px
- **tiles:** 16px
- **inputs:** 4px
- **buttons:** 8px

## Components

### Primary CTA Button (Red Filled)
**Role:** The single most important interaction element — sign-up, get started, submit

Background: #e50914. Text: #ffffff, Netflix Sans weight 500, 16px. Border-radius: 8px. Padding: 12px 24px. No border, no shadow. May include a trailing chevron icon (›) for forward-action semantics.

### Header Sign-In Button
**Role:** Navigation authentication entry point

Background: #e50914. Text: #ffffff, Netflix Sans weight 500, 14px. Border-radius: 8px. Padding: 8px 16px. Compact variant of the primary CTA sized for the header bar.

### Email Input Field
**Role:** Email capture for membership registration

Background: transparent with a dark inner fill. Border: none, relies on a dark pill container. Text: #ffffff, 16px. Placeholder: #b3b3b3. Border-radius: 4px (inner) inside an 8px outer container. No visible focus ring — the red CTA beside it provides the action anchor.

### Email Capture Composite
**Role:** Hero email-to-CTA pattern — the membership conversion unit

A horizontal pair: dark email input on the left (flexible width) + red Get Started button on the right (fixed). Container has no visible border. The red button's 8px radius matches the input's 4px inner radius for a unified pill shape when joined.

### Hero Background Collage
**Role:** Cinematic atmosphere generator for the landing page

Full-bleed background composed of overlapping movie/show poster thumbnails at various rotations and scales. A dark gradient overlay (black at 60–80% opacity) sits on top to ensure text contrast. A radial vignette darkens edges. This is not a component per se but a signature layout pattern.

### Trending Rank Card
**Role:** Numbered content tile showing top-10/popular content with rank overlay

Square aspect ratio poster image. Large white rank number (1, 2, 3…) overlaid on the left side, Netflix Sans weight 900, ~100px, with a subtle black outline/drop for legibility. Small red Netflix N-logo badge in top-left corner of the poster. Cards are displayed in a horizontal row with 8px gaps.

### Feature Reason Card
**Role:** Marketing card explaining a membership benefit

Background: dark gradient (Cinema Indigo to Bordeaux, with radial glow). Border-radius: 16px. Padding: 12px. Contains: heading (Netflix Sans 700, 20–24px, #ffffff), description body (400, 16px, #ffffff), and a decorative icon (TV, download arrow, megaphone, or profile shapes) in the lower portion. The icon is rendered in warm reds/oranges against the dark card, creating a single warm focal point per card.

### Content Row Section
**Role:** Horizontally scrollable strip of content thumbnails

Section heading (Netflix Sans 700, 24px, #ffffff) above a horizontal row of portrait-aspect poster cards. Cards have 8px radius. A right-pointing chevron button appears on hover for carousel scrolling. Section gap: 64px between rows.

### Language Selector
**Role:** Locale switcher in the header

Dark background with a globe icon and 'English' label in Netflix Sans 400, 14px, #ffffff. Dropdown caret on the right. Border-radius: 8px. Sits beside the red Sign-In button in the header.

### Pricing Banner
**Role:** Promotional strip advertising the ad-supported tier

Horizontal banner at the page bottom. Dark background. Contains: small Netflix icon on the left, headline text (Netflix Sans 500, 16px, #ffffff), and a secondary action link/button on the right. Sits above the footer area.

### Horizontal Divider with Glow
**Role:** Section separator that doubles as a atmospheric light line

A thin horizontal gradient line (transparent → #6f181d → transparent) that separates the hero from the content sections. Functions as both divider and atmospheric accent, recalling a cinema marquee light strip.

### Footer Link List
**Role:** Site navigation links in the footer

Multi-column grid of text links in Netflix Sans 400, 13–14px, #b3b3b3. Links have a 2px bottom border or underline on hover. No background, no card container — floats directly on the black page canvas.

## Do's and Don'ts

### Do
- Use #e50914 exclusively for the single primary action per view — never decorate, never use it for icons, tags, or secondary links
- Keep all surfaces in the pure black to charcoal range (#000000–#2d2d2d) — the darkness is the brand
- Let content artwork fill 80%+ of the visual real estate; UI chrome should recede
- Use Netflix Sans weight 900 at 56–100px for hero/display headlines to create a marquee-title impact
- Apply 8px border-radius consistently to cards, buttons, and inputs — the system has exactly two radii (2px for links, 8px for containers)
- Layer content posters at slight rotations in hero/collage contexts to create a sense of depth and abundance
- Use #b3b3b3 for all secondary and metadata text — never use a chromatic gray

### Don't
- Do not introduce any chromatic color other than #e50914 into the system — no blues, greens, or purples as UI accents (gradients on feature cards are the sole exception and are decorative only)
- Do not use drop shadows or box-shadows for elevation — depth comes from surface tone shifts only
- Do not add borders to cards — use tonal contrast between the card surface (#232323) and the page (#000000) instead
- Do not use rounded corners above 16px — the system is rectilinear with subtle softening, never pill-shaped except for tag/badge contexts
- Do not use Netflix Sans weight 400 for headings — reserve it for body copy; headings should be 700 or 900
- Do not place UI text directly on poster artwork without a dark scrim overlay — always protect legibility
- Do not introduce additional accent colors for states (hover, focus) — use #393939 (hover surface) and keep the red button as the only action signal

## Elevation

No drop shadows. Depth is communicated exclusively through surface tonal shifts (black → carbon → charcoal) and gradient washes on feature cards. The system rejects traditional elevation in favor of the cinematic flat-black aesthetic where depth comes from luminance contrast, not box-shadow.

## Surfaces

- **Pure Black** (`#000000`) — Page canvas — the infinite black background
- **Obsidian** (`#0f0f0f`) — Near-black elevated section background
- **Carbon** (`#232323`) — Card and button surface
- **Charcoal** (`#2d2d2d`) — Input fields and nested card surfaces
- **Graphite** (`#323232`) — Rounded feature card background

## Imagery

The visual system is overwhelmingly photographic. Movie posters, show stills, and content thumbnails are the primary visual content. The hero uses a chaotic, multi-rotation collage of poster artwork at various angles to create a sense of abundance and discovery. Content rows display portrait-aspect poster tiles in clean horizontal strips. Feature card icons are flat, simplified vector shapes (TV, download arrow, megaphone, user profile) rendered in warm reds and oranges. The overall treatment is: let the content artwork do the heavy lifting, keep all UI chrome and icons minimal and monochromatic or single-accent red. No lifestyle photography, no human subjects in UI — the content IS the imagery.

## Layout

The page is full-bleed with a max content width of ~1200px centered. The hero occupies the full viewport with a poster-collage background and a centered headline + email capture composite. Below the hero, a glowing red divider separates the content area. Content sections stack vertically: 'Trending Now' as a horizontal row of 5–10 numbered cards, then 'More Reasons to Join' as a 4-column feature card grid. All content sits on a pure black canvas with generous 64px section gaps. Navigation is a single top bar with the red Netflix wordmark left, language selector and red Sign-In button right. No sticky header, no sidebar, no mega-menu. The rhythm is: full-bleed atmospheric hero → repeating horizontal content rows → structured card grids → footer.

## Similar Brands

- **HBO Max** — Same dark-cinema aesthetic with a single chromatic brand color (purple) and content-artwork-driven hero treatment
- **Disney+** — Full-bleed black canvas with brand-color CTAs and portrait-aspect poster rows; identical content-grid rhythm
- **Hulu** — Dark UI with green single-accent CTAs and poster-collage hero, similar surface tonal layering
- **Apple TV+** — Near-black background with minimal chrome, letting video/poster artwork dominate; clean typographic hierarchy
- **Spotify** — Dark-mode-first interface where the brand color is used sparingly as a single warm signal against monochrome depth
