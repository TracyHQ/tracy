# Apple (España) — Style Reference
> gallery vitrine in morning fog

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Apple's product page visual system is a near-monochrome cathedral of negative space where a single product floats centered under enormous display type. The canvas is fog-gray #f5f5f7 with pure white surfaces layered above, and the entire chromatic range is reduced to one precise blue (#0071e3) that exists only to make the buy button switch on. Typography carries the design: SF Pro Display at weight 600 with aggressive negative tracking at 56–96px creates headlines that feel carved rather than typed, while body copy at 17–21px stays whisper-thin to let the product breathe. Components are reduced to essential geometry — pill buttons at 980px radius, rounded cards at 28px, no shadows, no decorative borders — so the imagery and type do all the emotional work.

## Colors

| Name | Value | Role |
|------|-------|------|
| Apple Ink | `#1d1d1f` | Primary text, card borders, structural outlines — near-black with a hint of warmth prevents harshness against the fog canvas |
| Fog Canvas | `#f5f5f7` | Page background, badge fills, secondary surfaces — the signature Apple light gray that defines the gallery atmosphere |
| Pure White | `#ffffff` | Card surfaces, icon fills, elevated layers above fog canvas |
| Graphite | `#707070` | Secondary text, subdued borders, nav dividers |
| Slate | `#86868b` | Muted helper text, tertiary metadata, de-emphasized labels |
| Charcoal | `#333336` | Nav bar elements, button borders on dark surfaces, structural strokes |
| Smoke | `#474747` | Nav text and borders, link borders in secondary contexts |
| Iron | `#5b5b61` | Body text in lower-emphasis contexts, subtle borders |
| Ash | `#e8e8ed` | Ghost button backgrounds, inactive chip surfaces, soft separators |
| Electric Blue | `#0071e3` | Buy button fill, primary action background — the only chromatic surface in the system, reserved exclusively for conversion |
| Link Blue | `#0066cc` | Inline text links, Learn more arrows, navigational text accents |
| Iridescent Spectrum | `linear-gradient(60deg, rgb(8, 148, 255) 0%, rgb(201, 89, 221) 40%, rgb(255, 46, 84) 67%, rgb(255, 144, 3) 100%)` | Decorative imagery gradient spanning cyan, violet, magenta, amber — appears only in the product's light-ring visual, never in UI controls |

## Typography

### SF Pro Display — Display and headings — weight 600 at 56–96px with aggressive negative tracking (up to -0.022em) creates headlines that read as carved geometry rather than typed copy; feature labels at 19–28px use slight positive tracking (0.004–0.012em) to breathe as small caps-like marks
- **Substitute:** Inter Tight, or system-ui at weight 600
- **Weights:** 600
- **Sizes:** 19, 21, 24, 28, 32, 56, 72, 80, 96
- **Line height:** 1.07, 1.14, 1.19, 1.21
- **Letter spacing:** -0.015em at 19px, -0.012em at 21px, -0.009em at 28px, -0.005em at 32px, 0.004em at 56px, 0.007em at 72px, 0.009em at 80px, 0.012em at 96px
- **OpenType features:** `"numr" on`

### SF Pro Text — Body copy, navigation, supporting text — 17px at weight 400 is the default reading size; 20px for lead paragraphs; 12px for legal and footnote text; 44px reserved for large interactive text. Negative tracking tightens at all sizes (-0.022em to -0.003em)
- **Substitute:** Inter, or system-ui
- **Weights:** 400, 600
- **Sizes:** 12, 17, 20, 44
- **Line height:** 1.33, 1.47, 1.83
- **Letter spacing:** -0.022em at 12px, -0.019em at 17px, -0.01em at 20px, -0.003em at 44px
- **OpenType features:** `"numr" on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.33 | -0.22px |
| body-sm | — | — | 17px | 1.47 | -0.32px |
| body | — | — | 20px | 1.47 | -0.2px |
| subheading | — | — | 28px | 1.14 | -0.25px |
| heading-sm | — | — | 32px | 1.19 | -0.16px |
| heading | — | — | 56px | 1.07 | 0.22px |
| heading-lg | — | — | 72px | 1.07 | 0.5px |
| display | — | — | 96px | 1.07 | 1.15px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1440px
- **Section gap:** 120px
- **Card padding:** 28px
- **Element gap:** 10px

### Border Radius

- **nav:** 980px
- **tags:** 999px
- **cards:** 28px
- **images:** 28px
- **buttons:** 980px

## Components

### Global Nav Bar
**Role:** Persistent top navigation across all Apple product pages

Full-width bar at 48px height, background #1d1d1f with 0.8 opacity creating a translucent dark band. Inner content centered at max-width 1024px with horizontal padding 10px. Apple logo on the left, category links in a single row, search and bag icons on the right. Text at 12px SF Pro Text weight 400, color #f5f5f7, letter-spacing -0.01em. No visible borders or shadows — floats over content with subtle backdrop blur.

### Hero Product Visual
**Role:** Full-bleed centerpiece of the product page

Centered product render or photograph occupying the top 60–80vh of the page. No card container, no border, no background frame — the product sits directly on Fog Canvas #f5f5f7. Aspect ratio varies (typically 16:9 or 4:3), always centered. Sometimes layered with iridescent light-ring gradients as decorative atmospheric effects.

### Hero Headline Block
**Role:** Product name and tagline anchoring the hero

Left-aligned stack positioned in the lower-left quadrant of the hero. Product name in SF Pro Display weight 600 at 21px, color #1d1d1f. Main headline in SF Pro Display weight 600 at 56–80px, color #1d1d1f, line-height 1.07, letter-spacing tightening at scale. Subtext in SF Pro Text weight 400 at 17px, color #707070. Generous spacing between lines (~8–12px).

### Price and Buy Button Group
**Role:** Conversion cluster in the hero

Price label at 17px SF Pro Text weight 400, color #1d1d1f, positioned to the left. Buy button (Comprar) as a pill at 980px border-radius, background #0071e3, text white at 17px weight 400, padding 8px 16px, positioned right of price with 12px gap. Button has no border, no shadow. This is the only place the brand blue appears as a fill.

### Inline Text Link
**Role:** Learn more, Ver el video, and navigational text accents

Plain text at 17px SF Pro Text weight 400, color #0066cc, no underline by default. Often paired with a small inline play icon or arrow. Used for secondary actions where a full button would be too heavy.

### Feature Section Heading
**Role:** Section title above large feature visuals

Short noun phrase (1–3 words like 'Lo principal.') in SF Pro Display weight 600 at 32–56px, color #1d1d1f, left-aligned with page gutter padding. A 'Watch the film' link sits opposite in #0066cc at 17px. Massive vertical breathing room (80–120px) above and below.

### Feature Visual Block
**Role:** Large editorial image or animation with overlaid caption

Full-width or large centered image/video (typically 1200–1440px wide) with rounded corners at 28px. Caption text overlaid or positioned above in SF Pro Text weight 400 at 17–21px, color #1d1d1f, centered. No card background, no border, no shadow — the image edge itself is the container.

### Ghost Button
**Role:** Secondary action on light backgrounds

Border at 1px #1d1d1f, border-radius 980px (pill), background transparent, text #1d1d1f at 17px SF Pro Text weight 400, padding 10px 20px. Hover state fills to #1d1d1f with white text. Used for 'Watch the film' or secondary CTAs when the primary blue is already present.

### Badge Chip
**Role:** Small inline status or label

Background #f5f5f7, border-radius 999px (pill), padding 4px 10px, text at 12px SF Pro Text weight 400, color #1d1d1f. No border. Used sparingly for new-arrival tags, availability indicators, or feature labels.

## Do's and Don'ts

### Do
- Use #0071e3 exclusively for the buy/conversion button — never for links, icons, or decorative elements
- Set all display headlines at SF Pro Display weight 600 with line-height 1.07; tighten tracking to -0.005em at 32px and open to 0.012em at 96px
- Layer surfaces as Fog Canvas #f5f5f7 → Pure White #ffffff → #e8e8ed for ghost controls — never introduce new background colors
- Apply 28px border-radius to all image and card containers; 980px for pills; 999px for chips — no sharp corners anywhere
- Set body text at 17px SF Pro Text weight 400 in #1d1d1f or #707070; never go below 12px for any visible text
- Use #0066cc for inline text links only — no underlines, no background fills, no button shapes
- Center all product visuals horizontally; let the headline block sit lower-left with generous negative space dominating the composition

### Don't
- Don't use shadows, gradients, or elevation effects on any card or button — the system is flat by design
- Don't introduce accent colors beyond the iridescent spectrum gradient — the palette is monochrome plus one blue
- Don't set headlines below 32px; this system relies on enormous type as the primary visual element
- Don't use border-radius below 18px on any container — sharpness is not in the vocabulary
- Don't apply #0071e3 to text, borders, or icons — it is a button fill only, used in conversion moments
- Don't add decorative dividers, rules, or section separators between content blocks — whitespace is the only divider
- Don't mix font families; SF Pro Display for display roles, SF Pro Text for body — never substitute a serif or display face

## Elevation

The system is intentionally flat: no shadows, no blur, no stacked elevation. Depth is created through surface color progression (#f5f5f7 → #ffffff → #e8e8ed) and the generous scale of typography, not through drop shadows or layered cards. The only edge treatment is the 28px radius on image and card containers, which softens boundaries without creating visual weight.

## Surfaces

- **Fog Canvas** (`#f5f5f7`) — Base page background, the signature Apple light gray atmosphere
- **Pure White** (`#ffffff`) — Card surfaces, elevated content blocks, icon fills on dark nav
- **Ash** (`#e8e8ed`) — Ghost button fills, inactive chip backgrounds, subtle interactive surfaces
- **Electric Blue** (`#0071e3`) — Primary action button — the single chromatic surface in the entire system

## Imagery

Product photography and high-fidelity 3D renders dominate, always centered and presented as the hero subject. Images float on the fog canvas with no frame, no card background, no border — the object is its own container, often occupying 60–80% of the viewport width. A signature visual element is the iridescent light-ring gradient (cyan → violet → magenta → amber at 60°) that appears behind or around the product, rendered as a prismatic optical effect rather than a flat graphic. Lifestyle photography is minimal and tightly cropped, focused on hands or silhouettes wearing the product in motion, always desaturated or rendered in near-monochrome to maintain the gallery atmosphere. No stock photography, no illustration, no abstract graphics — the product is the entire visual language.

## Layout

Full-bleed pages with a max content width of 1024–1440px centered on the fog canvas. The hero is a single full-viewport-height section with the product visual centered and the headline block anchored to the lower-left, creating an asymmetric composition. Feature sections alternate between full-width editorial images (1200–1440px) and centered text-only blocks, with vertical spacing of 80–120px between sections — rhythm is created by scale changes and whitespace, not by alternating background colors. Navigation is a single dark translucent bar fixed at the top (48px height). The grid is implicit: single-column for most content, breaking into 2-column or 3-column card grids only for comparison or accessory sections. Density is sparse — each page has 3–5 major sections maximum, each given room to breathe.

## Similar Brands

- **Bang & Olufsen** — Same product-as-sculpture philosophy with massive display type, near-monochrome palette, and minimal UI chrome around a centered hero product
- **Teenage Engineering** — Gallery-style product pages with enormous typography, generous whitespace, and a single product floating on a neutral canvas
- **Nothing (tech)** — Minimalist product page aesthetic with dot-matrix type, monochrome surfaces, and a single accent color for CTAs
- **Dyson** — Product-hero pages with centered floating product renders, large feature labels, and restrained UI that defers to the object
- **Leica Camera** — Editorial product photography with minimal type, no decorative borders, and a museum-vitrine presentation of a single product
