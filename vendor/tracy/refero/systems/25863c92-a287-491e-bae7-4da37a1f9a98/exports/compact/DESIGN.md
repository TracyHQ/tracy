# Super — Style Reference
> Sunlit paper desk with one amber marker

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Super runs on a near-monochrome warm-neutral canvas that borrows the tactile grammar of a notebook — cream paper backgrounds, charcoal ink text, hairline dividers — and punctuates it with a single saturated amber that acts as the page's only chromatic accent. The result reads like a well-typeset document that has been wired to one working button: quiet, considered, and immediately legible about where to click. Typography is custom (Beausite) set tight at display sizes and confident at body sizes, giving the page editorial weight without heaviness. Components are lightweight — soft white cards sitting on cream, no decorative gradients, minimal elevation, ghost nav links, and a bold amber filled button as the sole loud element on most screens. The visual system extends Notion's own canvas palette (#f9f9f8, #37352f) and adds a sunlit warm accent to distinguish the brand from its parent tool.

## Colors

| Name | Value | Role |
|------|-------|------|
| Amber Pulse | `#ffbe3c` | Yellow supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Cream Paper | `#f9f9f8` | Page background and outer canvas. Borrowed from Notion's own workspace palette to position Super as its native publishing layer |
| White Card | `#ffffff` | Card and elevated surface that sits on Cream Paper. Provides subtle separation through brightness contrast rather than shadow |
| Ink Charcoal | `#262a2e` | Primary text, dominant foreground color, nav elements, and high-emphasis UI. The workhorse neutral of the entire system |
| Notion Charcoal | `#37352f` | Secondary text and borders within card contexts. Slightly warmer than Ink Charcoal, echoes Notion's native text color |
| Steel Body | `#66707a` | Supporting neutral for secondary UI, dividers, and muted labels. |
| Slate Mute | `#808c99` | Near-gray with a faint cool tint, used for very low-emphasis body content and subtle borders |
| Carbon | `#111111` | Heading emphasis, high-contrast dark surface for footer and dark feature sections, near-black for strong typographic moments |
| Black | `#090909` | Footer background and deepest dark surface. The maximum darkness level in the surface stack |
| Hairline | `#ebebeb` | Hairline borders, dividers, and subtle structural lines. The lightest visible neutral that still reads as a defined edge |
| Silver Divider | `#ccd1d6` | Secondary borders and dividers where more visual weight is needed than Hairline |
| Warm Taupe | `#787673` | Subtle warm-toned text for tertiary content, gives body copy a slight paper-on-desk warmth without being obviously chromatic |

## Typography

### Beausite — Custom display and body typeface used across every UI context — nav, headings, body, buttons, cards, badges. Beausite is a contemporary neo-grotesque with humanist proportions; its tight tracking at large sizes gives the hero editorial confidence, while its open counters at body sizes maintain readability. A close substitute would be Inter, Söhne, or General Sans.
- **Substitute:** Inter
- **Weights:** 300, 400, 500, 600
- **Sizes:** 12, 14, 16, 18, 20, 26, 38, 64
- **Line height:** 1.00–1.71
- **Letter spacing:** -0.039em at 64px → -0.026em at 20px and below; tracking tightens proportionally with size

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.31px |
| body-sm | — | — | 14px | 1.71 | -0.36px |
| body | — | — | 16px | 1.6 | -0.42px |
| subheading | — | — | 18px | 1.5 | -0.47px |
| heading-sm | — | — | 20px | 1.33 | -0.52px |
| heading | — | — | 26px | 1.3 | -0.75px |
| heading-lg | — | — | 38px | 1.13 | -1.18px |
| display | — | — | 64px | 1.07 | -2.5px |

## Spacing & Layout

**Base unit:** 4px

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 8px

### Border Radius

- **cards:** 8px
- **badges:** 9999px
- **subtle:** 4px
- **buttons:** 8px
- **largeSurfaces:** 16px

## Components

### Filled Amber Button
**Role:** The system's single filled action button. Used for the primary conversion: "Get started for free".

Background #ffbe3c, text in #262a2 (Ink Charcoal), padding 12px 24px, border-radius 8px, font-weight 500, 16px size. No border, no shadow. The dark text on amber gives a high-contrast, high-affordance button that feels warm rather than corporate. Appears both in the header nav and centered in the hero.

### Ghost Nav Link
**Role:** Standard navigation and inline link treatment.

No background, no border. Text in #66707a (Steel Body) at 14–16px, weight 400. On hover, shifts to #262a2 (Ink Charcoal). Undecorated by default; underlines only appear on inline text links within body copy.

### Sign In Text Link
**Role:** Secondary header action, lower prominence than the filled amber button.

Text only in #262a2 (Ink Charcoal) at 14–16px, weight 400 or 500. Sits in the header next to the filled amber button to provide a quieter account-access path.

### Logo Mark
**Role:** Brand identity anchor in the header and on the "Made with Super" badge.

Solid #ffbe3c (Amber Pulse) circle approximately 24px in diameter, paired with the lowercase wordmark "super" in #262a2 (Ink Charcoal), Beausite weight 600. The amber dot is the only color element in the entire header.

### Hero Display Headline
**Role:** Primary page headline, sets the editorial tone.

Beausite weight 300 at 64px, color #262a2 (Ink Charcoal), line-height 1.07, letter-spacing -2.5px. The weight-300 choice is the most opinionated decision in the system: display headlines whisper rather than shout, creating authority through restraint. The extremely tight tracking at 64px makes the type feel custom-typeset rather than templated.

### Hero Subtext
**Role:** Supporting paragraph under the hero headline.

Beausite weight 400 at 18px, color #66707a (Steel Body), line-height 1.5, max-width approximately 640px centered. Reads as muted helper prose, never competing with the headline.

### White Card on Cream
**Role:** Standard content card, the workhorse surface for screenshots, feature blocks, and content containers.

Background #ffffff, border 1px solid #ebebeb (Hairline), border-radius 8px, padding 24px. No drop shadow. The 1px hairline border does the work that shadow normally would — defining edges without weight.

### Dark Feature Card
**Role:** Step or feature card used inside dark sections like "How to use Notion as a website".

Background #37352f (Notion Charcoal) sitting on a #111111 (Carbon) section background. Rounded 8px. Contains simplified wireframe placeholders in #4d545c and the amber accent dot for active states. Provides a "screen within a screen" effect.

### Social Proof Logo Row
**Role:** Trust signal — company logos under "Trusted by teams at".

Logos displayed at uniform height (~24–32px) in monochrome #262a2 (Ink Charcoal), arranged in a single centered row with even spacing. No background card, no border. The logos are recolored to match the ink palette, creating visual unity across diverse brand marks.

### "Made with Super" Floating Pill
**Role:** Self-promotional badge pinned to the bottom-left of the live site demo.

White pill (#ffffff) with 9999px border-radius, padding 6px 12px, containing the amber logo dot + "Made with Super" text in #262a2 (Ink Charcoal) at 12–14px. Functions as a subtle watermark without interrupting the content above it.

### Section Divider
**Role:** Horizontal break between content bands.

1px line in #ebebeb (Hairline) or #ccd1d6 (Silver Divider), full-width or constrained to content width. No other ornamentation — the system trusts whitespace and the cream-to-white surface shift to create section breaks.

### Nav Header
**Role:** Top-level site navigation.

Background #ffffff (or transparent over cream), height approximately 64px, padding 0 24px. Logo left, nav links center, "Sign in" + filled amber button right. Bottom border 1px #ebebeb on scroll, or borderless at page top. Sticky behavior expected.

### Comparison Split
**Role:** Before/after visual showing Notion source vs Super output.

Two side-by-side cards labeled "From Notion Site" and "To Custom Super Site" in caption text, each containing a device/screenshot mockup. The right-side card includes a small filled amber button to emphasize the output is a functional, styled website.

## Do's and Don'ts

### Do
- Use #f9f9f8 (Cream Paper) as the page background for every light-themed screen; reserve #ffffff (White Card) for elevated surfaces that need to read as on top of the canvas.
- Set display headlines at 64px with weight 300 and letter-spacing -2.5px — the whisper-weight display is a signature choice; do not bump it to 500+ to 'add authority'.
- Use the filled amber button (#ffbe3c background, #262a2 text, 8px radius) as the system's sole filled action control. Do not introduce a secondary filled button style.
- Keep the palette monochrome except for the amber accent. If a screen needs warmth, use #787673 (Warm Taupe) or #f9f9f8 (Cream Paper) — never a second chromatic hue.
- Use 1px #ebebeb (Hairline) borders for card edges and dividers. Avoid drop shadows on cards and buttons; rely on brightness contrast between cream and white instead.
- Apply tight negative letter-spacing at all sizes: -2.5px at 64px, -1.18px at 38px, -0.75px at 26px, -0.52px at 20px. Body sizes (12–16px) can use proportionally equivalent em-based tracking.
- Recolor third-party logos to #262a2 (Ink Charcoal) in social-proof rows. Consistent monochrome treatment unifies diverse brand marks under Super's visual system.

### Don't
- Do not introduce blue, green, red, or purple as accent or action colors. The amber is the only chromatic voice in the system; adding more dilutes brand identity.
- Do not use heavy drop shadows on cards or buttons. The only acceptable shadow is the soft long-offset one (rgba(0,0,0,0.05) 0px 30px 22px -11px) on large hero mockups.
- Do not set hero headlines at weight 500–700. The weight-300 display is the signature; heavier weights break the editorial restraint that defines the brand.
- Do not add outlined or ghost button variants as the primary action. When the amber filled button is available, it must be the conversion path.
- Do not use pure black (#000000) for text or backgrounds. The system's darkest text is #262a2 (Ink Charcoal) and darkest surface is #090909 — the slight warmth keeps the palette from feeling cold or generic.
- Do not use letter-spacing of 0 or positive values at display sizes. The negative tracking (-0.026em to -0.039em) is essential to the Beausite type voice.
- Do not place the amber accent on large decorative shapes or backgrounds. Reserve it for functional moments: the logo dot, the filled button, and small status indicators.

## Elevation

- **Hero device mockup:** `rgba(0, 0, 0, 0.05) 0px 30px 22px -11px`

## Surfaces

- **Cream Paper Canvas** (`#f9f9f8`) — Page background, the base layer everything sits on
- **White Card** (`#ffffff`) — Elevated card surfaces and inner content blocks
- **Amber Surface** (`#ffbe3c`) — Filled action button and brand accent surface
- **Notion Charcoal Surface** (`#37352f`) — Card and panel backgrounds within dark feature sections
- **Ink Surface** (`#262a2`) — Dark section backgrounds and high-contrast text containers
- **Carbon Surface** (`#111111`) — Footer and deepest dark surface for full-bleed dark sections

## Imagery

Imagery is sparse and functional. The page relies on device-frame mockups (browser windows, notional site previews) rather than photography or illustration. Mockups sit on Cream Paper with soft long-offset shadows, framed as if photographed on a desk. Product screenshots inside the mockups use Notion's native aesthetic — white cards, charcoal text, system fonts — to communicate the "before" state, and Super's own styled output — larger display type, amber accents, card layouts — to communicate the "after." No lifestyle photography, no abstract gradients, no stock imagery. Iconography is minimal: a small amber circle for the logo, and tiny line-style icons (link, lightning bolt) used sparingly as decorative accents. The overall visual density is text-dominant with mockups serving as proof points rather than decoration.

## Layout

The page follows a max-width 1200px centered content column on a full-bleed Cream Paper canvas. The hero is a centered single-column stack: device mockup at top, 64px display headline, constrained-width subtext, filled amber button, and microtext — all vertically stacked with generous vertical rhythm (80px section gaps). Below the hero, content shifts to a two-column comparison split, then a centered social-proof logo row on a white card or direct on cream. Dark feature sections break the pattern: full-bleed #111111 background, centered section title, then a 3-column grid of dark feature cards with 16–24px gaps. Navigation is a sticky top bar (64px) with logo left, links center, sign-in and amber button right. The layout alternates between monochrome quiet sections and one or two dark dramatic sections to create rhythm without color variation.

## Similar Brands

- **Notion** — Inherits the identical #f9f9f8 canvas and #37352f text palette, creating direct visual continuity with the parent tool
- **Framer** — Uses a near-monochrome canvas with a single bold accent color, tight custom display typography, and minimal-elevation card surfaces
- **Webflow** — Dark-section-light-section rhythm, max-width centered content, and a single vivid accent color against a mostly achromatic palette
- **Substack** — Editorial typographic confidence at the hero, cream/white surface treatment, and a single warm accent for the conversion action
- **Linear** — Compact spacing density, hairline borders instead of shadows, and a restrained palette that lets one accent color carry the entire brand
