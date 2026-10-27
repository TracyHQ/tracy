# FeedHive — Style Reference
> Lavender control room at dawn. One confident blue-violet accent breathing over a near-white workspace.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

FeedHive uses an airy productivity-workspace language: a near-white lavender canvas (#f3f5ff), crisp white cards floating on top, and a single confident blue-violet accent (#4457ff) that makes actions feel switched on without ever dominating. Typography relies entirely on one custom geometric sans (Thicccboi) at generous sizes — 60px displays, 16px body — giving every screen a calm, modern cadence. Surfaces are flat and mostly shadowless; the one signature blue-tinted glow is reserved for the product mockup hero, never for ordinary cards. The system treats color as punctuation: pages stay 95% achromatic, and the brand violet appears only on filled CTAs, the gradient text accent, floating social-media decorations, and the AI chat orb.

## Colors

| Name | Value | Role |
|------|-------|------|
| Lavender Canvas | `#f3f5ff` | Page background — the entire site sits on this faint blue-lavender wash instead of pure white, which warms the space and lets white cards lift visibly |
| Card White | `#ffffff` | Card surfaces, modal panels, nav bar, elevated UI blocks |
| Ink | `#181c31` | Primary text, headings, button labels — a near-black with a blue undertone, not pure #000 |
| Muted Iris | `#757693` | Body text, nav links, secondary copy, helper text, footer links — a desaturated violet-gray that keeps the type hierarchy warm without competing with the brand accent |
| Border Mist | `#e5e7eb` | Hairline dividers, input borders, card outlines, table rules |
| Hover Iris | `#6b7280` | Slightly deeper secondary text for hover/active metadata |
| Soft Blue Wash | `#dbeafe` | Highlighted surface tint, selected row state, subtle feature-panel background — the lightest visible blue in the palette |
| Brand Violet | `#4457ff` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Brand Violet Light | `#7583fd` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |
| Shadow Violet | `#c7c8e2` | Reference color for the signature blue-tinted product mockup glow — shadows are cast in violet, never gray |

## Typography

### Thicccboi — The only typeface in the system. Display headlines at 60px weight 700, hero sublines at 44px weight 700, section headings at 34–36px weight 600, body at 16px weight 400, and labels at 12–14px weight 500. The geometric, slightly rounded sans gives the brand a friendly-but-technical voice — closer to a productivity tool than a marketing site.
- **Substitute:** DM Sans, Manrope, or Inter (in that order of preference)
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12, 14, 16, 18, 20, 24, 34, 36, 44, 60
- **Line height:** 1.00–1.63

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.57 | — |
| body | — | — | 16px | 1.56 | — |
| body-lg | — | — | 18px | 1.56 | — |
| subheading | — | — | 20px | 1.4 | — |
| heading-sm | — | — | 24px | 1.33 | — |
| heading | — | — | 36px | 1.25 | — |
| heading-lg | — | — | 44px | 1.11 | — |
| display | — | — | 60px | 1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **mid:** 15px
- **tags:** 9999px
- **cards:** 24px
- **icons:** 9999px
- **small:** 8px
- **images:** 12px
- **buttons:** 9999px

## Components

### Primary Pill Button
**Role:** Main call-to-action across hero, nav, and section endings

Filled with the brand action gradient (#4457ff → #7583fd), white text in Thicccboi 16px weight 500, 9999px radius, padding 12px 24px, inline arrow icon. The gradient (not a solid fill) is what makes these buttons feel premium rather than utilitarian.

### Ghost Nav Button
**Role:** Secondary text-link in the nav (Log in)

Transparent background, Muted Iris (#757693) text weight 500, no border, no padding. Sits inline with the primary pill to its right.

### Gradient Text Accent
**Role:** Highlight a key phrase within an otherwise ink-colored headline

Apply linear-gradient(to right, #4457ff, #7583fd) as background-clip: text on a span inside the headline. Used once per major heading — overusing destroys its emphasis.

### Star Rating Badge
**Role:** Trust signal above hero and inside testimonial cards

Row of 5 small gold/yellow star icons (#fbbf24) with optional Muted Iris caption below, inline-aligned center.

### Social Platform Icon Strip
**Role:** Show supported platforms under the hero subheading

Horizontal row of 8–10 small (24px) brand-colored social icons (Instagram gradient, Facebook blue, YouTube red, TikTok, LinkedIn, X, Pinterest, Discord) at 16–20px gap, centered, no background container.

### Product Mockup Hero
**Role:** Primary hero visual on the landing page

Screenshot of the FeedHive dashboard UI, tilted at a slight perspective angle, surrounded by floating 3D-style social media icons (red heart, blue thumbs-up, red play button) at varied scales. The mockup sits on the signature blue-tinted glow (rgba(32,36,138,0.25) -19px 5px 60px 4px). Width roughly 90% of viewport, centered.

### Testimonial Card
**Role:** 4-column grid of customer quotes on social-proof sections

White #ffffff surface on the lavender canvas, 24px radius, 24px padding, no border, no shadow. Header row: 48px circular avatar (object-fit cover), name in Ink #181c31 weight 600, role/company in Muted Iris #757693 weight 400 below. Star row (#fbbf24) above the quote. Quote text in Ink #181c31, 16px weight 400, line-height 1.56.

### AI Chat Orb
**Role:** Persistent floating helper widget in bottom-right

56px circular button, solid Brand Violet #4457ff, white speech-bubble icon centered, fixed position bottom 24px right 24px, with an attached expandable panel above it that previews a greeting message.

### Trust Stats Bar
**Role:** Inline trust signal under hero sections

Single line, centered, Muted Iris #757693 weight 400 at 18px, with the numeric value highlighted in Brand Violet #4457ff weight 600. e.g. 'Trusted by +30,000 businesses, agencies and content creators.'

### Floating Social Decoration
**Role:** Atmospheric 3D-style icons scattered around the product mockup

Red heart, blue thumbs-up, red play triangle, drawn in flat solid colors with subtle inner shadow for depth. Sized 40–80px, rotated 10–25°, placed outside the mockup boundary to create a 'social buzz' feel.

### Avatar Stack
**Role:** Composite reviewer avatars shown in testimonial section header

Row of 4 overlapping 40px circular photos, each with a 2px white border, -8px horizontal overlap. Followed by star count and 'from +300 reviews' caption in Muted Iris.

## Do's and Don'ts

### Do
- Use 9999px radius for every button, tag, and icon container — pill is the default, not an option
- Set page background to Lavender Canvas #f3f5ff and use Card White #ffffff for any surface that needs to lift
- Use Thicccboi weight 700 at 60px for display headlines; never go above 60px
- Apply the brand action gradient (#4457ff → #7583fd) to exactly one CTA per screen
- Use the gradient-text treatment on a single phrase inside a headline, no more than once per section
- Cast the blue-tinted shadow only on the product mockup; keep all other UI flat
- Keep accent color usage below 5% of any screen — the violet is punctuation, not paint

### Don't
- Don't use pure white #ffffff as a page background — always use the lavender canvas so white cards have something to lift off
- Don't use pure black #000000 for text — use Ink #181c31, which carries a blue undertone matching the brand
- Don't add drop shadows to cards, buttons, or inputs — the system is flat by design
- Don't introduce a second accent color — green, red, and orange are not part of this palette
- Don't apply the gradient text effect to body copy or more than one phrase per heading
- Don't use sharp corners (0–4px) on interactive elements — pills only for buttons and tags
- Don't stack the brand violet on the lavender canvas without sufficient size or weight — it needs contrast to register

## Elevation

- **Product Mockup / Hero Image:** `rgba(32, 36, 138, 0.25) -19px 5px 60px 4px`

## Surfaces

- **Page Canvas** (`#f3f5ff`) — Base background for every page — subtle lavender tint instead of white
- **Card Surface** (`#ffffff`) — Testimonial cards, pricing cards, feature blocks, nav bar
- **Highlighted Surface** (`#dbeafe`) — Selected states, highlighted info panels, gradient wash bottom stop
- **Brand Surface** (`#4457ff`) — Primary CTA fill, AI chat orb, gradient start

## Imagery

Imagery is dominated by the in-app product screenshot, which appears once as a tilted hero mockup surrounded by floating 3D-style social media icons (red heart, blue thumbs-up, red play). Customer avatars in testimonial cards use real photography at 48px circular crops. No lifestyle photography, no illustrations, no abstract graphics beyond the floating decorations. The product UI itself is the brand's visual proof — the page sells the screen you see.

## Layout

Centered max-width container at 1200px, with the nav spanning full-bleed white above it. The hero is a single-column centered stack: star badges, large 60px headline with gradient phrase, 20px subheading, social-icon strip, CTA button, then the product mockup breaking below at near-full viewport width. Sections are separated by 80px vertical gaps with no dividers — the lavender canvas + white cards alone define the rhythm. Testimonial sections use a 4-column card grid. Floating elements (social icons, chat orb) break the container to add liveliness. No sidebar, no mega-menu — top bar only.

## Similar Brands

- **Buffer** — Same social-media-management product category with a near-white canvas and a single confident primary color
- **Typefully** — Same flat, generous-whitespace layout language with pill CTAs and a single accent hue
- **Framer** — Same flat-on-canvas approach with product screenshot as the hero visual, and a blue-violet accent
- **Linear** — Same custom geometric sans, large display headlines, and gradient text treatment on key phrases
