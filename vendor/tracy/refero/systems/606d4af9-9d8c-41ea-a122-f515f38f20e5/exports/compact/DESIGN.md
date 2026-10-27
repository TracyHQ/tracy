# Home — Style Reference
> Stargazer's dark observatory

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Fluidtouch operates as a digital observatory: near-black canvas (#121318) hosts monumental white type and a constellation of pale dots connected by hairline vectors, with a single hot pink (#ed1672) acting as the only chromatic signal in an otherwise monochrome universe. Display voice is Poppins 700 at scale that borders on poster-sized (110px hero), while Muli 300 whispers at body sizes — the contrast between geometric-bold and humanist-soft is the system's emotional center. Surfaces are flat and borderless; depth comes from slightly lighter panels (#191c26) and hairline #212529 rules, never from shadows. Components are generously padded and pill-shaped (100px radius), floating in generous negative space that makes every interactive element feel deliberate rather than dense.

## Colors

| Name | Value | Role |
|------|-------|------|
| Hot Magenta | `#ed1672` | Active nav links, primary CTA fills, decorative accent dots — the only chromatic voice in the system, reserved so each occurrence reads as signal |
| Midnight Ink | `#121318` | Page canvas, hero background, footer — the deep-space base layer everything floats on |
| Deep Space | `#191c26` | Elevated card surfaces, section backgrounds one step above canvas |
| Slate Edge | `#212529` | Hairline borders, image frame rules, subtle structural dividers |
| Pure White | `#ffffff` | Primary text, headline color, nav links, button text — the only color competing with the magenta accent |
| Void Black | `#000000` | Supporting palette color for small decorative accents when the core palette needs contrast. Do not promote it to the primary CTA color |

## Typography

### Poppins — Display headlines at 700 weight dominate at 110px — the geometric bold reads as monumental and confident, the kind of type that fills a dark page like a billboard. At 400 it's used for nav and small UI labels where it stays unobtrusive.
- **Substitute:** Montserrat, Inter
- **Weights:** 400, 700
- **Sizes:** 14px, 16px, 110px
- **Line height:** 1.20 (14px), 1.25 (16px), 1.00 (110px)

### Muli — Body and nav body text. Weight 300 is the signature choice — a humanist sans at near-thin weight against the Poppins 700 display creates a call-and-response rhythm: the headline shouts, the body whispers. Muli's softer curves (vs Poppins' geometric strictness) warm the dark page.
- **Substitute:** Mulish, Source Sans 3
- **Weights:** 300, 400
- **Sizes:** 18px, 22px
- **Line height:** 1.00 (18px), 1.50 (22px)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.2 | — |
| body-sm | — | — | 16px | 1.25 | — |
| subheading | — | — | 18px | 1 | — |
| body | — | — | 22px | 1.5 | — |
| display | — | — | 110px | 1 | — |

## Spacing & Layout

**Base unit:** 8px

**Density:** spacious

- **Page max-width:** 1280px
- **Section gap:** 113px
- **Card padding:** 20-32px
- **Element gap:** 15px

### Border Radius

- **tags:** 100px
- **cards:** 0px
- **inputs:** 0px
- **buttons:** 100px

## Components

### Pill CTA Button
**Role:** Primary action trigger — the only filled button in the system

100px border-radius (full pill), #ed1672 fill, white text, Poppins 400 at 16px with 15px horizontal padding and 10px vertical padding. No shadow, no border. The full pill shape on a dark canvas makes the button look like a physical capsule.

### Ghost Nav Link
**Role:** Navigation item in resting state

Transparent background, no border, Muli 300/400 at 18px, white text. Horizontal gap of 56px between items. On hover, transitions to white; active state shown in Hot Magenta (#ed1672).

### Active Nav Link
**Role:** Currently selected page indicator

Same geometry as Ghost Nav Link but text color is #ed1672. The pink is the only visual signal of which page you're on — no underline, no pill background.

### Brand Mark
**Role:** Logo lockup in header

Two-part: a square Hot Magenta (#ed1672) icon block containing a stylized 'F' cutout, followed by the white 'fluidtouch' wordmark in Poppins 700. The colored block against the dark header is the only saturated color in the masthead.

### Hero Display Headline
**Role:** Page-level headline on hero sections

Poppins 700 at 110px, line-height 1.00, white (#ffffff). Allowed to break across two lines naturally. Often punctuated with a single Hot Magenta (#ed1672) period at the end as a decorative accent dot.

### Hero Subtext
**Role:** Supporting line beneath the display headline

Muli 300 at 18px, white text, centered below the headline with generous vertical gap (113px+ from heading). The thin weight against the 110px Poppins bold creates the system's signature typographic contrast.

### Body Text Block
**Role:** Standard paragraph content

Muli 300 at 22px, line-height 1.50, white text. 113px horizontal margin on both sides keeps the measure short and breathable. No first-line indent.

### Constellation Background Pattern
**Role:** Decorative atmosphere layer on hero

Subtle network of small white dots (~2-3px) connected by hairline lines, scattered across the dark canvas at low opacity. Creates a 'digital cosmos' texture without competing with the headline. Density is low — only 3% colorfulness — so the pattern reads as background, not foreground.

### Full-bleed Image Section
**Role:** Lifestyle or product photography inserted between dark sections

Edge-to-edge image with no padding or margin, framed only by the dark sections above and below. No border-radius. Photography is warm, naturally lit, human-scaled — a deliberate counterpoint to the abstract digital hero.

### Hairline Section Divider
**Role:** Subtle structural rule between content blocks

1px line in #212529 spanning the full content width. No other divider treatment is used — no gradients, no shadows.

### Magenta Accent Dot
**Role:** Decorative punctuation — typically the period after a headline

Solid #ed1672 circle, roughly 1em diameter, set inline at the end of a headline. Serves as the final chromatic note of the page's opening statement.

## Do's and Don'ts

### Do
- Use #ed1672 only for the active nav link, the filled CTA, and the decorative accent dot — limit to 2-3 instances per screen
- Set hero headlines at exactly 110px in Poppins 700 with line-height 1.00 to maintain the billboard impact
- Pair Muli 300 body text with the Poppins 700 display — never substitute another humanist sans for Muli, the weight contrast is the system
- Use 100px border-radius on every button and tag — the full pill shape is non-negotiable for brand recognition
- Maintain 113px horizontal margins on centered text blocks to preserve the floating-in-space feel
- Let the constellation pattern stay at 3% colorfulness — never boost opacity, it must read as background atmosphere
- Use full-bleed photography only between dark sections, never on the same plane as text

### Don't
- Don't introduce a second accent color — the entire brand voice is one magenta against monochrome
- Don't apply drop shadows to any element; depth comes from surface lightness steps only
- Don't use Poppins 400 for headlines or Muli 400 for display — weight roles are fixed
- Don't reduce the 110px hero size for 'mobile friendliness' without a deliberate type-scale override
- Don't add border-radius to cards, images, or inputs — only buttons and tags get the 100px pill
- Don't use #ed1672 for body text or small labels — it fails contrast (4.4:1) and the pink must remain large or decorative
- Don't stack multiple saturated elements on one screen — the dark canvas is the brand, keep it 97% achromatic

## Elevation

The system is deliberately shadowless. Depth is communicated through surface lightness steps (#121318 → #191c26) and 1px Slate Edge hairline borders, never drop shadows. This flatness reinforces the observatory metaphor — objects sit on the dark plane like celestial bodies, not stacked cards.

## Surfaces

- **Void Black** (`#000000`) — Deepest full-bleed sections (video backgrounds, hard CTA stops)
- **Midnight Ink** (`#121318`) — Primary page canvas for hero, body, and footer
- **Deep Space** (`#191c26`) — Elevated card panels, lighter section bands
- **Slate Edge** (`#212529`) — Border-level separation, never used as a filled surface

## Imagery

Photography is warm and human-scaled: lifestyle shots of people working on laptops in naturally lit, lived-in office spaces with brick walls and soft window light. The image treatment is full-bleed with no rounded corners or borders — photographs bleed edge-to-edge, framed only by the dark sections above and below. Decorative imagery is abstract: a low-opacity constellation of connected dots and lines scattered across the dark canvas, evoking a star map. No illustrations, no 3D renders, no product screenshots — the brand expresses itself through real human moments and the abstract cosmic pattern, never through literal product depictions.

## Layout

Full-bleed sections stacked vertically, each section occupying the full viewport width with no side gutters. The hero is a dark canvas with the constellation pattern, a centered headline stack (brand mark → massive headline → subtext) floating in generous 113px horizontal margins. Below the hero, a full-bleed warm photograph creates a tonal break — organic and human against the digital dark. Lower sections return to pure #000000 black for video or hard CTA stops. Navigation sits as a transparent bar overlaid on the hero with 56px gaps between items. Vertical rhythm is spacious: 113px between major sections, 60-80px between content blocks within a section. No sidebar, no grid cards, no multi-column content — the page is a sequence of single-focus full-width moments.

## Similar Brands

- **Linear** — Same dark-mode observatory aesthetic with near-black canvas, generous whitespace, and minimal color — though Linear uses purple, Fluidtouch uses magenta
- **Vercel** — Full-bleed dark sections, monumental white headlines, and a single high-contrast accent color punctuating an otherwise monochrome system
- **Nothing.tech** — Dark-canvas brand identity with one saturated neon accent and typographic boldness as the primary visual signal
- **Stripe** — Full-bleed section rhythm, generous spacing, and confidence in letting whitespace do the heavy lifting instead of decorative elements
