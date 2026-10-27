# Descript — Style Reference
> Broadcast booth meets editorial press — deep burgundy theater dark, editorial serif headlines, coral on-air signals.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Descript's visual language is deep burgundy darkness cut by coral-red action — like the interior of a recording booth where the walls absorb everything and only the signal glows. The #390a1a near-black burgundy dominates 70% of the hero, creating a theater-dark immersion that makes the coral-red CTA (#f73b3b) feel like an on-air indicator light. Headlines use Gamuth Display, a custom editorial serif at 88px — an unusual choice for a SaaS product that signals craft and content creation rather than enterprise utility. The light sections (#faf8f7, a warm off-white) provide contrast between dark bands without ever going pure white, keeping the palette unified in warmth. Tag labels like 'AI VIDEO EDITOR' use Brett, a custom typeface with wide 0.04em tracking that mimics broadcast chyron styling.

## Colors

| Name | Value | Role |
|------|-------|------|
| Broadcast Burgundy | `#390a1a` | Hero backgrounds, primary dark surface — creates the theater-dark immersion that makes coral CTAs read as on-air signals |
| On-Air Coral | `#f73b3b` | Primary CTA buttons, active section labels — the single vivid signal against deep burgundy dark |
| Hot Take Red | `#ff5340` | Inline text highlights, secondary accent emphasis in body copy |
| Plum Mid | `#651a39` | Nav hover states, secondary button backgrounds — one step lighter than Broadcast Burgundy for interactive depth |
| Deep Violet | `#0c0b5f` | Inline links and callout text in light sections — a cool contrast to the otherwise warm palette |
| Soft Violet | `#8787e0` | Underlord AI feature accent — used on AI chat interface send button |
| Pale Peach | `#ffe8db` | Card backgrounds for feature cards in warm sections |
| Blush Mist | `#f1eaed` | Card backgrounds for testimonial and feature content cards in light sections |
| Studio Black | `#190308` | Deepest background layer, nav overlay backgrounds |
| Ink Dark | `#1a1a1a` | Body text, nav text — used across all surfaces |
| Warm Parchment | `#faf8f7` | Light section page backgrounds, button text on dark — deliberately off-white to maintain warmth against burgundy |
| Pure White | `#ffffff` | Button text on coral CTAs, card surfaces in chat UI |
| Dusty Rose | `#a28993` | Secondary body text, de-emphasized labels on dark surfaces |
| Border Mauve | `#907580` | Card borders, dividers, input borders on dark surfaces |
| Fog Gray | `#e5e7eb` | Borders and dividers on light surfaces, button borders |
| Muted Plum | `#583f4a` | Mid-dark card backgrounds in dark sections |
| Steel Mauve | `#d1c7cb` | Shadows, secondary text on light surfaces |

## Typography

### Booton — Primary workhorse across UI — nav, body copy, buttons, captions, and feature labels. Weight 600 for subheadings and card titles; weight 400 for body and nav. The custom design gives it a warmth that distinguishes it from commodity grotesques like Inter.
- **Substitute:** Source Sans Pro, IBM Plex Sans
- **Weights:** 400, 600
- **Sizes:** 16px, 18px, 20px, 24px, 56px
- **Line height:** 1.10–1.56
- **Letter spacing:** -0.32px at 16px (−0.02em applied across all sizes)
- **OpenType features:** `"calt", "liga"`

### Gamuth Display — Hero and section headings only. A custom editorial serif — the signature choice that marks Descript as a content creation tool, not enterprise SaaS. Weight 400 at 88px is confident restraint; most SaaS hero fonts lean heavy.
- **Substitute:** Playfair Display, Fraunces
- **Weights:** 400
- **Sizes:** 40px, 56px, 88px
- **Line height:** 1.10–1.20
- **OpenType features:** `"calt", "liga"`

### Brett — Section eyebrow labels only (e.g. 'AI VIDEO EDITOR', 'AI VIDEO AGENT'). Wide 0.04em tracking mimics broadcast chyron or print section slugs — the only place positive letter-spacing appears in the system.
- **Substitute:** Courier Prime, Space Mono
- **Weights:** 400
- **Sizes:** 18px
- **Line height:** 1.00–1.56
- **Letter spacing:** 0.72px at 18px (0.04em)
- **OpenType features:** `"calt", "liga"`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 16px | 1.5 | -0.32px |
| body-sm | — | — | 18px | 1.56 | -0.36px |
| body | — | — | 20px | 1.5 | -0.4px |
| subheading | — | — | 24px | 1.33 | -0.48px |
| heading-sm | — | — | 40px | 1.2 | — |
| heading | — | — | 56px | 1.1 | — |
| display | — | — | 88px | 1.1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Element gap:** 16px

### Border Radius

- **cards:** 4px
- **badges:** 100px
- **inputs:** 8px
- **buttons:** 12px
- **buttonsPill:** 9999px

## Components

### Primary CTA Button
**Role:** Main conversion action — 'Get started for free'

Background #f73b3b, text #fff7fd (warm white), border-radius 12px, padding 16px 32px. Booton weight 600 at 18px. No border. The coral against dark backgrounds is the loudest element in the hierarchy.

### Dark Pill Icon Button
**Role:** Media controls and compact icon actions in dark sections

Background #390a1a, border-radius 9999px, padding 12px all sides. Square-ish pill with icon only. #651a39 variant used for hover/active state.

### Sign Up Nav Button
**Role:** Primary nav conversion CTA

Background #651a39 (Plum Mid), text white, border-radius 12px, padding 12px 20px. Sits in sticky white nav — creates a warm burgundy-to-plum contrast against #faf8f7 nav background.

### Eyebrow Label
**Role:** Section category tags above hero headings

Brett typeface, 18px, 0.04em letter-spacing, #f73b3b (On-Air Coral) on dark surfaces, uppercase. No background, no border. Used exclusively to introduce section headings.

### Feature Card — Blush
**Role:** Feature description cards in light sections

Background #f1eaed (Blush Mist), border-radius 4px, padding 24px 24px 32px, no shadow. Booton 600 for card title at 20px, Booton 400 for body at 16px, #1a1a1a text.

### Feature Card — Peach
**Role:** Alternate feature cards with warmer tint

Background #ffe8db (Pale Peach), border-radius 4px, padding 24px 24px 32px, no shadow. Same typography treatment as Blush card.

### Testimonial Card
**Role:** Social proof quotes in grid layout on dark background

Background #583f4a (Muted Plum), border-radius 4px, padding 24px. Booton 400 at 16px, text #faf8f7. Subtle border-color #907580. No shadow.

### AI Chat Interface Card
**Role:** Product UI preview showing Underlord AI assistant

Background #ffffff, border-radius 12px, box-shadow rgba(0,0,0,0.16) 0px 2px 4px. Inner message bubbles use #cdcdfe (muted violet) for AI messages, #8787e0 for send button. Booton 400 at 16px.

### Nav Bar
**Role:** Sticky top navigation

Background #faf8f7, border-bottom #e5e7eb 1px. Text #1a1a1a at 16px Booton 400. Dropdown chevrons as inline icons. Max-height 50px. Contains wordmark (Descript logo with stacked-lines icon in #f73b3b), text nav links, and Sign Up pill button in #651a39.

### Social Proof Logo Strip
**Role:** Trust logos (Canva, Figma, Spotify, etc.)

Full-width band on #390a1a background. Logos rendered in #faf8f7 or desaturated white at reduced opacity. Booton 400 16px label text above in #a28993.

### Category Tag Badge
**Role:** Filter tags and feature category pills

Border 1px solid #907580, background transparent, border-radius 100px, padding 6px 12px. Booton 400 at 14-16px, text #faf8f7 on dark / #1a1a1a on light. Used in Awards card to show product category labels.

### Awards Recognition Card
**Role:** G2 award display in testimonials section

Background #faf8f7, border-radius 4px, padding 24px. Contains G2 badge images, year label in #f73b3b (Brett 18px), category tag badges with transparent background and #907580 borders.

## Do's and Don'ts

### Do
- Use Gamuth Display weight 400 for all H1/H2 hero headlines — never bold or weight 700
- Precede every major section heading with a Brett 18px, 0.04em tracked eyebrow label in #f73b3b
- Apply #f73b3b background with 12px border-radius and 16px/32px padding for all primary CTAs
- Pair #390a1a dark sections immediately with #faf8f7 light sections — maintain alternating band rhythm
- Use 4px border-radius for all cards; reserve 12px for floating UI components and modals
- Set Booton letter-spacing to −0.02em (negative) across all body sizes — never neutral or positive tracking except in Brett eyebrows
- Use #583f4a as the elevated card surface on dark #390a1a backgrounds — never pure black or white cards on dark sections

### Don't
- Never use a pure white (#ffffff) page background — all light surfaces use #faf8f7 (Warm Parchment)
- Never apply Gamuth Display to body copy, captions, or UI labels — it is heading-only at 40px minimum
- Never use the coral CTA (#f73b3b) for more than one button per screen — it functions as a single focal signal
- Never add drop shadows to section cards — background-color contrast alone defines elevation on card surfaces
- Never use a generic sans-serif substitute for Booton without applying −0.02em letter-spacing — positive or zero tracking breaks the warmth
- Never place green, blue, or teal semantic colors in the UI — the system has no cool-hued semantic states; use only the warm coral/burgundy/violet palette
- Never use border-radius above 12px on cards or sections — 9999px is reserved exclusively for compact icon pill buttons

## Elevation

- **AI Chat Card:** `rgba(0, 0, 0, 0.16) 0px 2px 4px 0px`
- **Nav Dropdown:** `rgba(0, 0, 0, 0.16) 0px 2px 4px 0px`

## Surfaces

- **Studio Dark** (`#190308`) — Deepest background — used behind logo strip and page footer
- **Broadcast Burgundy** (`#390a1a`) — Hero and primary dark sections — dominant dark surface
- **Muted Plum** (`#583f4a`) — Cards and elevated containers on dark backgrounds
- **Warm Parchment** (`#faf8f7`) — Light section backgrounds, nav bar — the opposing pole to the dark surfaces
- **Blush Mist** (`#f1eaed`) — Cards and containers on light section backgrounds
- **Pure White** (`#ffffff`) — UI components like chat cards that need maximum contrast on any surface

## Imagery

Product UI screenshots are the primary visual asset — shown as floating cards partially cropped, overlapping, presented at perspective to simulate depth. No lifestyle photography in screenshots; the product interface IS the visual. UI previews show the Descript editor with real transcript text, building credibility through product exposure. G2 badge art (flat, illustrative award icons) appears in the social proof section. Icons use a filled-with-outline hybrid style at approximately 20-24px, monocolor matching the surface text color. The Underlord AI chat component is showcased as a standalone card with a clean white background floating against the dark hero — product-as-hero framing. All imagery is contained within rounded-corner cards (12px) rather than full-bleed, maintaining the 'exhibit behind glass' feel.

## Layout

Max-width approximately 1200px, centered with generous horizontal padding. Hero is full-bleed #390a1a burgundy dark spanning 100vh with centered headline stack and single CTA. Below hero, alternating dark (#390a1a) and light (#faf8f7) horizontal bands create a clear rhythm — dark for brand immersion, light for feature explanation. Feature sections use 2-3 column card grids with 24px gaps. Testimonials use a 2-column card grid on dark background with an awards card occupying the left column. Social proof logo strip is full-bleed single row between hero and feature sections. Navigation is sticky white bar at top with left-aligned wordmark and right-aligned utility links + CTA button. Section headings are always centered with eyebrow label above and subtext below, max-width ~640px for readability.

## Similar Brands

- **Rive** — Same mixed dark/light banded layout with a single vivid accent color on otherwise neutral-dark hero sections
- **Framer** — Custom editorial serif for SaaS hero headlines combined with product-UI-as-hero visual strategy
- **Loom** — Creator-tool SaaS with dark brand sections, coral/warm CTAs, and video product screenshot previews
- **Pitch** — Deep dark brand color as primary surface with warm off-white light sections and editorial type scale
- **Runway ML** — AI creative tool using dark theatrical hero + single bright CTA + product interface showcase as primary imagery
