# Zapier — Style Reference
> sunlit maker's notebook. A warm cream canvas with paper-thin surfaces, a single vivid orange that powers every connection, and editorial typography that reads like a design magazine rather than enterprise software.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Zapier reads like a sunlit maker's notebook rather than enterprise software: a warm cream canvas (#fffefb, #f8f4f0) replaces the usual stark white, and text sits in warm near-blacks (#201515, #36342e) rather than cool blue-grays. Typography pairs Inter for UI with Degular Display, a custom face that runs positive letter-spacing counter to most display type's tightening instinct, and GT Alpina — a weight-250 serif that lifts select headings into editorial territory. One vivid orange (#ff4f00) punctuates brand marks and filled button surfaces; a deep violet (#2b2358) appears only inside illustrations. Surfaces are paper-thin — hairline borders, almost no elevation, pill-shaped controls at 20px radii — and spacing follows a 4px rhythm with generous breathing room between sections. The overall mood is approachable, editorial, and human: automation framed as craft, not as cold infrastructure.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ember Orange | `#ff4f00` | Brand mark, filled button surfaces, key highlights, illustration accents — the singular chromatic accent across the entire system, used as punctuation rather than wash |
| Iris Ink | `#2b2358` | Illustration-only accent (buildings, shadows in hero artwork) — never use in UI chrome, buttons, or text |
| Cream Paper | `#fffefb` | Primary canvas, card surfaces, input backgrounds — the signature warm white that replaces stark #ffffff |
| Parchment | `#f8f4f0` | Secondary surface, alternating section bands, soft elevated cards — one step warmer than the canvas |
| Stone Linen | `#eceae3` | Hairline borders, dividers, muted surface tints — the structural separator color |
| Driftwood | `#c5c0b1` | Muted borders, disabled-state backgrounds, low-contrast dividers |
| Ash Mist | `#b7b6b3` | Disabled text, placeholder text, very subtle borders |
| Ink Brown | `#201515` | Primary text, dark UI elements, logo wordmark — warm near-black, not #000000 |
| Bark | `#36342e` | Secondary headings, nav text, medium-emphasis body copy |
| Coffee Stone | `#413735` | Tertiary text, link text in resting state, breadcrumb text |
| Stone Gray | `#939084` | Muted helper text, captions, metadata, small-print compliance lines |
| Obsidian | `#000000` | Icons at maximum contrast, footer text on light surfaces, logo mark detail |

## Typography

### Inter — Primary UI and body typeface. Inter carries all functional text — nav items, buttons, form fields, card body, captions. Weight 500 for button labels and nav, 400 for body, 600 for emphasis. Negative tracking tightens as size grows.
- **Substitute:** Inter (freely available)
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 48px
- **Line height:** 1.20–1.72
- **Letter spacing:** -0.10px at 12px, -0.16px at 16px, -0.43px at 24px, -0.58px at 32px, -0.72px at 36px, -1.34px at 48px

### Degular Display — Display face for hero headlines, section headings, and uppercase eyebrow labels. Runs POSITIVE letter-spacing (0.020–0.071em) — counter-intuitive for display type, which gives headings an open, almost editorial-poster feel. The custom face is the primary brand-typography signal; do not substitute it with a tightened grotesque.
- **Substitute:** Bricolage Grotesque or Space Grotesk
- **Weights:** 500, 600
- **Sizes:** 14, 24, 30, 40, 56, 80px
- **Line height:** 0.90, 1.00, 1.10
- **Letter spacing:** 0.020em at 14px, 0.033em at 30px, 0.042em at 40px, 0.071em at 80px
- **OpenType features:** `"ss01" on`

### GT Alpina — Editorial accent serif for select headings that need a magazine-like lift — used sparingly, never for body or UI. Weight 250 (ultra-light) is the signature: a whisper-weight serif that contrasts the geometric Degular Display and adds human warmth to the system.
- **Substitute:** Newsreader or Source Serif 4 at weight 200
- **Weights:** 250, 300
- **Sizes:** 40, 48px
- **Line height:** 1.08, 1.20
- **Letter spacing:** -0.040em

### Arial — System fallback only — appears in third-party embed contexts, not a design choice
- **Substitute:** Arial
- **Weights:** 400
- **Sizes:** 13, 24px
- **Line height:** 1.20
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.1px |
| body-lg | — | — | 16px | 1.5 | -0.16px |
| subheading | — | — | 18px | 1.43 | -0.18px |
| heading-sm | — | — | 24px | 1.33 | -0.43px |
| heading | — | — | 32px | 1.25 | -0.58px |
| heading-lg | — | — | 36px | 1.2 | -0.72px |
| display | — | — | 48px | 1.14 | -1.34px |
| display-lg | — | — | 56px | 1.1 | -1.57px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-96px
- **Card padding:** 24-32px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 4px
- **cards:** 8px
- **large:** 32px
- **pills:** 9999px
- **inputs:** 4px
- **buttons:** 20px

## Components

### Brand-Orange Filled Button
**Role:** Primary interactive surface for sign-up and key conversions

Background: #ff4f00. Text: #fffefb. Border: none. Radius: 20px (pill). Padding: 12px 20px. Font: Inter weight 500, 15px, letter-spacing -0.15px. No drop shadow. Hover darkens background slightly. This is the only button that carries chromatic color in the system.

### Outlined Button
**Role:** Secondary action beside the brand-orange button (e.g., social sign-in)

Background: #fffefb. Border: 1px solid #201515. Text: #201515. Radius: 20px. Padding: 12px 20px. Font: Inter weight 500, 15px. Lead icon (e.g., Google G) in natural color at 18px, 12px gap to label.

### Ghost Text Link
**Role:** Inline links, nav items in resting state, footer links

No background, no border. Text: #413735 at 15px Inter weight 500. Underline on hover only. Letter-spacing -0.15px. No pill shape.

### Navigation Bar
**Role:** Top-level site navigation

Background: #fffefb. Height: 64px. Logo on left (Zapier wordmark in #201515 + orange z glyph). Nav items in Inter weight 500, 15px, #201515, 24px gap. Right cluster: text links + pill-shaped 'Sign up' button in #ff4f00. Sticky on scroll with hairline #eceae3 bottom border.

### Announcement Bar
**Role:** Top-of-page promotional or compliance banner

Background: dark warm (#201515 or near-black). Text: #fffefb at 13px Inter weight 500. Centered, single line. Close (×) icon at right. Padding: 8px 16px.

### Template Card
**Role:** Pre-built workflow template entry in carousel/grid

Background: #fffefb. Border: 1px solid #eceae3. Radius: 8px. Padding: 24px. Top row: 2-3 small app icons (24px squares) with 8px gap. Heading: Inter weight 600, 16px, #201515, 2-line max. No shadow. On hover: border darkens to #c5c0b1.

### Feature Section Card
**Role:** Larger content card for product capability explanations

Background: #f8f4f0. Border: none. Radius: 8px. Padding: 32px. Headline: Inter weight 600, 24px, #201515. Body: Inter weight 400, 15px, #36342e. Optional inline icon accent in #ff4f00 at top.

### Security/Trust Badge
**Role:** Compliance and security indicators (SOC 2, GDPR, etc.)

Background: #fffefb. Border: 1px solid #eceae3. Radius: 4px. Padding: 6px 12px. Text: Inter weight 500, 13px, #36342e. Often paired with a small shield/checkmark icon in #ff4f00 or #413735.

### Eyebrow Label
**Role:** Small uppercase tag above section headings (e.g., 'TEMPLATES')

Text only, no background. Inter weight 600, 12px, #ff4f00. Letter-spacing 0.042em (uppercase tracking). Often preceded by a small horizontal orange rule or a glowing dot indicator.

### Text Input
**Role:** Natural-language workflow description field

Background: #fffefb. Border: 1px solid #c5c0b1. Radius: 4px. Padding: 16px. Placeholder: Inter weight 400, 16px, #b7b6b3. Focus: border becomes #201515, no glow ring. Min-height 56px for generous input.

### Partner Logo Strip
**Role:** Trust-signal row of grayscale customer logos

Logos rendered in #413735 or #939084 on #fffefb background. No badges, no captions. 6 logos per row, 80-120px width each, 64px gap. No hover effects.

### Product Showcase Panel
**Role:** Full-bleed section featuring a product screenshot over a photographic background

Outer background: photographic blur (warm greenish/golden tones). Inner product UI frame: #fffefb with 1px #eceae3 border, 8px radius, 20px padding, subtle shadow (0 4px 24px rgba(32,21,21,0.08)). Width: ~960px centered. Play-button overlay at bottom-right in white circle.

### Footer Link Group
**Role:** Column of footer navigation links

No background. Group title: Inter weight 600, 13px, #201515, 0.042em letter-spacing. Links: Inter weight 400, 15px, #413735, 12px row gap. No underlines.

## Do's and Don'ts

### Do
- Use Cream Paper (#fffefb) or Parchment (#f8f4f0) for all page and card backgrounds — never #ffffff
- Apply Ember Orange (#ff4f00) only to filled button surfaces, the logo glyph, and small icon accents — keep it under 5% of any layout
- Use Degular Display for hero headlines and section headings with its native positive letter-spacing (0.033–0.071em) — do not tighten it
- Reach for GT Alpina weight 250 on one editorial heading per page to add magazine-like lift — never use it for body or UI
- Set button radius to 20px for all interactive controls to create the signature pill shape
- Layer warm neutrals for text hierarchy: #201515 → #36342 → #413735 → #939084 — never introduce cool blue-grays
- Follow the 4px spacing rhythm: prefer 8, 12, 16, 24, 32, 64px for gaps, padding, and section breaks

### Don't
- Never use stark #ffffff or #000000 as primary surfaces — the warm cream and warm near-black are signature
- Never apply negative letter-spacing to Degular Display headings — the open tracking is the point
- Never use Iris Ink (#2b2358) in UI chrome, buttons, or text — it is reserved for illustrations
- Never add heavy drop shadows; use hairline #eceae3 or #c5c0b1 borders for surface separation
- Never let Ember Orange fill large background areas — it must remain punctuation, not wash
- Never use a cool-toned gray (e.g., #64748b, #94a3b8) — all neutrals in this system carry a warm brown undertone
- Never exceed 56px for body headings or 160px for hero display without checking the type scale tokens first

## Surfaces

- **Canvas** (`#fffefb`) — Primary page background — warm cream replaces stark white
- **Card** (`#f8f4f0`) — Card and panel surfaces, alternating section bands
- **Inset** (`#eceae3`) — Inset wells, muted zones, input resting backgrounds
- **Border** (`#c5c0b1`) — Hairline structural dividers, card outlines

## Imagery

Editorial illustration built from a restricted three-color palette (Ember Orange, Iris Ink, Cream Paper) — geometric buildings and abstract shapes rather than figurative scenes. Product screenshots are the dominant visual: the workflow builder UI shown in a contained card floating over a warm photographic blur (golden-hour tones). Partner logos rendered as flat grayscale on cream — no color, no badges. No lifestyle photography, no stock imagery. Iconography is a mix of a custom monoline mark (the orange z) and small filled glyphs at 16–20px, drawn at medium weight with 1.5–2px stroke equivalent. Imagery density is moderate: one large illustration or product screenshot per section, surrounded by generous cream space.

## Layout

Max-width 1200px centered container with a full-bleed top announcement bar. Sticky navigation at 64px height with logo-left and action-right cluster. Hero uses a 2-column split: headline + CTA stack on the left (~55%), editorial illustration on the right (~45%), vertically centered. Trust logo strip is a centered single row of 6 grayscale logos. Product showcase sections break out to full-bleed width with a photographic background and a centered ~960px product UI card. Template sections use a 3-column card grid on warm cream. Section rhythm is generous: 80–120px vertical gaps between major bands, with no visible dividers between sections — flow is seamless. Content alternates between left-aligned editorial stacks and centered compositions, but never strictly mirrored. Navigation is a single horizontal bar — no sidebar, no mega-menu visible on primary pages.
