# Calendly.com — Style Reference
> Navy ink on cool marble.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Calendly reads as a quiet, confident scheduling workspace: a near-white canvas with generous breathing room, crisp white product cards floating on cool stone-gray, and all typography rendered in deep navy ink rather than pure black. The defining move is the navy (#0b3558) used everywhere text appears — headings, buttons, icons, links — which softens the entire interface into something warmer and more editorial than a typical SaaS landing page. A single vivid blue (#006bff) carries every primary action, while decorative pink and cyan blobs bleed from behind product mockups to add warmth without clutter. Components stay restrained: thin 1px hairline borders, subtle blue-tinted shadows, generous 24px card radii, and 8px button corners that feel intentional rather than pill-soft.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Navy | `#0b3558` | Primary text, headings, icons, dark CTA backgrounds, nav links |
| Signal Blue | `#006bff` | Primary CTA fill, active nav, link accents, selected states |
| Slate Gray | `#476788` | Secondary body copy, helper text, muted labels |
| Mist Gray | `#a6bbd1` | Disabled text, inactive feature labels, light icon strokes |
| Cloud | `#f8f9fb` | Page canvas, footer background, secondary surface |
| Paper | `#ffffff` | Card surfaces, elevated panels, button text on dark fills |
| Pebble | `#f0f3f8` | Badge backgrounds, input fills, subtle dividers, hover washes |
| Hairline | `#d4e0ed` | Card and input borders, dividers, link underline defaults |
| Carbon | `#0a0a0a` | Pure-black text fallback, logo glyph, icon fill |
| Coral Magenta | `#e55cff` | Decorative accent blob behind product cards — adds warmth without UI function |
| Sky Cyan | `#0099ff` | Decorative accent blob behind product cards — pairs with magenta for gradient washes |
| Deep Cobalt | `#004eba` | Badge text on Pebble fills, info labels |

## Typography

### Gilroy — All interface text. Gilroy is a geometric humanist sans with wide apertures and even stroke contrast; its bold weights (700) carry the display headlines, while 500–600 handles buttons and subheads. Substitute with Manrope or Inter.
- **Substitute:** Manrope
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12, 14, 16, 18, 20, 24, 28, 38, 50, 68, 80
- **Line height:** 1.0–1.71 by step
- **Letter spacing:** normal across all sizes

### Gilroy — Body text and universal UI labels — weight 400 keeps long copy readable without feeling heavy
- **Weights:** 400
- **Sizes:** 16
- **Line height:** 1.0

### Gilroy — Secondary headings and emphasized body — the 14/500 is the workhorse for card titles and inline labels
- **Weights:** 500
- **Sizes:** 14, 20
- **Line height:** 1.4

### Gilroy — Button labels and subheadings — 18/600 is the canonical button weight, 24–28/600 for section subheads
- **Weights:** 600
- **Sizes:** 18, 24, 28
- **Line height:** 1.4–1.6

### Gilroy — Display and hero headlines — the 80px and 68px sizes are unusually large for a SaaS hero, giving the page editorial weight
- **Weights:** 700
- **Sizes:** 38, 50, 68, 80
- **Line height:** 1.2–1.21

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0px |
| body-sm | — | — | 14px | 1.4 | 0px |
| body | — | — | 16px | 1 | 0px |
| button | — | — | 18px | 1.6 | 0px |
| body-lg | — | — | 20px | 1.4 | 0px |
| subheading | — | — | 28px | 1.4 | 0px |
| heading-sm | — | — | 38px | 1.21 | 0px |
| heading | — | — | 50px | 1.2 | 0px |
| heading-lg | — | — | 68px | 1.2 | 0px |
| display | — | — | 80px | 1.2 | 0px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48-64px
- **Card padding:** 24px
- **Element gap:** 8-16px

### Border Radius

- **cards:** 24px
- **small:** 4px
- **badges:** 9999px
- **inputs:** 8px
- **buttons:** 8px
- **productCards:** 16px

## Components

### Primary CTA Button
**Role:** Filled button for the main action on a screen

Background #006bff, text #ffffff at 18px weight 600, border-radius 8px, padding 6px 16px (compact) or 10px 16px (comfortable). No border. Used for "Sign up for free", "Get started", "Sign up with Google".

### Dark CTA Button
**Role:** Secondary filled action, often paired with primary for contrast

Background #0b3558, text #ffffff at 18px weight 600, border-radius 8px. Used for "Sign up with Microsoft" and "Get started" in the header.

### Ghost Text Link
**Role:** In-flow text link with no background

Color #0b3558 at 14–18px weight 500–600, no background, no border, no padding. Underline optional on hover. Used for inline body links like "View all integrations", "Learn more".

### Outlined White Button
**Role:** Ghost button on dark or image backgrounds

Color #ffffff, border 1px solid #ffffff, border-radius 4px, no background fill. Used over hero imagery or dark sections.

### Social Sign-In Button
**Role:** OAuth entry point

Full-width pill with provider logo left, text right. Two variants: Google (white bg, #0b3558 text, 1px Hairline border) and Microsoft (Ink Navy bg, white text, no border). Padding 12px 16px, border-radius 8px.

### Elevated Product Card
**Role:** Showcases a product mockup or UI screenshot

Background #ffffff, border-radius 16px, padding 0px (image fills card). Three-layer blue-tinted shadow: rgba(71,103,136,0.04) 0 4px 5px, rgba(71,103,136,0.03) 0 8px 15px, rgba(71,103,136,0.08) 0 30px 50px. Often sits in front of a Coral Magenta or Sky Cyan decorative blob.

### Feature Accordion Item
**Role:** Expandable or highlighted feature row

Active item: heading #0b3558 at 18–20px weight 600 with #006bff icon; inactive items: heading #a6bbd1 at 16px weight 400. Left-aligned icon, right-aligned chevron. 1px Hairline divider below.

### Pill Badge
**Role:** Inline label for promotions, status, or tags

Background #e6f0ff (Pebble-tinted), text #004eba at 12px weight 500, border-radius 50px, padding 4px 8px. Examples: "Save 16%", "We're hiring!".

### Trust Logo Strip
**Role:** Social proof band below hero

Single row of monochrome partner logos (Compass, L'Oréal, Zendesk, Dropbox, Gong, Carnival, Indiana University) in #a6bbd1, evenly spaced, centered. No card, no border — logos float on the canvas.

### Booking Widget Card
**Role:** Embedded preview of Calendly's scheduling UI

Background #ffffff, border-radius 16px, internal padding 0px. Three columns: organizer info (avatar + name), date grid (calendar with selected date highlighted #006bff), time slots (pill buttons with active state in #006bff). Mimics the actual product.

### Section Header Block
**Role:** Centered intro for content sections

H2 heading at 50–68px weight 700 in #0b3558, centered. Subtext at 16px weight 400 in #476788, centered, max-width ~640px. Optional CTA button below.

### Footer
**Role:** Site-wide footer with link columns

Background #f8f9fb, padding 40px horizontal. Link columns in #0b3558 at 14px weight 500, headings at 12px weight 600 uppercase in #476788.

## Do's and Don'ts

### Do
- Use Ink Navy #0b3558 for all text — never pure #000000, which breaks the system's warmth
- Use Signal Blue #006bff exclusively for filled primary CTAs; reserve Ink Navy for secondary dark buttons
- Set all card border-radius to 16px for product cards and 24px for feature panels
- Apply the three-layer blue-tinted shadow stack to any elevated surface above the canvas
- Use Gilroy weight 700 at 50–80px for hero and section headlines — undersized headings lose the page's editorial confidence
- Place every product visual in front of a Coral Magenta or Sky Cyan decorative blob offset by 20–40px
- Set buttons at 8px border-radius — not 4px (too sharp) and not pill (too soft) for this system

### Don't
- Don't use #000000 as a text color — always reach for Ink Navy #0b3558 or Slate Gray #476788
- Don't apply shadows with neutral black (rgba(0,0,0,...)) — all elevation must use the blue-tinted shadow base
- Don't use the decorative magenta/cyan blobs as fills for UI elements — they are atmosphere only, not functional color
- Don't create buttons with border-radius above 12px or below 4px — 8px is the system's sharp-but-soft sweet spot
- Don't set heading sizes below 38px for H2 or below 24px for H3 — the type scale skips small headings on purpose
- Don't use the badge color #004eba for CTAs — it reads as informational, not actionable
- Don't add gradients to backgrounds — the system is flat surfaces with shadow-based elevation only
- Don't pair the Signal Blue and Ink Navy CTAs on the same surface without enough spacing — they compete at close range

## Elevation

- **Elevated Product Card:** `rgba(71, 103, 136, 0.04) 0px 4px 5px 0px, rgba(71, 103, 136, 0.03) 0px 8px 15px 0px, rgba(71, 103, 136, 0.08) 0px 30px 50px 0px`
- **Link card with icon:** `rgba(71, 103, 136, 0.04) 0px 4px 5px 0px, rgba(71, 103, 136, 0.03) 0px 4px 10px 0px, rgba(71, 103, 136, 0.05) 0px 10px 20px 0px`
- **Button:** `rgba(71, 103, 136, 0.04) 0px 4px 5px 0px, rgba(71, 103, 136, 0.03) 0px 8px 15px 0px, rgba(71, 103, 136, 0.06) 0px 15px 30px 0px`

## Surfaces

- **Canvas** (`#f8f9fb`) — Page background, footer surface
- **Card** (`#ffffff`) — Elevated product cards, booking widget, feature panels
- **Input Fill** (`#f0f3f8`) — Form inputs, badge backgrounds, subtle hover washes
- **Dark Surface** (`#0b3558`) — Dark CTA buttons, inverse sections
- **Accent Surface** (`#006bff`) — Primary action fills, selected/active states

## Imagery

Product screenshots are the primary visual — clean UI mockups of the booking calendar rendered on pure white cards with generous rounded corners. Decorative treatment: each product card is backed by a soft blob shape in Coral Magenta (#e55cff) or Sky Cyan (#0099ff), slightly offset and blurred, creating an editorial collage effect rather than a flat screenshot. No photography, no lifestyle imagery — all visuals are product UI, abstract accent shapes, or monochrome partner logos in the trust strip. Icons are line-style with 1.5–2px stroke weight, mono-tone in Ink Navy or Signal Blue.

## Layout

Max-width 1200px centered, generous outer margins on desktop. Hero is a two-column split: left column holds the 80px headline + body copy + stacked sign-in buttons, right column holds the booking widget card backed by decorative blob shapes. Below the hero sits the trust logo strip as a single full-width band. Subsequent sections alternate between centered header blocks (H2 + subtext + optional CTA) followed by two-column feature blocks (text-left/product-right or product-left/text-right) with decorative accent blobs behind every product visual. Card grids are rare — the layout prefers side-by-side paired sections over multi-column grids. Section gaps are 48–64px. Navigation is a 64px sticky top bar with logo left, centered menu, and CTA cluster right.

## Similar Brands

- **Linear** — Same Ink Navy text on near-white canvas, blue-tinted shadows, and single vivid blue primary action — both treat restraint as a feature
- **Notion** — Similar white-card-on-cool-gray layout, generous 16–24px radii, and navy/blue text palette that avoids pure black
- **Loom** — Same editorial heading sizes (50–80px bold), product-screenshot-in-front-of-colorful-blob hero treatment, and clean light-mode SaaS language
- **Webflow** — Shares the white canvas + navy text + single electric blue accent, with decorative gradient shapes behind product visuals
