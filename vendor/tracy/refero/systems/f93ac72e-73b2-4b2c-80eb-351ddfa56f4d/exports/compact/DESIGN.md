# Playful — Style Reference
> sunlit paper notebook with a hot-pink highlighter. A friendly, editorial product surface printed on warm cream stock, where one vivid magenta accent punctuates an otherwise monochrome warm-gray world.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Playful reads like a warm, hand-crafted workshop printed on cream paper. The entire surface sits on a sandy oat canvas (#f6f2ee) rather than clinical white, giving every screen a paper-like, approachable warmth. A single hot-pink (#ff2e95) does all the chromatic work — CTAs, links, logo mark — against a near-black ink (#111/#000), so screens stay visually quiet until a moment of action is needed. The display type is unapologetically heavy and italic at 70–79px, leaning into editorial poster energy rather than SaaS neutrality. Components are large and soft: 44px cards on pill-shaped buttons, deep diffused shadows, generous breathing room. The overall rhythm is one bold typographic statement per section, surrounded by quiet warm whitespace.

## Colors

| Name | Value | Role |
|------|-------|------|
| Hot Magenta | `#ff2e95` | Primary CTA fill, logo mark, link color, accent strokes — the only chromatic voice in the system, used sparingly to signal action |
| Ink Black | `#000000` | Primary heading text, button text, heavy borders, navigation bar background |
| Oat Canvas | `#f6f2ee` | Page background, large surface fills — the warm cream that replaces cold white throughout |
| Soft Ink | `#111111` | Body text and headings on light surfaces, card surface background for dark elements |
| Slate | `#0f172a` | Secondary text, subtle body copy — a cool near-black used for non-headline text |
| Charcoal | `#414040` | Neutral form states, badge text, and quiet UI feedback where color should stay understated. Do not promote it to the primary CTA color |
| Stone | `#848383` | Icon strokes, muted helper text, subtle UI dividers |
| Paper White | `#ffffff` | Card surfaces, elevated panels, contrast surface against oat canvas |
| Warm Mist | `#e8e5e0` | Hairline borders, dividers, subtle container outlines — warm-toned to match canvas |
| Sand | `#e2dcd6` | Secondary borders, decorative outlines on warm surfaces |
| Driftwood | `#c3c1bf` | Card shadow base tone, muted surface fills |
| Midnight | `#202126` | Deep heading text variant, near-black with subtle cool cast for high-weight headlines |

## Typography

### Inter — Primary typeface for everything. Display headlines use 700/900 italic at 70–79px for editorial poster energy; subheads at 26–30px 600/700; body 16–18px 400; captions 14px 500. The heavy italic display is the signature — most product sites default to upright, Playful leans into the slope for personality.
- **Substitute:** DM Sans, Manrope
- **Weights:** 400, 500, 600, 700, 900
- **Sizes:** 14px, 16px, 18px, 26px, 30px, 70px, 79px
- **Line height:** 1.15 (display), 1.20 (headings), 1.33–1.40 (subheads), 1.50–1.70 (body)
- **Letter spacing:** -0.002em across all sizes (barely perceptible tightening)
- **OpenType features:** `"ss01" on, "cv11" on`

### Arial — System fallback used in some button and input contexts. Inter should be preferred; Arial only appears as a degradation layer.
- **Substitute:** Inter
- **Weights:** 400, 600, 700
- **Sizes:** 13px, 15px, 16px, 20px
- **Line height:** 1.20–1.40
- **Letter spacing:** normal

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.4 | -0.026px |
| body | — | — | 16px | 1.5 | -0.032px |
| body-lg | — | — | 18px | 1.5 | -0.036px |
| subheading | — | — | 26px | 1.23 | -0.052px |
| heading-sm | — | — | 30px | 1.2 | -0.06px |
| display | — | — | 79px | 1 | -0.158px |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 113px
- **Card padding:** 24px
- **Element gap:** 10-16px

### Border Radius

- **tags:** 999px
- **cards:** 44px
- **images:** 16px
- **inputs:** 99px
- **buttons:** 99px (pill)

## Components

### Pill CTA Button (Primary)
**Role:** Filled action button for the single most important action on a screen

Hot Magenta (#ff2e95) fill, white text, Inter 600 at 16px, 99px border-radius, 14px 24px padding. Heavy and confident — the only chromatic element competing with the display type.

### Email Input Field
**Role:** Capture user email for waitlist signup

Oat Canvas (#f6f2ee) fill, 1px Charcoal (#414040) border, 99px border-radius, white card container wraps input + button as a unified pill. Placeholder Inter 400 16px in muted gray. Paired visually with the Pill CTA to form a single inline composite.

### Editorial Display Headline
**Role:** Hero section statement

Inter 700 or 900 italic, 70–79px, line-height 1.00, letter-spacing -0.002em, color Ink Black (#000) or Soft Ink (#111). Set in one or two lines, centered. This is the signature element — heavy italic at scale creates a poster-like moment rather than a SaaS tagline.

### App Tile Card
**Role:** Showcase mini-app examples in a row

44px border-radius, Paper White (#ffffff) surface, deep diffused shadow (0 32px 80px rgba(0,0,0,0.22)). Contains a full-bleed illustration or icon. Sized roughly 140–180px square, displayed in a slightly tilted overlapping row to suggest a hand of cards.

### FAQ Accordion Card
**Role:** Expandable question/answer in the FAQ section

Paper White (#ffffff) surface, 44px border-radius, warm border or none, soft shadow stack (0 32px 80px / 0 2px 8px rgba(0,0,0,0.22/0.08)). Question text Inter 600 italic 16–18px, chevron icon in Stone (#848383). Stacked vertically with 12–16px gap between cards.

### Category Navigation Bar
**Role:** Horizontal category scroller (Birthdays, Creativity, etc.)

Ink Black (#000) background, white text Inter 500 14–16px, horizontal scroll, items separated by 24–32px spacing. No visible border or background change on the bar itself — it reads as a dark band cutting across the page.

### Logo Wordmark
**Role:** Brand identity in header and footer

Hot Magenta (#ff2e95) stylized 'playful' wordmark in Inter 700 italic, paired with a small geometric icon (rounded square mark). Functions as both brand and link, so the magenta is doing double duty as identity and navigation.

### App Icon
**Role:** Brand mark in footer / final CTA section

Rounded square (16–20px radius) dark container with Hot Magenta (#ff2e95) pictogram inside. Appears as a standalone mark above the final headline, echoing the logo's icon component.

### Gradient Highlight Section
**Role:** Mid-page atmospheric band

Large soft radial or linear gradient from Hot Magenta (#ff2e95) through lavender-pink to Oat Canvas (#f6f2ee). No defined edges — bleeds into surrounding sections. Hosts a single italic headline at 30px with mixed weight ('Describe it. It's yours in minutes.').

### Hero Subtext
**Role:** Supporting paragraph beneath the display headline

Inter 400 16–18px, Slate (#0f172a), centered, max-width ~560px. Quiet by design — lets the headline own the visual weight.

### Two-Column FAQ Section Layout
**Role:** Question list arrangement

Left column: small 'Got questions?' label in Inter 500 + bold heading 'Things people want to know'. Right column: stacked FAQ accordion cards. 1200px max-width container, 64–80px section gap above and below.

## Do's and Don'ts

### Do
- Use Hot Magenta (#ff2e95) only for the primary CTA, the logo, and link accents — never as a large surface fill, icon background, or decorative wash longer than a section
- Set display headlines in Inter 700/900 italic at 70–79px, line-height 1.00, letter-spacing -0.002em — the italic at scale is the brand's typographic signature
- Build cards and tiles with 44px border-radius and the dual-layer shadow stack (0 32px 80px rgba(0,0,0,0.22) + 0 2px 8px rgba(0,0,0,0.08))
- Use Oat Canvas (#f6f2ee) as the base page background — do not switch to pure white for full-page surfaces
- Pair every email input with the Pill CTA inside a single white pill container (99px radius) to read as one composite unit
- Center hero compositions — headline, subtext, and CTA stack vertically with generous 113px section gaps between major bands
- Keep icons stroke-based in Stone (#848383) at 1.5–2px weight, never filled with color

### Don't
- Do not use upright (non-italic) weight 700+ for display headlines — the italic slope is what makes Playful feel editorial rather than corporate
- Do not introduce additional accent colors — blue, green, orange, purple are all out of system; Hot Magenta is the only chromatic voice
- Do not use pure black (#000000) on pure white (#ffffff) for body text without checking — use #111 or #0f172a for less harshness on the warm canvas
- Do not apply sharp 0–4px radii to cards or buttons — the 16/44/99px scale is part of the friendly softness
- Do not stack more than two type weights on a single screen — typically 400 body + 700/900 italic display, with 500/600 for subheads
- Do not place white cards directly on white — always sit Paper White on Oat Canvas so cards read as elevated
- Do not use drop shadows on text, buttons, or icons — shadows are reserved for card-level elevation only

## Elevation

- **FAQ card / app tile:** `rgba(0, 0, 0, 0.22) 0px 32px 80px 0px, rgba(0, 0, 0, 0.08) 0px 2px 8px 0px`

## Surfaces

- **Oat Canvas** (`#f6f2ee`) — Base page background — the warm cream that sets the entire system apart from cold-white SaaS
- **Paper White** (`#ffffff`) — Card and elevated panel surface sitting on the oat canvas
- **Soft Ink** (`#111111`) — Dark card variant and navigation bar background
- **Hot Magenta** (`#ff2e95`) — Accent surface — CTA fills, highlight wash zones

## Imagery

Visual language is illustration-led, not photographic. The site shows stylized 3D app icons and playful character mascots (broccoli with face, pink blob, blue ghost, white creature) rendered in soft 3D with rounded, candy-like surfaces and saturated color. Illustrations sit inside rounded square app tiles (44px radius) that are slightly tilted and overlapping in a fan arrangement, evoking a hand of cards rather than a rigid grid. No photography appears anywhere — the warmth comes from the cream canvas and the 3D illustration style, not from lifestyle imagery. Icons in the UI itself are minimal line icons in muted gray, not colorful.

## Layout

Centered, max-width 1200px container with generous 113px section gaps between major vertical bands. The page rhythm alternates between quiet warm-cream sections (hero, FAQ) and a single vivid pink gradient wash section in the middle. Hero is a centered stack: display headline → subtext → email+CTA pill composite → tilted row of app tiles. Below the gradient band, the FAQ section uses a two-column layout (label left, accordion stack right) before returning to a centered final CTA. A full-width black category navigation bar cuts across the page at the transition between hero and gradient sections, providing the only dark band. The overall density is spacious — single elements breathe rather than packing into grids.

## Similar Brands

- **Linear** — Same editorial confidence in display typography (large heavy weight, tight letter-spacing) and a single vivid accent against a monochrome system — though Linear's palette is dark, Playful's italic display shares the same poster-like typographic attitude
- **Notion** — Warm off-white canvas (#f6f2ee echoes Notion's slight cream tint) with generous spacing and a minimalist component vocabulary — the friendliness of the surface treatment is the shared trait
- **Pitch** — Same large italic display headlines, cream/warm canvas, and pill-shaped primary CTA, with a single chromatic accent for action — Pitch's editorial product design language is the closest aesthetic cousin
- **Framer** — Bold typographic statements over warm neutral surfaces, with one bold accent color (Framer's blue, Playful's magenta) — both treat the hero as an editorial moment rather than a feature checklist
- **Vercel** — Generous whitespace, soft elevated cards, and the discipline of one accent color doing all chromatic work — though Vercel is dark-mode, the spatial generosity and single-accent philosophy is structurally similar
