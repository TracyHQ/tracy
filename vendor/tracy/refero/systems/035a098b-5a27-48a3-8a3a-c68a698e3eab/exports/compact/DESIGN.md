# Headspace — Style Reference
> Sunlit wellness retreat on warm paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Headspace lives in a sunlit wellness retreat on warm paper: a cream canvas (#f9f4f2) that breathes, bold rounded surfaces, and tightly tracked headlines that feel confident and calm rather than clinical. The palette is predominantly achromatic with a warm dark text scale (#2d2c2b, #44423f) that never goes cold-black on body copy, and color is deployed as deliberate emotional punctuation — Headspace yellow for energy, electric blue for the primary signup, and a deep violet for contemplative moments. Radii are generous: 16-32px on cards and feature blocks, 8px on buttons and inputs, and 9999px (800px in tokens) for pills and circular elements, giving every surface a soft, huggable quality. Typography is a single custom geometric sans (Headspace Apercu) at weights 400/500/700 with negative letter-spacing that tightens as sizes scale up, producing headlines that feel sculpted rather than shouted.

## Colors

| Name | Value | Role |
|------|-------|------|
| Page Cream | `#f9f4f2` | Page background, large section surfaces — the warm paper tone that sets the entire mood |
| Pure White | `#ffffff` | Card surfaces, elevated panels, input fills, inverse text on dark buttons |
| Charcoal Ink | `#2d2c2b` | Supporting neutral for secondary UI, dividers, and muted labels. Do not promote it to the primary CTA color |
| Graphite | `#44423f` | Secondary text, muted UI labels, icon strokes, nav links |
| Slate | `#4b4c4d` | Tertiary text, footer body, helper copy, low-emphasis borders |
| Stone | `#63605d` | Disabled states, lowest-emphasis text, decorative dividers |
| Driftwood | `#c6c1b9` | Hairline list dividers, subtle structural separators |
| Linen | `#e2ded9` | Card borders, input borders, subtle elevation shadows — the neutral that separates surfaces on cream |
| Ash | `#d0d0d0` | Input border, focused field rings, checkbox borders |
| Soft Black | `#000000` | True black for maximum-contrast dark buttons and bold display text |
| Brand Orange | `#f47d31` | Headspace logo mark — the single warm dot that anchors the brand identity across all surfaces |
| Mindful Blue | `#0061ef` | Violet supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Sunbeam Yellow | `#ffce00` | Headspace signature brand yellow — top banner backgrounds, feature card highlights, optimistic punctuation |
| Deep Indigo | `#3b197f` | Contemplative illustration fills, meditation-related visual moments — the serious counterpart to the cheerful yellow |
| Twilight Violet | `#281466` | Deep illustration fills paired with Deep Indigo, gradient companion, night-mode meditation contexts |
| Plum | `#5f2b89` | Mid-tone violet for illustration gradients and decorative fills |
| Mauve | `#8144a8` | Lighter violet in illustration gradients — soft, warm purple |
| Celeste | `#00a4ff` | Bright sky blue used in category icons and decorative illustration accents |

## Typography

### Headspace Apercu — Single-family system used for everything from body copy to display headlines. Weights are 400 (body), 500 (subheadings, nav), 700 (headings, buttons). The custom geometric forms give a friendly-but-precise feel; tight tracking on display sizes sculpts the headlines into confident shapes rather than defaulting to bold shouts.
- **Substitute:** Inter, DM Sans, or Plus Jakarta Sans
- **Weights:** 400, 500, 700
- **Sizes:** 12, 14, 16, 18, 20, 24, 29, 32, 40, 48, 52, 56, 64, 72
- **Line height:** 1.2-1.5 body, 0.73-1.2 display
- **Letter spacing:** -0.0100em body, -0.0250em medium, -0.0300em display
- **OpenType features:** `'ss01' on, 'cv11' on`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.12px |
| body-sm | — | — | 14px | 1.5 | -0.14px |
| body | — | — | 16px | 1.5 | -0.16px |
| subheading | — | — | 20px | 1.33 | -0.5px |
| heading-sm | — | — | 24px | 1.33 | -0.6px |
| heading | — | — | 32px | 1.3 | -0.8px |
| heading-lg | — | — | 40px | 1.29 | -1px |
| display | — | — | 52px | 1.13 | -1.56px |
| display-lg | — | — | 72px | 1.1 | -2.16px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 32-48px
- **Element gap:** 8-16px

### Border Radius

- **cards:** 16px
- **pills:** 800px
- **small:** 8px
- **inputs:** 8px
- **buttons:** 800px
- **featured:** 24-32px

## Components

### Yellow Announcement Banner
**Role:** Top-of-page promotional strip

Full-width #ffce00 background, dark #2d2c2b text, centered, single-line message. 32-40px vertical padding, 14-16px body text. No close button visible. The warm yellow immediately sets the brand tone.

### Primary Navigation Bar
**Role:** Site-wide navigation

White (#ffffff) background, 1px bottom border in #e2ded9. Logo (orange dot + 'headspace' wordmark) left, centered nav links (For You, For Business, For Providers, Our Plans, Resources, About) in #2d2c2b at 16px weight 500, right side has Log In text link, Help text link, and blue #0061ef 'Try for free' pill button.

### Primary Blue CTA Button
**Role:** Main signup / go action

Background #0061ef, white text, 800px (fully pill) border-radius, 12px 24px padding, 16px weight 700 text. Highest visual emphasis in any interface. Used for top-level conversions.

### Dark Pill Button
**Role:** Secondary action / product-level CTA

Background #2d2c2b (or #000000 for true black), white text, 800px radius, 14-16px 28px padding, 16px weight 700. Features a 2px solid offset shadow in rgba(65,61,69,0.2) giving a printed-sticker depth cue. Used for 'Try for $0', 'Check your coverage', and 'Subscribe'.

### Hero Feature Card
**Role:** Large dual-purpose content block

Two large cards side-by-side. Background #f9f4f2 or #ffffff, 24-32px border-radius, 48px internal padding. Contains a centered heading (32-40px weight 700), dark pill CTA below, and a phone-screenshot mockup with decorative illustration elements. Generous whitespace, no visible border — surface difference from page cream defines the card.

### Category Card
**Role:** Topic navigation tile

White (#ffffff) background, 16px border-radius, 1px #e2ded9 border, 20-24px padding. Layout: text label left (16px weight 500 in #2d2c2b), colored icon glyph center-right, chevron right. Icon colors vary by category: yellow lightning, purple moon, teal spiral, pink smiley, orange circle, blue speech. Arranged in a 3-column grid.

### Filter Pill
**Role:** Section tab / category filter

Two variants: active = #2d2c2b background, white text, 800px radius, 12px 20px padding, 14px weight 500, with a small white dot indicator. Inactive = white background, #2d2c2b text, 1px #e2ded9 border, same dimensions. Horizontal row layout.

### Content Feature Card
**Role:** Full-width colored content highlight

Large card with a vivid brand-color background (#ffce00 yellow primary, #ffa1cc pink, #00a4ff blue variants). 24-32px radius. Contains a small floating chat-style UI mockup (white card with message bubble) over the colored surface, with a large display heading beside it in #2d2c2b.

### Email Subscribe Form
**Role:** Newsletter capture

Inline row: white (#ffffff) email input (8px radius, 1px #d0d0d0 border, 16px weight 400 placeholder) adjacent to a dark pill 'Subscribe' button (#2d2c2b). Input takes ~60% width, button ~30%. Stacks on mobile.

### Footer Link Directory
**Role:** Site map / secondary navigation

6-column grid on #f9f4f2 background. Column headers (16px weight 700 #2d2c2b), links (14px weight 400 #63605d, 10-12px row gap). 'Get the app' column contains black App Store and Google Play badge buttons. Copyright and legal links in a thin #2d2c2b strip below.

### App Store Badge Button
**Role:** Download CTA in footer

Black (#000000) rounded rectangle, white Apple/Google logo and 'Download on the App Store' / 'GET IT ON Google Play' text. ~140px wide, 8px radius. Official badge styling — not custom.

### Notification Toast / Chat Bubble
**Role:** In-context AI companion UI

White card, 12-16px radius, small drop shadow. Contains a colored dot avatar (brand color), bold user label, and message text in #44423f. Used as decorative UI element overlaid on content cards to suggest the Ebb AI companion.

## Do's and Don'ts

### Do
- Use Page Cream (#f9f4f2) as the default canvas — never substitute pure gray or white as the page background
- Use 800px border-radius for all primary buttons, CTAs, and pills to maintain the huggable, rounded character
- Apply Headspace Apercu weight 700 with -0.0300em letter-spacing for any display-sized heading (40px+) — the tight tracking is the signature
- Use Sunbeam Yellow (#ffce00) sparingly as emotional punctuation for banners and feature highlights, not as a default surface color
- Pair dark pill buttons (#2d2c2b) with the 2px solid charcoal offset shadow for a printed-sticker depth effect
- Use Mindful Blue (#0061ef) exclusively for the single highest-priority action per view — never spread it across multiple buttons
- Build section rhythm with 64px vertical gaps between major bands; cards within a band breathe with 24-32px gaps
- Ground the brand with the orange logo dot (#f47d31) in the top-left of every page — it is the only element that never changes

### Don't
- Do not use #000000 for body text — the warm dark #2d2c2b keeps the interface from feeling clinical
- Do not apply heavy drop shadows to cards; rely on the cream/white surface contrast and 1px Linen (#e2ded9) borders instead
- Do not use sharp corners (0-4px radius) on cards or buttons — the entire system speaks soft and rounded
- Do not introduce new saturated colors outside the brand palette; every chromatic choice should map to mindfulness/calm/energy
- Do not center-align long body copy — left-align paragraphs of 16px+ text; center only short headlines and single statements
- Do not use outline-only monoline icons — Headspace icons are filled, colorful, and rounded
- Do not stretch the nav or footer to different background colors from the page cream — keep the warm paper continuous
- Do not use letter-spacing 0 or positive values on headings — the negative tracking from 400px upward is non-negotiable for brand recognition

## Elevation

- **Dark buttons:** `rgba(65, 61, 69, 0.2) 0px 2px 0px 0px`
- **Cards on cream:** `0 1px 2px rgba(0,0,0,0.04) — hairline border preferred over shadow`

## Surfaces

- **Page Cream** (`#f9f4f2`) — Base canvas — the warm paper tone of the entire site
- **Pure White** (`#ffffff`) — Card surfaces, category cards, email input fields
- **Sunbeam Yellow** (`#ffce00`) — Feature content cards, brand-accent surfaces
- **Blush** (`#ffa1cc`) — Alternate accent surface for content variety
- **Celeste** (`#00a4ff`) — Rare chromatic surface for standout feature blocks

## Imagery

Illustration-led with photographic interludes. Category navigation uses flat geometric icon badges (lightning bolt, crescent moon, spiral, smiley, circle, speech bubble) in brand colors on white. Feature cards combine real product-screenshot crops (phone frames showing the app interface like Managing Anxiety, therapy sessions) with flat, friendly 2D illustration — soft organic shapes, abstract characters, warm color washes in the yellow/violet/blue palette. Hero sections blend product mockups with decorative blob shapes. Photography appears sparingly — therapy provider headshots are real portraits with warm natural lighting, not stylized. Icons in the category grid are filled, multi-colored, and rounded — never outlined monoline. The overall feel is craft-illustration meets real product: warm, hand-built, optimistic.

## Layout

Full-bleed bands alternating between cream and white card-on-cream compositions. Hero is a centered headline-over-content-block pattern with the brand statement above two large side-by-side feature cards. Navigation is a simple white top bar (logo left, links center, login + blue CTA right) with a high-contrast yellow announcement strip above it. Content sections follow a rhythm of: eyebrow pills/tabs → centered display headline → 2-column or 3-column card grids → large single full-width colored content card. The footer is a dense 6-column link directory on cream with email capture above and app store badges beside login. Cards within grids use generous 24-32px gaps; the page breathes with 64px section gaps. No sidebar, no mega-menu — every section is a clean horizontal band.

## Similar Brands

- **Calm** — Same warm cream + accent yellow palette, generous rounded cards, single primary blue action button, and meditation/mental-health visual territory
- **Calm app** — Shared pill-radius buttons, large soft product mockups in feature cards, and illustrated decorative blob shapes over colored content surfaces
- **Notion** — Similar warm dark text (#2d2c2b range) instead of clinical black, tight negative letter-spacing on display headings, and cream/white surface contrast philosophy
- **Mailchimp** — Same voice — friendly geometric sans, cream canvas, bold single-color feature cards, and rounded pill CTAs in primary blue
- **Spotify** — Shared brand color usage strategy — one vivid accent dominates, the rest of the interface stays in a warm neutral scale with generous radii
