# Canva — Style Reference
> playful artist's studio bathed in violet dawn — a clean white workspace where every accent, icon, and gradient wash arrives pre-tuned for creative work.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Canva speaks in a friendly, creative-atelier language: a near-white canvas where every surface is generous and every accent is vivid. The brand color is a saturated violet (#8b3dff) that recurs across navigation, tags, icons, and gradient washes, anchored by a near-black ink (#0f1015) for all primary type. The visual personality is gradient-loving and slightly playful — backgrounds dissolve from teal into violet, from magenta into coral — yet the UI chrome itself stays calm and monochrome so that user-generated creativity doesn't fight the frame. Type is set in the custom Canva Sans with tight tracking and optical alternates (ss02, ss03) for a warm, humanist feel; headlines run large (56–84px) at ultra-tight leading, giving the page a poster-like gravity. Surfaces are soft, 8px corners, with the brand's most distinctive move being a single floating prompt card that dominates the hero — a calm, rounded white panel set against a full-bleed gradient field.

## Colors

| Name | Value | Role |
|------|-------|------|
| Canva Violet | `#8b3dff` | Primary brand color — filled buttons, active navigation, link text, gradient anchors, brand icons, tag fills |
| Deep Violet | `#9729ff` | Secondary violet for decorative elements, secondary icon accents, gradient stop |
| Lavender Mist | `#a370fc` | Tertiary violet tint — outlined/ghost action borders, muted brand accents, image overlays |
| Coral Ember | `#ff6105` | Vivid orange — decorative icon accent, category tag, gradient co-stop alongside violet |
| Magenta Pop | `#ff3d4d` | Vivid red-pink — decorative icon accent, category tag, energetic gradient endpoint |
| Fuchsia Bloom | `#e950f7` | Vivid magenta — decorative icon accent, category tag, playful gradient endpoint |
| Midnight Ink | `#0f1015` | Primary text, heading, navigation, button labels, card surface dark mode accent |
| Pure White | `#ffffff` | Page background, card surface, inverse text on dark/violet fills |
| Slate Gray | `#575a5f` | Secondary text, muted helper copy, nav dividers, disabled chrome |
| Pale Mist | `#d7d9de` | Subtle button shadow tint, very light dividers, off-white surface |
| Ink Black | `#000000` | Pure black for maximum-contrast text, sharp icons, decorative dots |
| Teal Aurora | `linear-gradient(135deg, rgb(0, 196, 204), rgb(125, 42, 232))` | Signature gradient starting point — teal-to-violet hero washes |

## Typography

### Times — Times — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 10px
- **Line height:** 1.2

### Canva Sans — Primary brand typeface. Weight 400 for body and UI labels, 500 for emphasized subheadings and button text, 600 for section headings. Headlines 56–84px use weight 600 with tight tracking for poster-like presence. Font features "ss02" and "ss03" enable brand-specific alternates (likely single-story g/a, geometric g/cuts) that give the type its warm, custom-cut character — never substitute these off in body text.
- **Substitute:** Inter, DM Sans, or General Sans
- **Weights:** 400, 500, 600
- **Sizes:** 14, 16, 18, 21, 24, 28, 32, 36, 56, 64, 84
- **Line height:** 1.06–1.57
- **Letter spacing:** -0.018em at large display sizes, -0.01em at body sizes, 0 at small UI text
- **OpenType features:** `"ss02" on, "ss03" on`

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.2

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| body-sm | — | — | 14px | 1.4 | — |
| body | — | — | 16px | 1.5 | -0.01px |
| subheading | — | — | 18px | 1.4 | — |
| heading-sm | — | — | 24px | 1.33 | — |
| heading | — | — | 36px | 1.25 | -0.018px |
| heading-lg | — | — | 56px | 1.1 | -0.018px |
| display | — | — | 84px | 1.06 | -0.018px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **cards:** 8px
- **pills:** 9999px
- **buttons:** 8px
- **largeButtons:** 16px

## Components

### Hero Headline
**Role:** Primary hero text

Centered Canva Sans weight 600, 56–84px, line-height ~1.06, letter-spacing -0.018em, color #0f1015 on white or #ffffff on gradient. Sits over a teal-to-violet full-bleed gradient with generous vertical padding (80–120px above and below).

### Hero Subtitle
**Role:** Supporting hero copy

Canva Sans weight 400, 18–21px, line-height 1.4, color #0f1015 (or #ffffff on dark gradient), centered, max-width ~640px.

### White Pill CTA
**Role:** Primary action button on gradient hero

White background (#ffffff), #0f1015 text, Canva Sans weight 500, 16px, 16px horizontal / 12px vertical padding, 8px radius, subtle 1px inset shadow rgba(53,65,90,0.2) for definition. Used as the singular hero CTA like 'Start designing'.

### Violet Filled Button
**Role:** Primary action button on light surfaces

#8b3dff background, #ffffff text, Canva Sans weight 500, 16px, 12px 20px padding, 8px radius, no shadow. Used for 'Sign up', submit actions, and prompt-card send buttons.

### Ghost Text Button
**Role:** Secondary action in header

Transparent background, #0f1015 text, Canva Sans weight 500, 16px, used for 'Log in' alongside filled 'Sign up'. No border.

### Top Navigation Bar
**Role:** Site-wide navigation

White background, Canva Sans weight 500 at 16px for nav links in #0f1015. Logo (wordmark) sits left, links centered, actions right. 12px horizontal padding on link items, 4–8px gaps between links.

### Category Pill Tabs
**Role:** Tab/pill filter row

Pill-shaped, 9999px radius, each tab has a distinct vivid background — one violet (#8b3dff), one orange (#ff6105), one red (#ff3d4d), one pink (#e950f7), one purple (#a370fc). White text, 16px Canva Sans weight 500, 12px 16px padding. The selected tab gets a subtle shadow; inactive tabs have no shadow.

### AI Prompt Card
**Role:** Hero feature: prompt input panel

White rounded panel, 8px radius, generous internal padding (24–32px), 1px hairline border, sits over a light gradient. Contains a large input field, a violet circular submit button (48px, #8b3dff fill, white arrow icon), and a row of small action chips below (Design, Image, Doc, Code, Video clip) with 8px radius and 1px border. This card is the visual signature of the page.

### Gradient Feature Card
**Role:** Large feature card in content grid

Rounded card, 8–16px radius, 24px internal padding, filled with a full-bleed gradient (violet-to-coral, teal-to-violet, etc.). White Canva Sans 600 headline (24–28px) and 500 CTA pill on top. Dimensions roughly 2:1 or 3:2 aspect ratio, no shadow — the gradient IS the elevation.

### Category Tag / Action Chip
**Role:** Small interactive label

8px radius, small 1px border or filled with category color, 12px padding, Canva Sans weight 500 at 13–14px. Often carries a tiny icon prefix. Used inside the AI prompt card and elsewhere.

### Section Heading
**Role:** Mid-page section title

Canva Sans weight 600, 36–56px, line-height 1.1, #0f1015, centered above content. Always preceded by generous vertical spacing (80px sectionGap) and followed by a tab row or card grid.

### Card Grid (2-column)
**Role:** Feature content arrangement

Two large cards per row, equal width within a 1200px container, 16–24px gap. Top row uses vivid gradients; bottom row uses a solid color card (green) and a gradient card. Each card contains a headline, a white pill CTA, and a content preview area.

## Do's and Don'ts

### Do
- Set body type in Canva Sans 400, 16px, line-height 1.4–1.5, color #0f1015
- Apply letter-spacing -0.018em to all display text 36px and above; use 0 or -0.01em for body
- Use 8px corner radius for cards and standard buttons, 9999px for pills and category chips
- Default to a white page background and reserve color/gradient for hero bands, feature cards, and decorative tags
- Pair every violet-filled action with white text and no drop shadow — the color does the work
- Activate font features "ss02" and "ss03" globally on Canva Sans to preserve the custom letterforms
- Use 12px element gaps inside cards, 80px between major sections, and a 1200px max content width

### Don't
- Don't substitute Canva Sans with Times, Arial, or any serif — the geometric humanist voice is core to the brand
- Don't apply drop shadows to violet or gradient feature cards — they read as flat color fields by design
- Don't use the accent oranges, pinks, and reds for buttons or interactive CTAs — reserve them for tags, icons, and gradient co-stops
- Don't reduce display headline tracking to normal or positive — the negative letter-spacing is what makes 56–84px type feel poster-like
- Don't add heavy borders or 2px+ strokes to cards; the system relies on the gradient fill plus 8px radius for definition
- Don't use #000000 as the primary text color — #0f1015 is the brand's chosen near-black for a slightly softer read
- Don't mix more than three accent colors in a single section; pick one violet, one warm accent, and let the gradient do the rest

## Elevation

- **Floating Panel (prompt card, modal):** `rgba(64, 79, 109, 0.06) 0px 0px 0px 0.5px, rgba(24, 44, 89, 0.137) 0px 2px 4px 0px, rgba(24, 44, 89, 0.07) 0px 6px 12px 0px`
- **White Pill CTA:** `rgba(53, 65, 90, 0.2) 0px 0px 0px 1px inset`
- **Selected Category Pill:** `rgba(255, 255, 255, 0.2) 0px 0px 0px 1px inset`

## Surfaces

- **Canvas** (`#ffffff`) — Page background, default working surface
- **Card Surface** (`#ffffff`) — Floating panels, prompt card, feature cards on light backgrounds
- **Gradient Hero Field** (`#7d2ae8`) — Full-bleed hero background — teal-to-violet gradient, behind headline
- **Dark Surface** (`#0f1015`) — Rarely used dark surface for inverse sections or dark-mode cards

## Imagery

Imagery is dominated by full-bleed gradient washes (teal-to-violet, purple-to-coral) used as both hero backgrounds and feature card fills — there is little traditional photography. The visual content is mostly product mockups: screenshot-style previews of design templates, AI-generated imagery, and template thumbnails arranged in a horizontal scroll or grid. Icons are flat, geometric, and carry their own vivid color (orange, pink, magenta, violet) — no outlined monochrome iconography. The design system uses color-coded category icons embedded in pill tabs to communicate tool types (AI, Presentations, Social, Video, Print Shop). Image treatment: bright, saturated, gradient-heavy, no duotone or desaturation. The visual density is moderate — the page is text-driven for headlines and CTAs, but the hero card and feature cards carry enough visual mass to feel rich.

## Layout

Full-width gradient hero band, then max-width 1200px centered content for the rest of the page. Hero: centered headline + subtitle + single white pill CTA over a teal-to-violet gradient, with a large floating white prompt card below the fold. Section rhythm: each major section is separated by ~80px of whitespace on a white canvas. Content arrangement: section headings are centered, followed by either a 2-column or 3-column card grid, with cards equal width and 16–24px gaps. The 'Unlock Canva's creative ecosystem' section uses an asymmetric 2-up grid (one wide card, one narrow). Navigation: minimal top bar, white background, logo left, centered text links, right-aligned 'Sign up' (violet) + 'Log in' (ghost). No sidebar. The overall density is comfortable to spacious — the page breathes between sections and never stacks more than two visual elements vertically without a divider or whitespace break.

## Similar Brands

- **Figma** — Same white-canvas-plus-vivid-accent approach, similar custom humanist sans-serif, generous card grids with soft 8px corners
- **Notion** — Same monochrome ink-black-and-white UI chrome with sparing color, tight letter-spacing on display headings, pill-shaped tab navigation
- **Stripe** — Same gradient-loving hero treatment and confident tight-tracked display typography, though Canva leans more playful with its accent palette
- **Linear** — Same restraint in chrome (white surfaces, subtle shadows, 8px radii) contrasting with bold headline type and purple brand accent
- **Pitch** — Same creative-tool aesthetic with vivid gradient hero bands, colorful category icons, and humanist sans-serif type
