# Pitch — Style Reference
> violet stage spotlight on white. A deep purple gradient floods the hero like theater lighting, then the page steps down into a clean, flat slate workspace where one bright violet does all the work.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Pitch is a stage-lit productivity platform: the hero floods with a vivid violet gradient like theatrical lighting, then the rest of the page settles into a clean slate-and-white workspace where color is rationed to functional punctuation. Typography pairs a wide-tracked geometric sans (Eina01) for UI with a heavy, tightly-tracked display sans (Mark Pro) for headlines — the two voices create a clear hierarchy between product surface and marketing voice. Surfaces are flat white with soft, low-opacity shadows; the violet (#6b53ff) carries every action and brand mark, a single warm yellow (#ffd02c) injects energy accents, and a near-black charcoal (#2b2a35) does the heavy lifting for text. Components are compact and confident — pill buttons, small radii (6–20px), tight 20px padding, and a deliberate absence of decoration. The page rhythm alternates between immersive dark-violet full-bleed bands and bright content sections, producing a theatrical pacing from spectacle to substance.

## Colors

| Name | Value | Role |
|------|-------|------|
| Signal Violet | `#6b53ff` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Lighter Violet | `#8d49f7` | Secondary brand accent, gradient highlight stops, icon fills, decorative violet washes — a brighter cousin used when Signal Violet would feel too heavy |
| Deep Indigo | `#371789` | Dark brand text, deep gradient end-stops, footer/marketing accent on white sections — the shadow side of the violet family |
| Solar Yellow | `linear-gradient(90deg, #ffd02c, #ff9e2c)` | Energy accent — slide preview highlights, decorative bursts, gradient start, illustration fills. Used sparingly as visual punctuation, never as a functional color; Warm accent gradient — linear-gradient(90deg, #ffd02c, #ff9e2c) for decorative bursts and illustration gradients |
| Ember Orange | `#ffa000` | Orange supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Slate Ink | `#2b2a35` | Primary text, heading text, icon strokes, dark surface fill — the dominant achromatic doing all reading work (1,700+ occurrences) |
| Carbon | `#1e1d28` | Secondary dark text, card text on light surfaces — a step lighter than Slate Ink for subordinate copy |
| Steel | `#3f4250` | Muted body text, secondary headings, dark-mode support text |
| Fog | `#6f7387` | Supporting neutral for secondary UI, dividers, and muted labels. |
| Ash | `#95959a` | Tertiary borders, subtle dividers, light-mode shadow tint at low opacity |
| Mist | `#dddfe5` | Hairline borders, card outlines, button shadows — the lightest visible structural line |
| Marble | `#f0eff4` | Page canvas background — slightly cooler than pure white, sets product sections apart from card surfaces |
| Paper | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Shadow Violet | `#0a0359` | Deep shadow color tinted violet (rgba 0.3) — appears only in the hero card's large ambient shadow, giving elevation an on-brand cool cast |
| Hero Stage | `linear-gradient(90deg, rgb(83, 24, 235), rgb(171, 110, 249))` | Primary hero gradient end-stop — linear gradient(90deg, #5718eb, #ab6ef9) fills the entire first screen behind the headline |

## Typography

### Eina01 — Primary UI and body font. Used for navigation, buttons, body copy, list items, badges, and subheadings up to 28px. Its signature is a wide +0.1em letter-spacing applied consistently — this airiness gives the UI a measured, deliberate pace rather than dense SaaS compression. Substitute: Inter or Manrope (both geometric sans with similar x-height).
- **Substitute:** Inter
- **Weights:** 400, 600, 700, 800
- **Sizes:** 13, 14, 15, 16, 18, 22, 24, 28
- **Line height:** 1.2–1.6
- **Letter spacing:** 0.1em

### Mark Pro — Display and headline font only. Used for hero headlines (60–80px), section headings (42px), and small uppercase labels (13px). The display sizes carry tight negative tracking (-0.02em at 60–80px, -0.01em at 27–28px) that contrasts with Eina01's openness — the two fonts create a deliberate tight/wide duality. Substitute: Söhne (closest match) or Inter at heavy weight.
- **Substitute:** Söhne
- **Weights:** 700, 800
- **Sizes:** 13, 27, 28, 42, 60, 80
- **Line height:** 1.0–1.4
- **Letter spacing:** -0.02em at 60–80px, -0.01em at 27–28px, 0.1em at 13px (uppercase labels)

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.6 | 1.3px |
| body | — | — | 16px | 1.6 | 1.6px |
| body-lg | — | — | 18px | 1.6 | 1.8px |
| subheading | — | — | 22px | 1.4 | 2.2px |
| heading-sm | — | — | 24px | 1.3 | 2.4px |
| heading | — | — | 28px | 1.2 | 2.8px |
| heading-lg | — | — | 42px | 1.1 | -0.42px |
| display | — | — | 72px | 1 | -1.44px |

## Spacing & Layout

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 20px
- **Element gap:** 20px

### Border Radius

- **cards:** 26px
- **small:** 3px
- **badges:** 20px
- **inputs:** 6px
- **buttons:** 20px

## Components

### Filled Primary Button
**Role:** Primary action — the main CTA on a page or section.

Background #6b53ff, white text, 20px border-radius (pill), 12px vertical × 20px horizontal padding, Eina01 weight 600 at 14–15px with 0.1em tracking. Optional right arrow icon in white. The high radius is signature — these buttons read as soft pills, not rectangles.

### Inverted/White Filled Button
**Role:** Secondary action on light backgrounds, primary on dark sections.

Background #ffffff, text #2b2a35, 20px radius, 12px × 20px padding, Eina01 weight 600. Used for 'Sign up' in the dark navigation and for 'Sign up for free' on the hero gradient — the white pill is the counterweight to the violet pill.

### Ghost/Outlined Button
**Role:** Low-emphasis action, used over colored or image backgrounds.

Transparent background, 1.5px white border, white text, 20px radius, 12px × 20px padding. 'Log in' in the header uses this treatment — it sits in the dark navigation without competing with the white 'Sign up' pill.

### Pill Badge/Tag
**Role:** Category tags, feature labels, inline metadata.

20px border-radius, 4px vertical × 12px horizontal padding, Eina01 weight 600 at 13px with 0.1em tracking and uppercase. Violet fill with white text for active tags, neutral fill for passive ones. Compact and self-contained.

### Feature Card
**Role:** Marketing feature blocks with image, title, and description.

White (#ffffff) surface, 26px border-radius, 20px padding, soft shadow rgba(0,0,0,0.15) 0px 3px 10px. Optionally escalates to the deep violet ambient shadow rgba(10,3,89,0.3) 0px 20px 90px for hero feature cards. Generous internal whitespace with image-top, text-below composition.

### Testimonial Card
**Role:** Social proof blocks with avatar, quote, and attribution.

Violet (#6b53ff) background, 26px radius, white text, circular avatar photo (60–80px diameter) with a yellow ring border (#ffd02c). The violet fill makes testimonials visually loud — they're meant to be the emotional peak of a section.

### Hero Section
**Role:** First-screen brand impression.

Full-bleed background with linear-gradient(90deg, #5718eb, #ab6ef9). Centered white headline (Mark Pro weight 700–800 at 60–80px, -0.02em tracking, line-height 1.0), white subtext (Eina01 weight 400 at 18px), and two-button row (white pill + violet pill). Optional 3D illustrative elements float in the corners with soft violet glow.

### Navigation Bar
**Role:** Top-level site navigation.

Transparent background sitting directly on the hero gradient. White text (Eina01 weight 600 at 15px, 0.1em tracking). Logo mark on the left (violet 'P' glyph on a white rounded square). Right-aligned: ghost 'Log in' + white-filled 'Sign up'. No background fill until scroll.

### Announcement Banner
**Role:** Top-of-page news/feature announcement.

White background, centered single-line text in Eina01 weight 400 at 13–14px. Dark text body with a violet 'See what's new →' link in weight 600. Hairline bottom border in #dddfe5. 2px vertical padding — minimal height to stay non-intrusive.

### Tab/Segment Control
**Role:** Switching between audience-specific feature views.

Horizontal row of uppercase Eina01 labels (weight 600, 13px, 0.1em tracking) in #6f7387. Active tab is #6b53ff with a 2px violet underline bar. No background fill on the row itself — the underline alone carries the active state.

### Checklist Item
**Role:** Feature list with checkmark icons.

Violet checkmark icon (#6b53ff, ~20px) left-aligned, dark text label in Eina01 weight 400 at 16–18px to its right. 15px vertical gap between items. The violet check is the only color — everything else is monochrome charcoal.

### Cookie Consent Card
**Role:** GDPR/privacy notification overlay.

White surface, ~16px radius, soft shadow, fixed-position bottom-left. Body text in Eina01 at 13px, 'Agree' button in violet #6b53ff, 'More options' as a text link. Compact — must not dominate the viewport.

### Client Logo Strip
**Role:** Social proof — brands using the product.

Horizontal row of grayscale client logos (#2b2a35 or near-black) at uniform height (~24–32px), evenly spaced with generous gaps. Logos desaturate to gray to avoid competing with the violet brand. Sits centered on a white or #f0eff4 band.

### Slide Preview/Product Card
**Role:** Inline product mockup showing the editor or a finished deck.

White surface, 6px–16px radius, 20px padding, contained within a larger card. Shows actual product UI (toolbar, canvas, slide thumbnails). Sits on a light gray (#f0eff4) background to separate the product from the marketing page.

## Do's and Don'ts

### Do
- Use Signal Violet (#6b53ff) as the exclusive fill for primary action buttons and brand marks — never substitute with another color
- Apply 20px border-radius to all buttons, badges, and pill-shaped elements; 26px for larger cards; 6px for inputs and small tags
- Use Eina01 at 0.1em letter-spacing for all UI text — this wide tracking is the system's signature rhythm
- Reserve Mark Pro (weight 700–800) for display headlines at 42px and above with tight -0.02em tracking
- Use the hero gradient linear-gradient(90deg, #5718eb, #ab6ef9) as a full-bleed section background for maximum-emphasis content blocks
- Keep card padding at 20px and element gaps at 20px for the standard product surface rhythm
- Use soft shadows only — rgba(0,0,0,0.15) 0px 3px 10px is the default; escalate to the violet-tinted deep shadow only for hero feature cards

### Don't
- Don't introduce new accent colors — Solar Yellow (#ffd02c) and Ember Orange (#ffa000) are decorative-only, never use for buttons or status
- Don't use Eina01 at display sizes above 28px — switch to Mark Pro for anything larger to maintain the tight/wide duality
- Don't apply tight negative tracking to Eina01 — its 0.1em positive spacing is non-negotiable for the UI voice
- Don't use heavy borders or hard outlines on cards — the system signals elevation through soft shadows and background contrast, not strokes
- Don't place body text directly on the violet hero gradient at small sizes — minimum 16px white text, or move text to a white card surface
- Don't use Deep Indigo (#371789) as a button fill — it's a text and gradient color, not an interactive surface
- Don't mix purple and yellow on the same component — they serve different functions (violet = action, yellow = energy) and combining them muddles the hierarchy

## Elevation

- **Standard card / image container:** `0px 3px 10px rgba(0, 0, 0, 0.15)`
- **Elevated feature card:** `0px 8px 26px rgba(103, 110, 144, 0.2)`
- **Hero feature card (ambient lift):** `0px 20px 90px rgba(10, 3, 89, 0.3), 0px 0px 0px 1px rgba(0, 0, 0, 0.02)`
- **Primary button (active/pressed state):** `0px 6px 27px rgba(43, 42, 53, 0.5)`

## Surfaces

- **Marble** (`#f0eff4`) — Page canvas — the default background for content sections below the hero
- **Paper** (`#ffffff`) — Card and panel surfaces — sits one step above Marble, the primary product surface
- **Elevated Paper** (`#ffffff`) — Modals, popovers, floating toolbars — same white but distinguished by stronger shadow and/or border
- **Hero Stage** (`#5718eb`) — Full-bleed brand sections — the violet gradient, reserved for hero and major emotional peaks

## Imagery

Visuals are a mix of product screenshots (the editor UI, slide thumbnails) and 3D-rendered decorative objects — a compass, a gear, a clock — that float with soft violet glows in the corners of content sections. Product screenshots are always contained within rounded white cards (16–26px radius) with soft shadows, never full-bleed. The 3D objects are stylized, slightly glossy, and tinted with brand violet and warm yellow to feel cohesive with the hero. Photography is absent — no lifestyle shots, no human photography in marketing (human presence is limited to circular avatar crops in testimonial cards). The overall visual density is moderate: text-dominant with product visuals as supporting evidence rather than spectacle.

## Layout

The page is a vertical scroll of alternating full-width bands: a violet gradient hero (centered headline, two-button row, decorative 3D objects in corners) → product preview band (centered slide editor card on white) → client logo strip (centered, generous spacing) → 'for the whole team' section (centered text + tabbed feature blocks) → testimonial band (violet card with circular avatar) → checklist section (two-column: image left, checkmark list right). Max content width is ~1200px centered. Navigation is a transparent top bar that overlays the hero and likely solidifies on scroll. Section gaps are 80px — generous enough for theatrical pacing, tight enough to maintain momentum. The rhythm is: dark violet hero → white product band → gray social proof → white feature section → violet testimonial → white checklist. This alternating dark/light cadence creates visual punctuation without needing dividers.

## Similar Brands

- **Notion** — Same minimal-light canvas approach with a single brand color (Notion's black) rationed across actions, and similarly soft shadows on white cards with 16–20px radii
- **Linear** — Same tight typographic discipline with a single chromatic accent (Linear's purple) and generous use of grayscale for structure — though Pitch leans more expressive with the violet hero gradient
- **Figma** — Shares the 3D-illustrated product marketing language (floating geometric objects, product UI screenshots in contained white cards) and a similar punchy single-accent palette
- **Framer** — Same dark-gradient hero → white content section rhythm, with the brand color flooding the first screen and then retreating to a clean workspace below
- **Webflow** — Both use a vivid single-hue brand color (Webflow's blue, Pitch's violet) as the sole interactive accent against a near-white workspace with soft elevation
