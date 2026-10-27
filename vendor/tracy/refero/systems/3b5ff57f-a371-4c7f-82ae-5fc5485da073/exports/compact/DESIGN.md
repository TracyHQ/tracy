# Suno — Style Reference
> Afterglow on a mixing console. Cream typography and a sunset wash over a matte black studio, with a single coral button as the only chromatic punctuation.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Suno operates in a warm nocturnal register: a near-black canvas (#101012) lit by a single dusk-gradient wash, with one cream-warm off-white (#f7f4ef) carrying all body and headline text. The whole product feels like a recording studio after midnight — quiet, matte, and slightly reflective, with color reserved as a single-function event (the coral Create button) that punctuates an otherwise monochromatic surface. Typography does the heavy lifting: Neue Montreal sets almost everything in compact 14–16px rows, while an Editorial New italic display voice breaks the dark with humanistic serifs at 72–140px, giving every screen one moment of warmth and scale. Components are low-elevation by default — soft cards, ghost controls, thin dividers — and the only true accent is the sunset gradient that bleeds behind the hero.

## Colors

| Name | Value | Role |
|------|-------|------|
| Studio Black | `#101012` | Page canvas, default surface — the dominant background behind every screen |
| Deep Anvil | `#17171a` | Elevated surface — cards, input wells, modals layered above the canvas |
| Pure Ink | `#000000` | Dark supporting neutral for text, icons, and strong contrast. Do not promote it to the primary CTA color |
| Warm Cream | `#f7f4ef` | Primary text color and high-contrast foreground — the signature off-white that keeps the dark UI from feeling cold |
| Bone | `#ffffff` | Secondary text, icon strokes, and bright borders where maximum contrast is needed |
| Smoke | `#c2c2c1` | Muted helper text, disabled labels, and low-emphasis captions |
| Ember Coral | `#fd429c` | Red supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Dusk Wash | `radial-gradient(ellipse at 30% 20%, #d4622a 0%, #8a2a3a 45%, #1a0a0 100%)` | Hero background gradient — warm amber-to-burgundy atmospheric wash that bleeds behind the headline; sets the mood of the brand |

## Typography

### Neue Montreal — Workhorse UI typeface — sets all body, labels, buttons, nav, captions, and mid-size headings; weight 300 is the default, weight 400 for body paragraphs, weight 500 reserved for emphasized UI labels. The ultra-compact tracking (-0.026em at large sizes) and the willingness to scale up to 140px at 0.87 line-height are the signature moves — text behaves as architectural mass, not just copy.
- **Substitute:** Inter, Manrope, or Söhne
- **Weights:** 300, 400, 500
- **Sizes:** 10px, 11px, 12px, 13px, 14px, 15px, 16px, 17px, 18px, 20px, 24px, 40px, 72px, 140px
- **Line height:** 1.20–1.78 (body), 0.87–1.14 (large display)
- **Letter spacing:** -0.0260em at 40px+ sizes, -0.0130em at mid sizes, normal at body

### Editorial New — Reserved for editorial display moments — italic-leaning serif that injects a humanistic counterpoint into the otherwise geometric Neue Montreal system. Appears in hero headlines and curated pull-quotes only; never in product UI. Use it where the system needs to feel like a magazine cover rather than a dashboard.
- **Substitute:** GT Sectra, Canela, or Playfair Display Italic
- **Weights:** 300
- **Sizes:** 24px
- **Line height:** 1.50

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | — |
| body-sm | — | — | 14px | 1.55 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.4 | -0.26px |
| heading-sm | — | — | 24px | 1.33 | -0.31px |
| heading | — | — | 40px | 1.14 | -1.04px |
| heading-lg | — | — | 72px | 1 | -1.87px |
| display | — | — | 140px | 0.87 | -3.64px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 16px
- **Element gap:** 8px

### Border Radius

- **cards:** 12px
- **images:** 20px
- **inputs:** 12px
- **buttons:** 6px
- **hero-cards:** 24px

## Components

### Primary Action Button (Create)
**Role:** The only chromatic button in the system — triggers generation

Pill shape, fill #fd429c (Ember Coral) with a subtle internal gradient toward warm orange, text white at 14px Neue Montreal weight 500, padding 10px 20px, radius 9999px. The only place coral appears; the goal is to make the action feel lit from within.

### Ghost Nav Button (Sign In)
**Role:** Low-emphasis navigation action

Transparent background, 1px solid transparent border, text Warm Cream (#f7f4ef) at 14px weight 400, padding 8px 16px, radius 6px. Hover lifts to 8% white wash.

### Outlined Nav Button (Sign Up)
**Role:** Medium-emphasis navigation action

Transparent background, 1px solid rgba(255,255,255,0.2) border, text Warm Cream at 14px weight 400, padding 8px 16px, radius 6px.

### Hero Prompt Input
**Role:** The core creation surface — where users type or paste a prompt

Full-width centered container, max-width ~720px, background #17171a with 60% opacity backdrop-blur, border 1px solid rgba(255,255,255,0.08), radius 16px, padding 20px. Inner text input is transparent with Warm Cream placeholder text. Contains a leading '+' icon button, an 'Advanced' chip toggle, and the trailing Create button.

### Advanced Toggle Chip
**Role:** Inline secondary action inside the prompt input

Ghost style — 1px solid rgba(255,255,255,0.12) border, text Warm Cream at 13px weight 400, padding 6px 12px, radius 6px. Activated state swaps to 1px solid Ember Coral border.

### Album Art Hero Card
**Role:** Floating social-proof tile flanking the hero

Square image container, radius 20px, 1px solid rgba(255,255,255,0.06) border, ambient shadow rgba(0,0,0,0.25) 0px 25px 50px -12px. Contains a centered play-button overlay (circular, 48px, #000000 60% opacity). Track title and artist name in 12px Warm Cream at 80% opacity below the image.

### Press Logo Row
**Role:** Trust bar — third-party media logos

Horizontal flex row, centered, 32px row height, each logo at #f7f4ef with 60% opacity, gap 64px between logos. No dividers, no background — floats on the dark canvas.

### Top Navigation Bar
**Role:** Persistent header

Transparent background over the gradient hero, 64px tall, 24px horizontal padding. Left: SUNO wordmark in 16px Neue Montreal weight 500 Warm Cream with letter-spacing +0.16em. Right: Sign In (ghost) + Sign Up (outlined) buttons. No center nav — the input is the nav.

### Input Field (text)
**Role:** Standard text input across the product

Background transparent or #17171a, no visible border by default, 1px solid rgba(255,255,255,0.12) on focus (transitions to Ember Coral at 0.4 opacity), text Warm Cream 16px, placeholder Smoke (#c2c2c1) at 60% opacity, radius 12px, padding 12px 16px.

### Track Card
**Role:** Generated-track tile in lists and feeds

Background #17171a, radius 12px, padding 16px, 1px solid rgba(255,255,255,0.06) border. Thumbnail 48x48 radius 8px on the left, title 14px Warm Cream, metadata 12px Smoke on the right. No hover elevation — opacity shift on the play icon only.

### Tag Chip
**Role:** Genre, mood, or style label

Background rgba(255,255,255,0.06), text Warm Cream 12px weight 400, padding 4px 10px, radius 6px. No border.

## Do's and Don'ts

### Do
- Use #101012 as the default canvas for every screen — never introduce a lighter or grayer page background
- Set all body and UI text in Neue Montreal weight 300 or 400 at 14–16px; reserve weight 500 for labels that need to feel switched on
- Make Ember Coral (#fd429c) appear on exactly one element per screen — the primary action button — and nowhere else
- Apply -0.026em letter-spacing to any text at 40px or above to keep large display lines from feeling airy
- Use the dusk gradient only on the hero and one atmospheric interstitial — never as a card or section background
- Use radius 6px for buttons, 12px for inputs and cards, 20px for image tiles, 24px for hero-scale artwork
- Step surfaces with color (#101012 → #17171a → #000000) instead of shadows; reserve the single ambient drop-shadow for floating hero tiles only

### Don't
- Don't introduce a second accent color — the system is intentionally monochrome with one coral punctuation
- Don't use white (#ffffff) as the primary text color — Warm Cream (#f7f4ef) is the signature off-white and prevents the UI from feeling clinical
- Don't apply heavy shadows to cards or buttons — the design language is matte and low-elevation
- Don't use Editorial New for product UI, labels, or buttons — reserve it for hero headlines and editorial pull-quotes only
- Don't set body text above 18px or below 13px — the type scale lives in a narrow middle band
- Don't use radius values outside the {6, 12, 20, 24} set — these four values are the entire radius vocabulary
- Don't place the Create button on a non-dark surface — the coral is calibrated to read against #101012, not against light backgrounds

## Elevation

- **Album art cards (floating hero tiles):** `rgba(0, 0, 0, 0.25) 0px 25px 50px -12px`

## Surfaces

- **Canvas** (`#101012`) — Base page background
- **Card** (`#17171a`) — Elevated content surfaces, input wells
- **Overlay** (`#000000`) — Modal scrims, pressed states, maximum contrast surfaces

## Imagery

Imagery is album-art-forward: square cover-art tiles with 20–24px corner radius, floating slightly tilted or straight, always carrying a centered circular play overlay. Photography is absent — there is no lifestyle imagery, no people, no environments. The hero's atmospheric color is a painted gradient (amber → burgundy → near-black), not a photograph. Icons are minimal and stroke-only, rendered in Warm Cream at 1.5px weight, often inside 1px circular borders. The overall density is image-spare, text-dominant: every screen should feel like a record label's minimal site, not a stock-photo SaaS page.

## Layout

Centered, single-column hero with a max-width ~1200px container. The hero pattern is a full-bleed dusk gradient with a vertically centered stack: wordmark nav at top, oversized Editorial New headline (~72–140px) at the vertical center, a single prompt input well below it, and a press-logo trust row at the bottom. Floating album-art tiles break the symmetry on the left and right edges, creating an off-center composition that feels curated rather than templated. Below the hero, the product shifts to max-width 1200px centered stacks with 64px section gaps, 2-column or 3-column card grids for track lists, and alternating left/right text+visual blocks. Navigation is a single transparent top bar with no center links — the prompt input itself is the primary navigation. Density is compact: 4px base unit, 8px element gaps, tight 14–16px line-heights.

## Similar Brands

- **Spotify (web player dark mode)** — Same near-black canvas with warm-white typography and minimal chromatic accents; the matte, low-elevation surface treatment and compact 14px UI rows are directly comparable
- **Linear** — Identical philosophy of dark monochrome canvas with one vivid accent color reserved for the primary action, compact Neue-Haas-style grotesk at every size, and near-absence of shadows
- **Arc browser marketing site** — Same single-gradient hero treatment (warm-to-dark atmospheric wash), editorial serif headline breaking a grotesk body face, and centered prompt-as-interface composition
- **Endel** — Adjacent audio-creation product that uses the same dusk-gradient hero language and cream-on-near-black typography to signal an after-hours creative tool
- **Nothing (tech brand)** — Shares the dot-matrix typographic attitude and the warm-off-white-on-deep-black contrast pairing, with one signature accent color doing all the chromatic work
