# Grafbase — Style Reference
> engineering blueprint on cool marble

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Grafbase operates as a clinical, near-monochrome developer tool: a white canvas with charcoal text, a single gray surface tier, and zero chromatic noise in the interface itself. The system derives all its warmth and signaling from one place — the mint-to-teal gradient announcement bar — and from muted mint/teal tints inside product screenshots. Typography is a single family (Inter) stretched to extremes: a 90px display weight of 600 with -0.05em tracking, a 40px heading at 500, and a calm 16px body. Components feel like graph paper: 6px button radii, 20px card radii, hairline 1px borders, almost no shadows. The result reads as engineered, not decorated — an API console that happens to be a website.

## Colors

| Name | Value | Role |
|------|-------|------|
| Graphite Ink | `#1b1b1b` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Marble | `#ffffff` | Card surfaces, elevated panels, nav background, button text on dark fills. The brightest layer in the system |
| Drafting Gray | `#eaeaea` | Page canvas and section backgrounds. The second surface tier beneath white cards — the tone of the drafting table itself |
| Steel | `#60646c` | Secondary body text, subtext, helper copy. Carries information density without competing with primary headings |
| Ash | `#7c7c7c` | Muted tertiary text and less-emphasized metadata. Used where information recedes |
| Hairline | `#e0e1e6` | 1px borders, card outlines, divider rules. The system's structural lines — cool-tinted to read as architectural, not decorative |
| Mint Signal | `#00f2e6` | Saturated cyan-mint used inside product UI mockups and integration icon tiles. Not an interface accent — it is product-content color bleeding into marketing surfaces |
| Moss | `#8dc63f` | Secondary chromatic accent appearing in product screenshot data and integration tiles. Sits next to Mint Signal in the same icon/system cluster |
| Sky | `#00b9f1` | Tertiary accent in product UI and integration iconography. Completes the cool triad (mint, moss, sky) that defines the brand's chromatic fingerprint within screenshots |
| Forest-to-Deep Gradient | `linear-gradient(89.97deg, rgb(25, 160, 95) 0.02%, rgb(13, 127, 140) 123.85%)` | Announcement bar gradient spanning green (#19a05f) into deep teal (#0d7f8c). Sole place the interface shows color — the only banner-style element on the site |

## Typography

### Inter — Sole typeface. Display uses weight 600 at 90px with -0.05em tracking (about -4.5px) — headline authority through geometric compression rather than heaviness. Headings at 40px use weight 500 with -0.025em tracking for a slightly looser, more editorial register. Body at 16px stays at weight 400 with normal tracking. The 13/14px sizes handle UI chrome and captions. No system fonts, no second family — Inter is the brand.
- **Substitute:** Inter (self-hosted or Google Fonts) — no substitute should change identity
- **Weights:** 400, 500, 600, 700
- **Sizes:** 13, 14, 16, 20, 24, 40, 90
- **Line height:** 1.00, 1.10, 1.43, 1.50, 2.00
- **Letter spacing:** -0.0500em, -0.0250em

### sans (custom utility) — Rare fallback utility class. Treat as Inter — likely a Tailwind 'sans' alias that resolved to a custom stack. Do not introduce as a distinct type family in output.
- **Weights:** 400, 500
- **Sizes:** 14, 16
- **Line height:** 1.43, 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.5 | 0px |
| body | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.5 | 0px |
| heading-sm | — | — | 24px | 1.43 | 0px |
| heading | — | — | 40px | 1.1 | -1px |
| display | — | — | 90px | 1 | -4.5px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 28px
- **Element gap:** 24px

### Border Radius

- **nav:** 6px
- **cards:** 20px
- **panels:** 12px
- **buttons:** 6px
- **buttons-pill:** 40px

## Components

### Announcement Bar
**Role:** Site-wide notification strip

Full-width banner at the very top. Background is the forest-to-deep-teal linear gradient (89.97deg). White text at 14px, centered. Contains a text link and a chevron. Padding roughly 10px vertical. This is the only chromatic surface on the site.

### Navigation Bar
**Role:** Primary site navigation

White (#ffffff) horizontal bar with 1px Hairline (#e0e1e6) bottom border. Height roughly 64px. Left: Grafbase logo (black wordmark with cube icon). Center: product/solutions/resources/extensions links at 14px Inter 500 in Graphite Ink. Right: GitHub star count, theme toggle icon, Sign in button, Get started button. Padding 0 24px.

### Primary Action Button
**Role:** Highest-emphasis CTA

Solid Graphite Ink (#1b1b1b) fill, white text at 14px Inter 500, 6px border-radius, 14px vertical / 20px horizontal padding. Carries the soft drop shadow rgba(0,0,0,0.15) 0px 4px 20px 0px. Examples: 'Try it for free', 'Get started'.

### Ghost Button
**Role:** Secondary CTA

White (#ffffff) fill, 1px Hairline (#e0e1e6) border, Graphite Ink text at 14px Inter 500, 6px border-radius, 14px/20px padding. No shadow. Examples: 'Contact Sales', 'See how our platform works' (with play icon).

### Pill Button (Auth)
**Role:** Tertiary / sign-in variant

White fill, Hairline border, 40px border-radius (fully pill-shaped), Graphite Ink text. Used for the 'Sign in' action — visually softer than the squared 6px buttons to signal 'less commit'.

### Hero Headline
**Role:** Primary page headline

Inter weight 600 at 90px, line-height 1.0, letter-spacing -4.5px (-0.05em), Graphite Ink color. Two-line stack: 'Unify your APIs. / Govern your AI.' Subtext below at 18-20px Inter 400 in Steel (#60646c).

### Product Preview Panel
**Role:** Hero-right visual / dashboard mockup

White card, 20px radius, Hairline border, soft shadow. Contains a left sidebar nav (Overview, Schema, Explorer, Proposals, Analytics, Traces, Changelog, Checks, Subgraphs, Deployments, Settings) with active item in lighter gray. Right pane shows API metrics with line charts in Mint Signal (#00f2e6). Mockup uses Sky (#00b9f1), Moss (#8dc63f) for data accents.

### Feature Card
**Role:** Section content container

White (#ffffff) fill, 20px border-radius, 1px Hairline border, 28px padding. Headline at 24px Inter 600, body at 16px Inter 400 in Steel. Used in the 'Customize and enable AI agents' section.

### Integration Icon Tile
**Role:** Logo / partner showcase

Small square tile with very pale mint/teal background tint (~#e6f8f5), rounded corners, containing a brand logo. Arranged in a loose grid pattern inside feature cards. Communicates 'integrations' through consistent tile shape, not color saturation.

### Comparison Card
**Role:** Alternative-to card in the "compare" carousel

White fill, 20px radius, Hairline border. Top half is a large circular icon area (~200px) with a very faint concentric ring pattern and a centered thin-line icon. Below: 24px bold heading, 16px subtext, and a Compare ghost button.

### Footer Link Group
**Role:** Site footer navigation

Grouped columns of links at 14px Inter 400 in Graphite Ink. Column headers at 14px Inter 600. No icons, no illustrations — type-driven hierarchy only.

### Carousel Navigation
**Role:** Section paginator

Pair of circular arrow buttons (40px) with 1px Hairline border on white fill, placed right-aligned beneath comparison card row. The only chrome in an otherwise text-driven section.

## Do's and Don'ts

### Do
- Use Graphite Ink (#1b1b1b) for all primary text and all primary action buttons — never introduce a chromatic brand color for CTAs.
- Set display headlines at 90px Inter 600 with letter-spacing -4.5px; headings at 40px Inter 500 with -1px tracking. The negative tracking is the signature — do not normalize it.
- Apply 6px radius to all rectangular buttons, 40px to any pill-shaped button, and 20px to all cards and large content panels.
- Keep the interface fully monochromatic on white #ffffff and #eaeaea surfaces. Reserve the forest-to-teal gradient exclusively for the announcement bar.
- Use Steel (#60646c) for subtext and helper copy, Ash (#7c7c7c) for tertiary metadata — do not invent new grays.
- Build product mockups and integration tiles in the cool triad (Mint Signal, Moss, Sky) so the chromatic identity lives inside the product, not on the marketing chrome.
- Use the single shadow rgba(0,0,0,0.15) 0px 4px 20px 0px on primary buttons and elevated preview panels only — do not stack multiple shadow levels.

### Don't
- Do not add saturated accent colors to the interface — the system is intentionally 99% achromatic.
- Do not use pure black (#000000); use Graphite Ink (#1b1b1b) which is softer against the cool gray canvas.
- Do not introduce a second typeface — Inter is the system, used at every size from 13px caption to 90px display.
- Do not set letter-spacing to 0 on display and heading text — the -4.5px / -1px tracking is what makes the large type feel engineered rather than webby.
- Do not add drop shadows to ghost buttons, cards, or nav — the shadow belongs only on the primary action button and the hero preview panel.
- Do not create button variants with new colors for hover/active states — swap to a slight opacity reduction or a subtle bg-gray-100 treatment instead.
- Do not place the green-to-teal gradient anywhere other than the top announcement bar — it is a one-shot signal, not a reusable surface.

## Elevation

- **Primary action button:** `rgba(0, 0, 0, 0.15) 0px 4px 20px 0px`
- **Dashboard preview panel:** `rgba(0, 0, 0, 0.15) 0px 4px 20px 0px`

## Surfaces

- **Canvas** (`#eaeaea`) — Page background — the drafting table.
- **Card** (`#ffffff`) — All content surfaces: feature cards, nav bar, CTA containers, product mockups.
- **Elevated** (`#ffffff`) — Modals, popovers, and the dashboard preview — same white as Card, distinguished by shadow and z-index, not by a new color.

## Imagery

Imagery is almost entirely product screenshots — high-fidelity dashboard mockups, sidebar nav trees, and line-chart analytics panels rendered in a cool palette of mint/teal/sky. The right half of the hero is a full dashboard preview with sidebar and graphs. Secondary visuals are integration icon tiles (small squares with brand logos on pale mint tints) and thin-line abstract icons inside comparison cards (lightning bolt, trending arrow, downward graph) drawn in Steel at 1.5px stroke weight. No photography, no human imagery, no illustration beyond the icon system. The product UI IS the imagery — it functions as social proof and visual proof at once.

## Layout

Max-width 1200px centered container with 24px gutter padding. Hero is a 50/50 split: left column carries the 90px headline, supporting copy, primary+ghost CTA pair, and a play-link; right column is a 20px-radius dashboard preview card. Subsequent sections are full-width bands alternating between #eaeaea canvas and #ffffff card surfaces, separated by 80px vertical gaps. Feature sections use a 2-column grid for text+visual pairs and a 3-column card row for comparison/feature blocks. The carousel pattern is a horizontal scroll with circular arrow controls right-aligned. Navigation is a single sticky top bar with no secondary nav, no sidebar. The overall rhythm is wide, breathable, and symmetrical — no asymmetric or overlapping compositions.

## Similar Brands

- **Linear** — Same near-monochrome UI with one dark action button, Inter at extremes, hairline borders, and product-screenshot-as-hero treatment.
- **Vercel** — Identical engineering-blueprint feel: white canvas, Inter family, tight tracking on oversized headlines, minimal shadows, and product UI used as the marketing visual.
- **Supabase** — Developer-tool aesthetic with white surfaces, dark text, Inter typography, 6px button radii, and dashboard mockups carrying the brand's only chromatic accents.
- **Neon (Neon.tech)** — Comfortable-density devtools layout with 1200px max-width, gradient announcement bar at the top, Inter type, and the same clinical gray-and-black palette.
- **PlanetScale** — Dark text on white with hairline borders, oversized 80-90px display headlines, single dark CTA, and product-screenshot hero composition.
