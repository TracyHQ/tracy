# Legora — Style Reference
> Editorial law journal on warm cream

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Legora reads like an editorial legal journal printed on warm cream paper: a near-monochrome canvas of ivory and ink, whisper-weight serif headlines at 88px, and a body set in a humanist grotesk that feels more like column text than UI copy. The brand signals authority through restraint — no chromatic accents, no decorative gradients, no colored CTAs — instead relying on a single solid-black button as the only piece of high-contrast furniture on otherwise quiet pages. Surfaces are separated by the thinnest possible rules and faint tinted washes (a barely-there sage, a barely-there slate-blue) rather than shadows or elevation. Photography arrives as one cinematic, full-bleed still per page; everything else is typographic and product-screenshot driven, with product surfaces rendered in muted pastel blocks that act as visual breathing room between dense legal copy.

## Colors

| Name | Value | Role |
|------|-------|------|
| Parchment | `#fefefc` | Page canvas, card surfaces, light-section backgrounds — a warm ivory that reads as paper, not screen |
| Ink | `#000000` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Graphite | `#0a0a0a` | Body text, heading strokes, dark surface accents — near-black used wherever ink is too harsh |
| Smoke | `#6b6b6b` | Secondary body copy, subdued borders, caption-level metadata |
| Iron | `#444444` | Tertiary text and dividers between smoke and graphite |
| Verdigris Wash | `#ebf5ed` | Light neutral action fill for buttons on dark surfaces. |
| Slate Mist | `#bdd4f0` | Soft card surface tint for product preview panels and link highlights — a desaturated cool blue that lives in the background, never the foreground |
| Pewter Haze | `#98a7aa` | Muted placeholder tint on empty illustration frames and disabled control fills |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Rhymes Display — Display headlines and hero serif. The whisper-weight 300 cut at 88px is the signature move — most legal-tech sites shout in bold sans, Legora murmurs in light serif. The tight -0.02em tracking pulls letters together so the display reads as one continuous voice, not as individual glyphs.
- **Substitute:** Playfair Display (weight 400, 80px appears as a fallback in the data) or Cormorant Garamond Light
- **Weights:** 300
- **Sizes:** 24px, 32px, 88px
- **Line height:** 0.95-1.10
- **Letter spacing:** -0.02em at 88px, -0.01em at 32px and 24px
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11" on`

### Suisse Int'l — Primary body and UI text. The 450-book weight at 16px with -0.01em tracking is the workhorse — a humanist sans tuned for long-form legal copy. The 500-medium cut at 13px is reserved for input values and small emphasis labels. The negative leading (0.80) on small sizes tightens tight UI like eyebrow labels and tags.
- **Substitute:** Inter (weight 400-500) or Söhne
- **Weights:** 450, 500
- **Sizes:** 
- **Line height:** 0.80-1.30
- **Letter spacing:** -0.01em at 14-16px, +0.01em at 11px
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11" on`

### Aktiv Grotesk VF — Section subheads and longer body paragraphs where a slightly more neutral grotesk reads cleaner than Suisse Int'l's warmth
- **Substitute:** Inter or Söhne
- **Weights:** 400
- **Sizes:** 15px, 20px
- **Line height:** 1.30
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11" on`

### Suisse Intl Book — Suisse Intl Book — detected in extracted data but not described by AI
- **Weights:** 450
- **Sizes:** 11px, 13px, 14px, 16px
- **Line height:** 0.8, 1.25, 1.3
- **Letter spacing:** -0.01, 0.01
- **OpenType features:** `"blwf", "cv03", "cv04", "cv09", "cv11"`

### Playfair Display — Playfair Display — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 80px
- **Line height:** 1
- **Letter spacing:** -0.02

### Inter — Inter — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 12px
- **Line height:** 1.2

### Suisse Intl Medium — Suisse Intl Medium — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 13px
- **Line height:** 1

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 0.8 | 0.1px |
| heading-sm | — | — | 20px | 1.3 | 0px |
| heading | — | — | 32px | 1.1 | -0.32px |
| display | — | — | 88px | 0.95 | -1.76px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 10px

### Border Radius

- **tags:** 2px
- **cards:** 8px
- **inputs:** 8px
- **buttons:** 2px

## Components

### Solid Black Button
**Role:** Primary call to action

Filled #000000 background, #fefefc text, 2px corner radius, 10px vertical / 24px horizontal padding, Suisse Int'l 450 at 14px, -0.14px tracking. Used sparingly — one per viewport maximum. Hover: lifts to a faint outline or inverts to white-on-black border.

### Ghost Outline Button
**Role:** Secondary action

Transparent background, 1px #0a0a0a border, #0a0a0a text, 2px radius, 10/24 padding, same type as the solid variant. Pairs directly with the solid button when two actions are needed (e.g. 'Learn more' beside 'Book a demo').

### Editorial Headline Block
**Role:** Hero and section display copy

Rhymes Display 300 at 88px, line-height 0.95, -1.76px tracking, set in #0a0a0a on parchment. The hairline weight plus tight tracking produces a near-continuous voice — design rule is to never break a display headline across more than two lines.

### Cinematic Hero Panel
**Role:** Full-bleed opening section

Edge-to-edge dark photographic image with a centered display headline overlay in #fefefc at 88px. No gradient veil — the dark photo itself provides contrast for the white serif. Headline sits in the lower third.

### Partner Logo Bar
**Role:** Social proof strip

Single horizontal row of monochrome wordmark logos on parchment, no separators, no card chrome. Logos rendered in #0a0a0a at uniform 60-70% opacity for quiet hierarchy.

### Feature Card (Pastel Surface)
**Role:** Product capability highlight

Full-bleed tinted card using one of the accent washes (#ebf5ed, #bdd4f0, or #cbcbca) as the card surface, no border, no shadow, no internal padding — the product UI screenshot inside is allowed to bleed to the card edge. Heading sits below the card in 24-32px serif.

### Two-Column Text+Image Feature
**Role:** Body content section

Asymmetric split: ~55% image / ~45% text, max-width 1200px, gap 48-64px. Image side is either a pastel-tinted product card or a dark photographic still. Text side opens with a 13px uppercase eyebrow label in #6b6b6b, then 32px serif heading, then 16px body.

### Cookie Banner
**Role:** Persistent consent card

Fixed bottom-right card, 8px radius, white (#fefefc) fill with 1px #0a0a0a hairline border. Body copy at 13px Suisse Int'l 450, single 'Okay' action as a solid black button at 2px radius. Padding 16px internal.

### Top Navigation Bar
**Role:** Global header

Sits over the dark hero as black-filled with white wordmark and white nav links, then transitions to parchment with dark text on scroll. Center cluster of five primary nav items, right-aligned 'Book a demo' as a solid black pill.

### Input Field
**Role:** Form input

1px #0a0a0a border, 8px radius, 12px vertical / 14px horizontal padding, placeholder in #98a7aa Pewter Haze, value text in Suisse Int'l Medium 500 at 13px. Focus state swaps border to #ebf5ed Verdigris Wash for a calm, in-brand halo.

### Eyebrow Label
**Role:** Section identifier

Uppercase or small-caps tracking +0.01em at 11-13px in #6b6b6b Smoke, set tight against the heading it introduces with 8-10px gap. Mirrors the editorial 'kicker' convention from print magazines.

## Do's and Don'ts

### Do
- Use the Rhymes Display 300 cut at 88px for any page-opening or section-opening headline — the whisper weight is the brand's signature and must not be replaced with a bold sans.
- Set body copy in Suisse Int'l 450 at 14-16px with -0.01em tracking; do not substitute a neutral system font at body sizes.
- Use the solid black button (#000000 fill, #fefefc text) as the only primary action per viewport; pair it with the ghost outline variant when a second action is necessary.
- Keep the canvas at #fefefc Parchment and let the page breathe with 80px section gaps — do not introduce white #ffffff, it will read as clinical.
- Use the accent washes (#ebf5ed, #bdd4f0) as full-bleed card surfaces, not as small chips or buttons.
- Render partner and client logos as monochrome #0a0a0a at 60-70% opacity; never display them in their native brand colors.
- Reserve the full-bleed dark cinematic photo treatment for hero sections only — body content must live on parchment.

### Don't
- Do not introduce chromatic brand colors (saturated red, blue, green) — the system is deliberately near-monochrome and a single vivid color will break the editorial register.
- Do not use bold or semibold weights for display headlines; the 300 whisper weight at 88px is non-negotiable.
- Do not apply drop shadows or elevated cards; separation is achieved through hairline borders and tinted surface washes, not depth.
- Do not use a 0px or fully rounded button radius — the 2px micro-radius is a signature choice that keeps controls reading as editorial, not app-like.
- Do not use #ffffff pure white for any surface; the canvas must stay at #fefefc Parchment to preserve the warm paper feel.
- Do not stack more than one full-bleed photographic section on a single page; one cinematic moment per scroll is the rule.
- Do not use Playfair Display for anything other than a fallback — Rhymes Display is the primary display face and its 300 cut is what creates the signature voice.

## Elevation

Legora has no shadow-based elevation. Depth is communicated exclusively through three mechanisms: (1) a dark cinematic photograph breaking the parchment plane, (2) full-bleed pastel washes that color a section without raising it, and (3) 1px hairline rules in #0a0a0a that separate rather than elevate. Any attempt to add a drop shadow will instantly push the design out of its editorial register and into generic SaaS territory.

## Surfaces

- **Parchment Canvas** (`#fefefc`) — Full-page background; the default wherever no container intervenes
- **Sage Highlight** (`#ebf5ed`) — Faint highlight wash for selected or active card states
- **Slate Mist Panel** (`#bdd4f0`) — Cool product-preview panel, hero card on lighter sections

## Imagery

Imagery is used as punctuation, not as illustration. The hero is one full-bleed dark cinematic still — a single frame of a person in a quiet interior, treated without gradient overlays or vignettes. Product surfaces elsewhere are not photographs but pastel-tinted UI mockups rendered in #bdd4f0 slate-blue and #ebf5ed sage blocks, with the actual application chrome (document lists, search overlays) sitting flat on top. No lifestyle photography, no stock imagery, no decorative illustration. Icons (visible in the nav and product UI) are thin-stroke line glyphs in #0a0a0a, roughly 1.5px stroke weight, monochrome.

## Layout

The page is a single centered column at max-width 1200px, but the hero breaks containment by going full-bleed edge-to-edge. The hero is a dark photographic background with a centered display headline in the lower third and a two-button stack beneath — this is the only asymmetric moment on the page. Below the hero the rhythm becomes strictly typographic: a partner logo bar (single row, no chrome), then a centered editorial intro paragraph set narrow (around 60% of the column width), then a three-column feature grid where each card is a tall pastel-tinted block with a product UI screenshot that bleeds to the card edge, followed by a wider two-column text+image section, and ending with a full-bleed closing statement at 88px serif. Vertical spacing is consistent at 80px between sections. Navigation is a fixed top bar that overlays the dark hero as black-on-white and transitions to white-on-black text on scroll. Density is compact but never cramped — the type does the heavy lifting and whitespace is generous between blocks.

## Similar Brands

- **Linear** — Both use a near-monochrome canvas and let a single accent (Linear's purple, Legora's black) carry all primary action weight, with hairline borders and pastel-tinted feature panels
- **Harvey (legal AI)** — Same legal-tech context with editorial serif headlines and a restrained, magazine-like layout that signals premium expertise over product feature density
- **Notion** — Shared compact information density, monochrome neutrals, and the discipline of using 2px micro-radii on controls to keep the tone editorial rather than app-like
- **Stripe Press** — Same whisper-weight serif at large display sizes and a warm cream canvas with near-black ink — both treat their websites as editorial objects rather than product dashboards
