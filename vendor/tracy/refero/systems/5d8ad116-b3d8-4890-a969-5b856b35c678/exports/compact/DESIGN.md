# Campsite — Style Reference
> Warm paper workspace — quiet, cream, and product-forward

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Campsite runs on warm minimalism: a cream-white canvas (#fffdf9) that feels like paper, paired with near-black text and almost no color. The interface is quiet, compact, and confident — Inter at every size, tight tracking on display sizes, pill-shaped controls, and soft elevation that barely lifts off the page. Color is rationed to functional punctuation: green for resolved states, a warm yellow wash for highlights, and a single dark-orange tone that lives in decorative paint-splash branding rather than in the UI itself. The product mockup is the hero — large, full-bleed, and dominant — while surrounding copy stays small and restrained, letting the product speak.

## Colors

| Name | Value | Role |
|------|-------|------|
| Warm Canvas | `#fffdf9` | Page background — a warm off-white that gives the entire site its paper-like quality |
| Pure White | `#ffffff` | Card surfaces, elevated panels, and product-screenshot backgrounds |
| Ash Mist | `#f5f5f5` | Secondary surface for subtle differentiation — post bodies, sidebar items, input fields |
| Soft Fog | `#f0f0f0` | Tertiary surface for nested elements, dividers, and inactive states |
| Ink | `#171717` | Primary text, icons, and headings — near-black warmth rather than pure black |
| Graphite | `#525252` | Secondary text and metadata |
| Steel | `#737373` | Tertiary text, timestamps, and helper labels |
| Silver | `#a3a3a3` | Muted text, placeholders, and inactive icon fills |
| Charcoal Card | `#1e1e1e` | Dark-mode product card surface shown in feature sections |
| Resolve Green | `#22c55e` | Green action color for filled buttons, selected navigation states, and focused conversion moments. Use as a supporting accent, not as a status color |
| Highlight Wash | `#fef3c7` | Soft warm-yellow background for highlighted callouts and quote blocks |
| Sienna Brand | `#451a03` | Decorative branding — paint-splash illustrations and brand-icon accents that frame content edges |
| Alert Red | `#ef4444` | Red action color for filled buttons, selected navigation states, and focused conversion moments. Use as a supporting accent, not as a status color |

## Typography

### Inter — Sole typeface for all UI, headings, body, and buttons. The 58px hero headline with weight 600 and -0.031em tracking is the typographic anchor — tight, confident, never thin. Body text settles at 14–16px with weight 400. No display serif or alternate families — the system achieves hierarchy purely through size and weight within Inter.
- **Substitute:** system-ui, -apple-system, sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 29, 58
- **Line height:** 1.00–1.80
- **Letter spacing:** -1.8px at 58px, -0.52px at 29px, -0.27px at 15px, +0.3px at 12px (uppercase badges)
- **OpenType features:** `"cv11", "ss01"`

### ui-monospace — ui-monospace — detected in extracted data but not described by AI
- **Weights:** 400, 600
- **Sizes:** 12px
- **Line height:** 1

### emoji — emoji — detected in extracted data but not described by AI
- **Weights:** 500, 600
- **Sizes:** 12px, 14px
- **Line height:** 1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.4 | — |
| body | — | — | 15px | 1.56 | -0.27px |
| body-lg | — | — | 18px | 1.63 | — |
| subheading | — | — | 22px | 1.4 | — |
| heading | — | — | 29px | 1.33 | -0.52px |
| display | — | — | 58px | 1.2 | -1.8px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **tags:** 9999px
- **cards:** 12px
- **images:** 8px
- **inputs:** 8px
- **avatars:** 9999px
- **buttons:** 9999px

## Components

### Pill Primary Button
**Role:** Filled action button for primary CTAs

Full pill radius (9999px), Ink (#171717) background, white text at 14px weight 500, padding 10px 20px, subtle inset highlight shadow. Used sparingly — most pages rely on text or ghost buttons.

### Promo Pill Button
**Role:** Orange branded announcement button

Full pill radius (9999px), Sienna Brand (#451a03) background with white text, 10px 16px padding, 13px weight 500. Used only for branded announcements and launch promotions.

### Ghost Text Button
**Role:** Low-emphasis inline action

No background, Ink (#171717) text at 14px weight 500, 4px vertical / 8px horizontal padding. The default for most navigation and secondary actions.

### Product App Card
**Role:** Large product screenshot container

Pure White (#ffffff) background, 12px radius, soft layered shadow (see elevation), overflow hidden to clip the screenshot edges. The hero component — spans nearly full page width.

### Post Card
**Role:** Content card in the product feed

Pure White (#ffffff) background, 8px radius, 1px border in #f0f0f0, padding 16px, 8px gap between elements. Contains avatar, author name, timestamp, post body, and category tag.

### Status Badge
**Role:** Category or state indicator

4px radius, 4px 8px padding, 12px Inter weight 500. Green (#22c55e) background with white text for 'Resolved'. Neutral #f5f5f5 background with #737373 text for category tags like 'Product' or 'Engineering'.

### Notification Pill
**Role:** Top-of-page announcement banner

Full pill radius, Ink (#171717) background, white text at 13px weight 500, with a small dark 'NEW' tag and right-arrow icon. Centered above the hero headline.

### Sidebar Navigation
**Role:** Left rail in product mockup

Pure White (#ffffff) background, 1px right border in #f0f0f0, 240px width. Items are 10px 12px padded, 14px Inter weight 400, Ink for active, #737373 for inactive. Active item has a subtle #f5f5f5 background fill.

### Quote Callout
**Role:** Customer testimonial block

Highlight Wash (#fef3c7) background, 8px radius, 16px padding. Quote text in Ink at 16px weight 400, attribution below in #525252 at 13px with avatar.

### Feature Card
**Role:** Product capability showcase

Pure White (#ffffff) background, 12px radius, 1px border in #f0f0f0, padding 20px. Pairs a small product UI mockup (left) with a heading and description (right) in a 2-column layout.

### Input Field
**Role:** Text input for post composer

Ash Mist (#f5f5f5) background, 8px radius, 12px padding, 1px border in #f0f0f0. Placeholder text in #a3a3a3 at 14px weight 400. A 'Post' submit button sits flush right.

### Avatar
**Role:** User identification

Full circle (9999px radius), 24px or 32px diameter, with a 1px border in #ffffff to separate from backgrounds. Initials or photo fill.

### Logo Mark
**Role:** Brand identity

Rounded square (8px radius) with Sienna Brand (#451a03) background and white geometric mark. 32px in the header, 24px in the favicon.

## Do's and Don'ts

### Do
- Use Inter weight 400 for body, 500 for UI labels, 600 for headings — never go below 400 or above 600
- Apply -1.8px letter-spacing at 58px display size and scale proportionally down to -0.27px at 15px body
- Use 9999px radius for all buttons, tags, and avatars — pill shapes are the system's identity
- Keep the canvas at #fffdf9 (warm white) — never use pure #ffffff for page backgrounds, only for cards and elevated surfaces
- Use the layered 5% opacity shadow stack for product cards and the stronger multi-stop shadow only for the hero product mockup
- Limit color to functional roles: green for resolved, #fef3c7 for highlights, #ef4444 for destructive — everything else stays monochrome
- Space sections at 64px with 8px element gaps and 16px card padding — the 4px base unit keeps everything snap-aligned

### Don't
- Don't introduce a second typeface — Inter alone carries the entire hierarchy
- Don't use heavy drop shadows, colored shadows, or shadows with more than 10% opacity
- Don't use sharp corners (0px radius) on any interactive element — minimum 8px, prefer pill
- Don't apply Sienna Brand (#451a03) to text body or list items — it's decorative branding only
- Don't add gradients, glassmorphism, or neumorphism — surfaces are flat with hairline borders
- Don't use pure black (#000000) for text — use #171717 for warmth
- Don't exceed 58px for display headings or go below 11px for any text — the scale is intentionally tight

## Elevation

- **Product cards and elevated panels:** `rgba(0, 0, 0, 0.05) 0px 3px 6px -3px, rgba(0, 0, 0, 0.05) 0px 2px 4px -2px, rgba(0, 0, 0, 0.05) 0px 1px 2px -1px`
- **Buttons and interactive controls:** `rgba(0, 0, 0, 0.08) 0px 1px 1px -1px, rgba(0, 0, 0, 0.08) 0px 2px 2px -1px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px, inset 0 1px 0 rgba(255,255,255,0.32)`
- **Floating product mockup (hero):** `rgba(0, 0, 0, 0.1) 0px 0.5px 0px 0px inset, rgba(0, 0, 0, 0.1) 0px 2px 4px 0px, rgba(0, 0, 0, 0.1) 0px 4px 12px 0px, rgba(0, 0, 0, 0.02) 0px 8px 20px 0px`

## Surfaces

- **Warm Canvas** (`#fffdf9`) — Base page background
- **Pure White** (`#ffffff`) — Cards, product screenshots, and primary elevated surfaces
- **Ash Mist** (`#f5f5f5`) — Nested content blocks, post bodies, subtle panel fills
- **Soft Fog** (`#f0f0f0`) — Dividers, inactive state backgrounds, tag fills

## Imagery

The site is product-screenshot dominant. The hero features a large, full-bleed macOS-style app window with traffic-light controls, a left sidebar, and a messaging feed. These product mockups are the primary visual — they span nearly the full content width and carry the most visual weight. Decorative orange paint-splash illustrations frame the left and right edges of the page, adding organic warmth to the otherwise precise grid. No photography, no stock imagery, no abstract graphics — the product UI IS the imagery. Icons within the product are small, filled, and monochrome (Ink or #737373).

## Layout

Centered max-width (~1200px) container with the hero headline centered over the product mockup. The product mockup is the dominant element — full-width, slightly overlapping the content boundary. Below the fold, content alternates between centered headline + description stacks and 2-column feature blocks (product mockup left, text right). The sidebar paint-splash decorations bleed off the left and right edges of the viewport, creating a frame around the centered content. Vertical rhythm is 64px between sections, with generous breathing room. Navigation is minimal: a small logo top-left, three text links top-right, no sticky header or mega-menu.

## Similar Brands

- **Linear** — Same monochrome-first approach with Inter typography, pill buttons, and the product UI as the hero — both treat their app screenshot as the primary visual
- **Notion** — Warm canvas background, minimal color palette, and compact information density — both use the page itself as a demonstration of the product's aesthetic
- **Height** — Compact task-tool layout with soft shadows, monochrome surfaces, and green for completion states — shares the 'quiet productivity tool' visual language
- **Pitch** — Product-forward hero with large UI mockup, Inter typeface, pill controls, and warm off-white canvas — both make the app screenshot the visual anchor
