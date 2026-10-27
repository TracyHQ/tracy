# Zendesk — Style Reference
> Lime signal in a forest clearing — precision SaaS dressed in warm organic ink, where the single electric-green accent cuts through like a backlit leaf.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Zendesk's homepage projects warmth and authority through an unusual pairing: near-black almost-green ink (#11110d) on warm off-white (#f5f5f2), punctuated by a single electric lime (#d1f470) that reads as both verdant and technological. The dark forest-green event banner (#203524) at the top immediately signals brand confidence — deep, earthy, not the expected corporate blue. Body text lives in near-black #11110d rather than pure black, giving the page a slightly warm, organic undertone that softens what could otherwise feel austere. The signature move is the lime CTA: vivid enough to stop the eye, yet grounded enough to feel like a product choice rather than a marketing trick. Card surfaces use #f5f5f2 — a shade away from white — so card lifts happen through warm contrast rather than shadows.

## Colors

| Name | Value | Role |
|------|-------|------|
| Electric Lime | `#d1f470` | Primary CTA buttons, active indicators, accent highlights — the only saturated color on the page, so it carries 100% of the interactive signaling weight |
| Forest Canopy | `#203524` | Event/announcement banner backgrounds — deep forest green that creates visual separation from page content without using darkness alone |
| Deep Grove | `#2d4c33` | Secondary dark-green surfaces, card backgrounds in dark sections |
| Lime Fade | `linear-gradient(to right, rgba(0, 0, 0, 0), rgb(209, 244, 112))` | Decorative fade effects, scroll-indicator overlays in lime-to-transparent direction |
| Near-Black Ink | `#11110d` | Primary text, nav labels, body copy, button labels — warm near-black with green undertone instead of pure black |
| Warm White | `#f5f5f2` | Page backgrounds, card surfaces, section fills — one step off pure white, giving the page an organic warmth |
| Pure White | `#ffffff` | Hero section background, button text on dark surfaces, icon fills on dark backgrounds |
| Midnight | `#000000` | Icon fills, SVG strokes, high-contrast borders in dark contexts |
| Stone Divider | `#90918c` | Subtle borders and divider lines between sections |

## Typography

### Vanilla Sans — Single typeface for the entire system — custom humanist sans with slightly organic curves. Used at weight 300 for large hero headlines (anti-convention whisper-weight at 68–74px), weight 400–500 for body and subheadings, weight 600–700 for UI labels and nav items. The 0.054em letter-spacing appears as a global tracking value applied broadly, giving the UI a slightly airy, premium feel at smaller sizes.
- **Substitute:** Inter, DM Sans
- **Weights:** 300, 400, 500, 600, 700
- **Sizes:** 14px, 15px, 16px, 18px, 26px, 32px, 42px, 48px, 68px, 74px
- **Line height:** 1.00–1.68 (tight 1.00–1.05 at display sizes, 1.39–1.56 at body sizes)
- **Letter spacing:** 0.054em (applied globally across sizes)
- **OpenType features:** `normal`

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.44 | — |
| body | — | — | 16px | 1.56 | — |
| subheading | — | — | 18px | 1.4 | — |
| heading-sm | — | — | 26px | 1.3 | — |
| heading | — | — | 32px | 1.25 | — |
| heading-lg | — | — | 48px | 1.15 | — |
| display | — | — | 74px | 1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Element gap:** 8-16px

### Border Radius

- **tags:** 4px
- **cards:** 0px
- **inputs:** 12px
- **buttons:** 16px
- **iconButtons:** 100%
- **eventBannerCards:** 40px

## Components

### Primary Lime CTA Button
**Role:** Main conversion action — email signup, trial start

backgroundColor #d1f470, color #11110d, borderRadius 16px, padding 10px 20px, Vanilla Sans weight 600, font-size 16px. On dark backgrounds the color switches to #ffffff text but keeps the same #d1f470 background. Border matches background color (invisible border pattern).

### Ghost Link Button
**Role:** Secondary actions — 'Ver en línea', 'Más información'

backgroundColor transparent, color #11110d, borderTopColor rgba(17,17,13,0.11) — the near-invisible bottom border at 11% opacity creates an underline-style affordance without a full visible border. borderRadius 0px, paddingTop 12px, paddingRight 12px, paddingBottom 0px, paddingLeft 12px. No fill, no background on hover state implied.

### Circular Icon Button
**Role:** Navigation arrows in testimonial carousels

backgroundColor transparent, color #11110d, border 1px solid #11110d, borderRadius 100% (perfect circle), padding 16px all sides. Used in pairs (← →) flanking carousel content.

### Flat Content Card
**Role:** Feature and content grouping blocks

backgroundColor #f5f5f2, borderRadius 0px, boxShadow none, padding 32px 24px. Zero border radius is the signature — cards are flush-cornered rectangles, distinguished from page background by the warm off-white surface, not by elevation or shadow.

### Email Input Field
**Role:** Primary lead capture — email collection in hero

backgroundColor rgba(17,17,13,0.05) — a 5% tint of near-black over the white hero, creating a barely-there warm gray fill. borderRadius 12px, padding 12px all sides, color #11110d, border 1px solid #11110d. Placeholder text in body-sm Vanilla Sans weight 400.

### Announcement Banner
**Role:** Top-of-page event or promotional strip

Full-width bar, backgroundColor #000000 (top global bar) or #203524 (event section). Text in Vanilla Sans 14px weight 400, white (#ffffff). Contains a 'Regístrate gratis' link in #d1f470 with underline. Dismiss X icon right-aligned. Separate from main nav by visual weight contrast.

### Event Promo Card
**Role:** Zendesk Relate event block — image + text + CTA

backgroundColor #203524 (Forest Canopy), borderRadius 40px, contains logotype in white, body text at 15px weight 400 white, two stacked CTAs: a lime-fill button (16px radius) and an outlined ghost button. Right side contains a full-bleed photo of a speaker cropped into the rounded card. Padding approximately 32px 40px on text side.

### Logo Trust Bar
**Role:** Social proof — partner/customer logo strip

White or #f5f5f2 background, logos rendered in #11110d (monochrome). No borders, no cards. Overline label in 14px weight 600 Vanilla Sans, letter-spacing 0.054em, uppercase. Logos arranged in single horizontal row with 24-32px gaps.

### Testimonial Carousel Block
**Role:** Customer quote with photo and attribution

backgroundColor #f5f5f2 page background, quote in Vanilla Sans 26-32px weight 300, color #11110d. Attribution in 15px weight 500. Customer photo in a square with 16px border-radius. Arrow navigation using Circular Icon Buttons. Customer logos displayed below in a horizontal row at 50% opacity.

### Product UI Screenshot Embed
**Role:** Hero visual — showing product interface in context

White card surface, borderRadius 16px, contains a realistic representation of the Zendesk agent interface. Displayed as a floating panel over the hero section, partially overlapping the fold. Accompanied by lifestyle photography strips on left and right edges with rounded corners.

## Do's and Don'ts

### Do
- Use #d1f470 exclusively for interactive CTAs and key data highlights — its scarcity on the page is the source of its stopping power
- Apply 0px borderRadius to all content cards; elevation comes from the #f5f5f2 surface against a white background, not from shadows or rounded corners
- Use Vanilla Sans weight 300 at 48px and above — the lightweight headline at large scale is the primary typographic signature
- Set global letter-spacing to 0.054em across all Vanilla Sans usage to maintain the airy spacing that distinguishes it from default Inter or DM Sans
- Pair the lime CTA (#d1f470) button with a transparent/ghost secondary button at equal visual weight — never stack two filled buttons
- Use #11110d (near-black with warm undertone) instead of pure #000000 for all body text and UI labels
- Reserve #203524 Forest Canopy for event/announcement surfaces only — it signals 'special context', not general UI

### Don't
- Never add box-shadow to cards — the design intentionally uses surface color contrast (#f5f5f2 vs #ffffff) for elevation, not shadows
- Never use borderRadius above 16px on buttons or 40px on event cards — no full-pill (9999px) shapes appear in this system
- Never introduce secondary accent colors — #d1f470 is the sole chromatic accent; adding blue, orange, or purple breaks the one-color system
- Never use Vanilla Sans at weight 700 for headlines — heavy weight at display sizes contradicts the restraint-authority balance of this system
- Never use pure #000000 for body text on light backgrounds — #11110d is the correct near-black that preserves the warm organic undertone
- Never apply border-radius to flat content cards (the 0px radius is intentional, not an omission)
- Never place two lime-background elements adjacent to each other — the accent works through isolation

## Elevation

Zero shadows throughout. Depth is created by surface color stepping: pure white (#ffffff) hero → warm off-white (#f5f5f2) cards → Forest Canopy (#203524) event blocks. No card has a box-shadow; the visual stack reads as nested paper sheets rather than floating panels. This keeps the UI grounded and material-feeling — elevation through pigment, not light simulation.

## Surfaces

- **Page Canvas** (`#ffffff`) — Hero sections and primary page background
- **Warm Surface** (`#f5f5f2`) — Content cards, feature sections, testimonial backgrounds
- **Forest Canopy** (`#203524`) — Event promo cards, announcement banners — signals special/featured context
- **Deep Grove** (`#2d4c33`) — Secondary dark surfaces within event or feature blocks

## Imagery

Mixed photography and product UI. Photography appears as lifestyle portrait strips — real customers and agents in warm, candid moments (smiling, mid-conversation, casual workplace contexts). Images are cropped tightly and appear as vertical strips flanking the central product UI embed, or as full bleeds within the event promo card. The product UI screenshot is the true hero visual: a detailed, realistic rendering of the Zendesk agent interface shown at natural scale, white background, 16px rounded card. Lifestyle photos sit adjacent with visible rounded corners matching the card system. No illustration. Icons are minimal outlined mono-weight in #11110d. Customer/partner logos are monochrome, displayed at reduced opacity on light backgrounds. Image density is moderate — photography is purposeful punctuation around the product screenshot, not wallpaper.

## Layout

Max-width approximately 1200px centered on all sections. Hero is full-viewport white with centered headline stack (Vanilla Sans weight 300 at 68–74px), a single email input + lime CTA row below, and a product UI screenshot that bleeds downward past the fold — the screenshot extends vertically to create scroll anticipation. Beneath the hero: a full-width logo trust bar on white, then alternating content bands at #f5f5f2 and white. The Zendesk Relate event promo occupies a full-width card with 40px radius set into the #f5f5f2 band. Testimonial section uses a centered single-column layout with flanking arrow navigation. Overall rhythm: spacious — section gaps 80-120px, content never feels compressed. Navigation is a sticky top bar with two rows: a global announcement bar above, then the primary nav with logo left, items center-right, and the lime CTA button far right.

## Similar Brands

- **Intercom** — Single bold accent color on white/warm-neutral backgrounds with product UI screenshots as hero visuals
- **Notion** — Warm near-black (#11110d equivalent) text on warm off-white surfaces, no shadows, flat card approach
- **Linear** — Custom typeface with weight-300 display headlines and a restrained single-accent-on-neutral palette
- **Freshdesk** — Enterprise CX SaaS using lifestyle photography strips alongside centered product UI embed in hero
- **Webflow** — Custom sans-serif at whisper weight for large headlines, lime/electric accent as the sole chromatic signal
