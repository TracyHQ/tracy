# Mintlify — Style Reference
> Cloud garden over a glass desk. A hand-illustrated sky and a documentation product share the same frame — the only place color and concept collide before the page settles into monastic white.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Mintlify operates on a near-total monochrome discipline: white canvas, near-black text, and a single vivid green as the only chromatic spark across the entire interface. The hero is the deliberate exception — a hand-illustrated cloud landscape on a dark teal gradient, with the documentation product floating in the foreground as living proof. Everything downstream reverts to austere white surfaces, tight Inter typography, and component geometry that stays square (4px button radii, 16–24px card radii) rather than pill-shaped or overly rounded. Color appears as functional punctuation: green for active states, brand links, and decorative icons; black for the sole filled button variant. Elevation is whispered, never declared — shadows sit at 0.03–0.05 opacity and are felt more than seen.

## Colors

| Name | Value | Role |
|------|-------|------|
| Mint Green | `#0c8c5e` | Brand links, active nav state, feature icons, decorative dots in eyebrow labels, the thin underline on inline code references — the only chromatic accent in a monochrome system, applied sparingly to make functional moments feel switched on |
| Ink Black | `#08090a` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| True Black | `#000000` | Body text, link defaults before hover, icon strokes, and footer rules — the workhorse neutral that carries most of the typography load |
| Paper White | `#ffffff` | Page canvas, card surfaces, button text on dark fills, input fields — the base layer everything else sits on |
| Mist Gray | `#f2f2f2` | Subtle dividers, hairline strokes on cards, low-emphasis backgrounds, and the faintest hover wash |
| Cloud Gray | `#dddddd` | Input borders, card outlines on hover states, secondary divider lines that need a step more visibility than Mist |

## Typography

### Inter — Universal typeface — the only family in the system. Used for headlines, body, nav, buttons, inputs, and code. No display face, no mono override visible.
- **Substitute:** Inter (Google Fonts) — also try IBM Plex Sans or General Sans as open alternatives if Inter is unavailable.
- **Weights:** 400, 500, 600
- **Sizes:** 13, 14, 15, 16, 18, 20, 24, 40, 57
- **Line height:** 1.10, 1.15, 1.30, 1.33, 1.50, 1.71
- **Letter spacing:** Tight at large sizes: -0.02em at 57px, -0.01em at 40px down through 16px, neutral at 13–14px, +0.05em on the smallest uppercase eyebrow labels
- **OpenType features:** `"ss01" on, "cv11" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.5 | 0.65px |
| body | — | — | 16px | 1.5 | -0.16px |
| subheading | — | — | 20px | 1.3 | -0.2px |
| heading-sm | — | — | 24px | 1.33 | -0.24px |
| heading | — | — | 40px | 1.15 | -0.4px |
| display | — | — | 57px | 1.1 | -1.14px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **tags:** 4px
- **cards:** 16px
- **inputs:** 4px
- **buttons:** 4px
- **largeContainers:** 24px

## Components

### Primary Filled Button
**Role:** Highest-weight action — the single dark filled button variant in the system

4px radius, Ink Black (#08090a) background, Paper White (#ffffff) text, Inter at 14–15px weight 500, padding 8px 16px. Carries the 0.03-opacity lab shadow. Used for 'Start for free' and the email submit arrow.

### Ghost Navigation Button
**Role:** Secondary navigation action that should not compete with the primary CTA

Transparent background, True Black text, no border, 14px Inter weight 500, hover adds a subtle Mist Gray background wash. Used for 'Contact sales' in the nav.

### Hero Email Input
**Role:** Hero lead-capture form with integrated submit

White background, Cloud Gray border, 4px radius on the outer pill, inner text field sits flush with a circular dark submit button on the right containing a right-arrow icon. Placeholder 'Email address' in muted gray, 14–15px Inter.

### Documentation Product Card
**Role:** Hero showcase — the product UI rendered as a floating card

16px radius, white surface, the 0.05-opacity lab shadow, padded internally with ~24px. Contains a left sidebar (Mint Green active state, icon + label rows), a main content area with tab navigation, and a right-side 'On this page' TOC. This is the only place Mint Green is used as a sidebar active indicator.

### Customer Story Card
**Role:** Social proof unit in a 3-column grid

16px radius, white surface, 1px #f2f2f2 border, 24px internal padding. Top half is a full-bleed image with a subtle gradient overlay; bottom half holds a description paragraph (16px, weight 400) and a 'Read story →' text link in Inter weight 500.

### Feature Capability Card
**Role:** Used in the 'Built for the intelligence age' grid to explain platform capabilities

16px radius, light Mint-tinted background wash, 24px padding, eyebrow label in small caps Mint Green at 13px letter-spacing +0.05em, body copy in Ink Black at 16px.

### Partner Logo Tile
**Role:** Logo wall — trust signal grid

No background, no border, rendered at grayscale on the white page. Logos sit on a uniform baseline grid, 4 per row with 24px column gap. No hover state — these are static trust markers.

### Top Navigation Bar
**Role:** Primary site navigation

White background, sits on top of both the dark hero and white content sections. Logo on far left (Mint Green mark + black wordmark), nav links center-left in Inter 14px weight 500 True Black, 'Contact sales' ghost button and 'Start for free' filled button right-aligned. No bottom border — the nav reads as floating on the page.

### Sidebar Navigation Item
**Role:** In-product documentation sidebar

16px Inter weight 400, True Black text, 6px vertical padding, 8px left indent. Active state fills the row with a faint Mint-tinted background and switches text to Mint Green. Icons are 16px stroke 1.5, Mint Green on active, True Black on inactive.

### Eyebrow Label
**Role:** Small uppercase section label above feature cards and capability headers

13px Inter weight 500, Mint Green, letter-spacing +0.05em, uppercase. Reads as a category tag, not a heading — always paired with a larger heading below.

## Do's and Don'ts

### Do
- Use Inter for everything — there is no display face or mono override in the system.
- Apply Mint Green (#0c8c5e) only for active states, brand links, decorative icons, and eyebrow labels — never as a large surface fill or button background.
- Set button radius to 4px and card radius to 16px — the system is square, not pill-shaped.
- Tighten letter-spacing to -0.02em at 57px and -0.01em at 40–16px; loosen to +0.05em only on uppercase 13px eyebrow labels.
- Use Ink Black (#08090a) for the filled button background and true black (#000000) for body text — keep these two neutrals in their separate roles.
- Let the hero be the only colorful moment on the page — revert to white surfaces and black text for everything below the fold.
- Limit shadows to 2px offset at 3–5% opacity; if a component needs more separation, use a 1px #dddddd border instead.

### Don't
- Do not introduce pill buttons, 9999px radii, or rounded avatars — the system commits to 4px / 16px / 24px.
- Do not place Mint Green on button fills, large backgrounds, or hero text — it loses identity when used at scale.
- Do not use a second accent color — the monochrome-plus-one-green rule is the brand's anchor.
- Do not set body text below 14px or use a line-height looser than 1.5 — readability is non-negotiable.
- Do not add gradients, glassmorphism, or colored shadows — the elevation language is flat and forensic.
- Do not use illustration style outside the hero cloud landscape — the rest of the site is pure UI.
- Do not set page background to anything other than white — no off-white canvas, no dark mode surfaces in the content sections.

## Elevation

- **Primary Filled Button:** `lab(2.42579 -0.165291 -0.470081 / 0.03) 0px 2px 4px 0px`
- **Card and Elevated Surface:** `lab(100 0 0 / 0.05) 0px 2px 4px 0px`

## Surfaces

- **Paper White** (`#ffffff`) — Page canvas and the dominant background for all content sections after the hero
- **Mist Gray** (`#f2f2f2`) — Faint card wash and subtle section separators when a step off-white is needed
- **Hero Teal** (`#0c8c5`) — The full-bleed dark hero band with cloud illustration — the only colored surface in the system
- **Ink Black** (`#08090a`) — Filled button surface and the darkest UI element; inverted text contexts on dark backgrounds

## Imagery

The visual language splits into two registers. The hero carries a hand-illustrated cloud landscape — soft volumetric cumulus clouds in warm yellow and cream tones, set against a deep teal-to-mint gradient sky, painted in a style closer to children's book illustration than tech marketing. This is the only expressive visual on the entire site. Below the fold, imagery shifts to product screenshots and customer photography: customer story cards use 16:9 photographic stills with subtle gradient overlays that fade the bottom edge for text legibility. Partner logos are rendered in grayscale. There are no abstract 3D renders, no geometric patterns, no decorative gradients. The product UI itself (the documentation mockup in the hero) is treated as the primary visual asset on the page.

## Layout

The page opens with a full-viewport dark hero (teal gradient + cloud illustration) containing a centered headline stack, email input, and a large floating documentation product mockup that overlaps the bottom edge of the hero into the white section below. The product mockup acts as a visual bridge between the expressive hero and the austere content sections. Below the hero, the layout shifts to a 1200px max-width centered container with 80px section gaps. Sections alternate between centered headline + paragraph + card grids (3-column for customer stories, 2-column for feature cards) and logo wall bands. Navigation is a single horizontal top bar, sticky on scroll, transparent on the hero and white on content sections. The page is spacious — comfortable density, generous breathing room, no dense information blocks or multi-column body content.

## Similar Brands

- **Linear** — Same single-accent discipline — monochrome interface with one vivid color doing all the brand work, Inter typography, square-cornered buttons, forensic shadows
- **Vercel** — Same near-black ink on pure white canvas, single chromatic moment per page, tight Inter tracking, 4px button radii
- **Resend** — Same monochrome-plus-one-accent pattern with Inter, product-as-hero composition, and the same commitment to whitespace between sections
- **Notion** — Same documentation-product-as-marketing approach, clean white sections, and restrained use of color for functional states only
