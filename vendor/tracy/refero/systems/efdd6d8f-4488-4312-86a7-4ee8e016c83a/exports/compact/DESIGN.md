# Strava — Style Reference
> athlete's logbook on warm paper — a single orange highlighter mark against black-and-white print

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Strava's design reads like an athlete's logbook printed on warm paper: a stark white canvas warmed by off-white surfaces and a disciplined near-black text palette, with one bolt of vivid orange that signals every primary action. The interface is deliberately flat — no gradients, no shadows, no decorative chrome — letting full-bleed photography of cyclists, runners, and hikers in motion carry all the emotional weight. The custom Boathouse typeface and tight, slightly humanist letterforms give the system a print-publication quality rather than a typical SaaS feel. Sharp 4px corners on every interactive element, warm-toned grays instead of cool ones, and an almost monastic restraint with color (one orange, one link blue) create a visual hierarchy where the orange CTA always wins attention without ever needing elevation or glow.

## Colors

| Name | Value | Role |
|------|-------|------|
| Strava Orange | `#fc5200` | Orange supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Link Blue | `#0060d0` | Inline text links and policy references; the only secondary chromatic color and reserved strictly for navigational links |
| Paper White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Warm Linen | `#f9f8f5` | Footer background, secondary surface elevation, subtle banding beneath white |
| Ink Black | `#000000` | Primary body and heading text, icon strokes, hairline borders, button outlines |
| Graphite | `#21211f` | Button text, filled icon strokes, high-contrast warm near-black |
| Charcoal | `#43423f` | Secondary body text, nav links, metadata — warm dark gray for sub-headings and long-form copy |
| Pewter | `#64635e` | Muted helper text, tertiary copy, placeholder labels |
| Bone | `#e0e0de` | Hairline borders, input outlines, dividers between secondary sections |

## Typography

### Boathouse — Sole typeface across all UI, headings, body, nav, and footer. The weight contrast is deliberately binary — 400 for almost everything, 600 reserved for the wordmark, headings, and CTA labels. Tight line-heights (1.0 on display) give headings a compressed, assertive posture rather than the airy SaaS default.
- **Substitute:** Inter or Source Sans 3 (both offer a similar humanist warmth and the 400/600 binary; for closer Boathouse character try Pontano Sans)
- **Weights:** 400, 600
- **Sizes:** 12px, 14px, 15px, 16px, 32px
- **Line height:** 1.00–1.50 (tight, display-leading at 1.0; body at 1.29–1.50)
- **Letter spacing:** normal at all sizes; no tracking adjustment detected

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.5 | — |
| heading | — | — | 32px | 1.2 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Element gap:** 8-12px

### Border Radius

- **tags:** 4px
- **cards:** 0px
- **inputs:** 4px
- **buttons:** 4px

## Components

### Primary CTA Button
**Role:** The only filled chromatic button in the system — reserved for the single most important action on any screen

Fill: Strava Orange #fc5200. Text: #ffffff, Boathouse 600, 16px. Border: none. Radius: 4px. Padding: 14px 20px (vert/horiz). Full-width on the signup card, auto-width in context. White text must always sit on the orange fill — never reverse the polarity.

### Outlined Secondary Button
**Role:** Secondary actions sitting beneath a primary CTA

Fill: #ffffff. Border: 1px solid #000000. Text: #000000, Boathouse 600, 16px. Radius: 4px. Padding: 14px 20px. Used for 'Sign Up With Google' and 'Sign Up With Apple' with the brand icon to the left of the label.

### Social Sign-In Button
**Role:** Third-party authentication entry points

Same shell as Outlined Secondary Button (white fill, 1px #000000 border, 4px radius). Includes a 20px brand icon (Google 'G' or Apple logo) left-aligned with 12px gap before the label.

### Navigation Text Link
**Role:** Top-level nav items and footer column links

No background, no border, no underline. Text: #000000 header / #43423f footer, Boathouse 400, 15px. Hover state darkens to pure black. Caret chevron after 'Activities' indicates a dropdown.

### Header Login Button
**Role:** Outlined account entry in the top-right of the header

Fill: #ffffff. Border: 1px solid #000000. Text: #000000, Boathouse 600, 14-15px. Radius: 4px. Padding: 8px 20px. Visually quieter than the primary orange CTA but uses the same outlined-button shell.

### Signup Card
**Role:** Centered conversion surface floating between two photographic panels

Fill: #ffffff. No border, no shadow, no radius. Vertical padding: 26px top, 50px bottom. Internal element gap: 8-12px. Headline: Boathouse 600 32px, #000000, line-height 1.20. Subtext: 15px #000000. The card relies on the surrounding photography flanking it for visual interest, not on its own styling.

### Hero Photographic Panel
**Role:** Full-bleed athlete imagery flanking the signup card

Edge-to-edge, no radius, no overlay. Images are warm-toned outdoor action photography (cyclists on mountain roads, runners, hikers) — the visual content IS the design. No caption, no gradient, no treatment beyond the raw photograph.

### Footer Column List
**Role:** Sitemap links grouped under column headers

Background: Warm Linen #f9f8f5. Padding: 50px horizontal. Column headers: Boathouse 400 15px #000000 (or bold). Links: Boathouse 400 15px #43423f, hover to #000000. No bullets, no dividers between items — the vertical gap of 8-12px creates rhythm.

### Footer App Store Badge
**Role:** Download CTAs in the footer left column

Black rounded-rect badges (App Store and Google Play). Sit below the Strava wordmark with 12px gap. No text-only alternative — the badge itself is the label.

### Strava Wordmark
**Role:** Brand identity in header and footer

The 'STRAVA' logotype in Strava Orange #fc5200, Boathouse 600. The distinctive flag-tail on the final 'A' is part of the typeface. No icon, no wordmark variant — the logotype is the only brand mark used.

### Legal Inline Link
**Role:** Terms and Privacy references within body copy

Inline text styled in Link Blue #0060d0, no underline by default, underline on hover. Sits within #000000 body copy at 15px.

## Do's and Don'ts

### Do
- Use Strava Orange #fc5200 as a fill only on the single most important action per screen — never as decoration, icon tint, or secondary button
- Set every button and tag to a 4px corner radius; the system has no pills, no circles, no large radii
- Use Boathouse 400 for 90% of text and reserve Boathouse 600 for the wordmark, headings, and button labels — the weight contrast is binary
- Separate layers with Warm Linen #f9f8f5 beneath Paper White #ffffff rather than shadows; the only border color in active use is Bone #e0e0de for hairlines
- Let full-bleed outdoor athlete photography carry emotional weight — the UI itself should stay text-and-button quiet
- Use warm gray tones (#43423f, #64635, #f9f8f5) for all neutrals; never introduce cool grays or blue-tinted shadows
- Keep link blue #0060d0 strictly for inline text links and legal references; never use it for buttons, icons, or backgrounds

### Don't
- Don't add box-shadows, drop-shadows, or glow effects — the system is flat by design and elevation is communicated by surface color only
- Don't introduce a second chromatic color for accents, illustrations, or chart palettes — orange is the only signal
- Don't round buttons or cards beyond 4px — larger radii would break the utilitarian, print-publication feel
- Don't use gradients on backgrounds, buttons, or illustrations — Strava has zero gradients in its system
- Don't swap to a different typeface for headings or display; Boathouse is the only family and the weight handles hierarchy
- Don't use Link Blue #0060d0 as a CTA fill or button border — it is reserved for inline text links only
- Don't add decorative icons, badges, or chrome to the UI; if something isn't a link, button, input, or piece of body text, it probably shouldn't exist

## Elevation

No shadows detected in the data. The system relies entirely on flat surfaces, hairline borders in Bone (#e0e0de), and contrast between Paper White and Warm Linen to create layer separation. Elevation is communicated by surface color, not depth.

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background for hero, signup card, and most sections
- **Linen Band** (`#f9f8f5`) — Footer and any secondary surface band beneath the main canvas

## Imagery

Full-bleed outdoor action photography is the sole visual content layer — no illustrations, no abstract graphics, no product screenshots, no 3D renders. The imagery shows athletes mid-motion (cyclists on mountain switchbacks, trail runners, hikers) in natural light, shot from dynamic angles that emphasize effort and landscape. Color treatment is editorial-natural: warm earth tones, green vegetation, blue sky, no duotone or color grading. Images are edge-to-edge with no overlay, no rounded corners, no caption — the photograph occupies the full panel and bleeds to the viewport edge. Iconography is minimal: small monochrome outlined or filled glyphs in Boathouse-weight strokes, used sparingly for social platforms (Twitter, YouTube, Instagram, LinkedIn, Facebook) in the footer. The visual density is text-and-photo dominant with virtually no decorative illustration.

## Layout

The page uses a three-column hero composition: full-bleed photographic panel on the left, centered signup card in the middle, full-bleed photographic panel on the right. The middle column is constrained to roughly 400-500px while the photographic panels share the remaining viewport width, creating an asymmetric balance where the signup card feels framed by imagery rather than placed on a generic background. Below the hero, the layout transitions to a flat footer band on Warm Linen #f9f8f5 containing a 4-column sitemap with the Strava wordmark and app store badges anchoring the far left. The overall page is max-width contained at approximately 1200px, centered, with generous vertical breathing room. Navigation is a single horizontal text bar at the top with the wordmark left-aligned, nav items in a center-left cluster, and a login button right-aligned. No sticky behavior, no sidebar, no mega-menu — the header is a thin, quiet text row.

## Similar Brands

- **Nike Run Club** — Same full-bleed athlete photography flanking a centered conversion surface, and the same minimal text-only header navigation
- **Garmin Connect** — Same utilitarian data-tool aesthetic with a single brand color, warm neutrals, and flat surfaces with no shadows
- **AllTrails** — Same outdoor-adventure brand language: white canvas, warm off-white footer, edge-to-edge landscape photography, and a single accent color
- **Wahoo SYSTM** — Same fitness-platform restraint: monochrome UI with one vivid accent (orange for Strava, red-orange for Wahoo), custom humanist sans, and 4px button radii
- **WHOOP** — Same athlete-logbook visual register: stark black text on white, warm footer band, minimal chrome, and photography doing the emotional heavy lifting
