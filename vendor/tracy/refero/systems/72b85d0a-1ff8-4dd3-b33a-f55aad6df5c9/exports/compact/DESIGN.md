# Busuu — Style Reference
> playful passport of global connection. Vivid gradient skies, bubble greetings, and circular flags make the whole interface feel like a warm invitation to the world.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Busuu's design system radiates warm, approachable energy through a vivid purple-to-blue gradient hero that bleeds confidence before settling into a calm, near-white workspace. The dominant interface is built on a very pale blue-tinted canvas (#f2f7fd) with white cards floating above it, and a single saturated spring-green (#11ee92) acts as the primary action accent — an unconventional choice that immediately distinguishes it from the sea of blue CTAs in edtech. Typography is custom (Nista) with a compact, bold-friendly weight stack: heavy 800 for display, 700 for headings, and a clean 400 for body, giving the system a confident, slightly geometric voice. The visual language is heavily illustrated — flat, colorful character art with circular framing devices — and the layout relies on generous padding, pill-shaped controls, and circular flag tiles to make global language learning feel tactile and inviting rather than academic.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Indigo | `#3b1e90` | Left edge of hero gradient — anchors the purple sky of the landing banner |
| Signal Blue | `#116eee` | Brand links, nav accents, heading highlights, logo wordmark — the only blue that carries brand meaning |
| Spring Mint | `#11ee92` | Green supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Hero Sky Blue | `linear-gradient(90deg, #3b1e9 0%, #5a3cc4 30%, #3a6ef0 100%)` | Right edge of hero gradient — transitions from deep indigo to a cleaner blue, softening the landing page mood |
| Charcoal | `#252b2f` | Primary body text and heading color — softer than pure black, keeps long-form copy comfortable |
| Pure Black | `#000000` | Icon strokes, decorative illustration linework, highest-contrast text — used where maximum weight is needed |
| Canvas Mist | `#f2f7fd` | Page background — barely-blue tinted near-white, the calm base layer below the hero |
| Paper White | `#ffffff` | Card surfaces, nav background, content panels — sits one level above the mist canvas |
| Steel Border | `#d6dee6` | Input borders, dividers, subtle structural lines — cool-toned to harmonize with the mist canvas |
| Slate Caption | `#666e7e` | Muted helper text, secondary body copy, metadata — readable but recedes against charcoal |
| Shadow Gray | `#b3b3b3` | Soft elevation wash and button shadow base — used in the subtle 1px shadow stack |
| Trustpilot Star | `#ffcf00` | Review star fill on the Trustpilot social-proof line — the only yellow in the system, used exclusively for ratings |

## Typography

### Nista — Sole typeface for the entire system — Nista's geometric warmth and bold-friendly weight stack carries everything from 10px metadata to 40px display headlines. The 800 weight on hero text gives authority without feeling heavy or corporate; the 400 body keeps long lesson descriptions breathable. Substitute: 'Poppins' or 'Nunito' for the friendly geometric quality, or 'DM Sans' for a cleaner alternative.
- **Substitute:** Poppins
- **Weights:** 400, 700, 800
- **Sizes:** 10, 12, 14, 16, 18, 24, 36, 40
- **Line height:** 1.14, 1.20, 1.30, 1.33, 1.50, 1.70
- **Letter spacing:** normal across all sizes — Nista's natural metrics are tight enough that no tracking adjustment is needed

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.2 | — |
| body | — | — | 14px | 1.5 | — |
| body-lg | — | — | 16px | 1.5 | — |
| subheading | — | — | 18px | 1.5 | — |
| heading-sm | — | — | 24px | 1.3 | — |
| heading | — | — | 36px | 1.14 | — |
| display | — | — | 40px | 1.14 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 20px
- **Element gap:** 10-20px

### Border Radius

- **cards:** 16px
- **inputs:** 5px
- **buttons:** 45px
- **circles:** 9999px

## Components

### Hero Gradient Banner
**Role:** Full-bleed landing section

Deep indigo to sky blue linear gradient (90deg, #3b1e9 → #5a3cc4 → #3a6ef0), full viewport width, contains white headline at 40px/1.14 weight 800, body text at 16px in white, and illustrated character art with speech bubbles floating on a faint world map outline. No card chrome — the gradient IS the surface.

### Primary CTA Button (Spring Mint)
**Role:** Main conversion action

Filled pill button: background #11ee92, text #252b2f weight 700, 14-16px, padding 20px horizontal by ~12px vertical, border-radius 45px. On the gradient hero it pops vividly; on white sections it reads as energetic. This is the ONLY chromatic filled action in the system.

### Outlined Nav Button (Learn for free)
**Role:** Secondary nav action with brand border

Transparent fill, 1.5-2px solid #116eee border, #116eee text, 45px pill radius, padding ~20px horizontal. Mirrors the mint CTA in shape but uses the brand blue to signal a lighter-weight entry point.

### Ghost Nav Button (Log in)
**Role:** Tertiary text-level action

No fill, no border, #252b2f text, pill radius 45px, padding ~20px horizontal. Sits inline with the outlined button, creating a filled → outlined → ghost hierarchy.

### Top Navigation Bar
**Role:** Site-wide header

White (#ffffff) background, logo lockup left ('Busuu' in #116eee + 'A Chegg service' tag), nav links and action buttons right-aligned. Horizontal padding ~20px, subtle 1px shadow or no shadow. Fixed/sticky on scroll.

### Language Flag Tile
**Role:** Language selection card in carousel

Circular container (border-radius 9999px), white background, contains a circular flag image (also full radius). Language name below in 14px #252b2f. Shadow: rgba(0,0,0,0.1) 0px 1px 2px 0px. Tiles arranged in a horizontal scrollable row with chevron controls on the edges.

### Trustpilot Rating Strip
**Role:** Social proof under primary CTA

Inline horizontal layout: 'Excellent' wordmark in 12px #252b2f, five green stars (#00b67a Trustpilot green or system green) in a row, review count in 12px #666e7, small Trustpilot logo at the end. Sits directly below the hero CTA.

### Carousel Navigation Arrows
**Role:** Scroll controls for language row

Circular ghost buttons flanking the language tile row. Light gray (#d6dee6) chevron icon, no fill, 40px diameter. Purely directional, minimal visual weight.

### Section Heading
**Role:** Section title text

'I want to learn' at 24-36px, weight 700, color #252b2f, centered above content rows. Uses the heading-sm to heading range from the type scale.

### Display Hero Headline
**Role:** Landing page hero title

40px Nista weight 800, line-height 1.14, color white on the gradient hero, left-aligned within the content column. Bold and confident without being corporate.

### Hero Body Copy
**Role:** Supporting paragraph under hero headline

16px Nista weight 400, line-height 1.5, white at ~90% opacity, max-width ~480px. Sits between headline and CTA with a 20px gap.

### Language Selector Dropdown
**Role:** Footer-level locale picker

Standard native select element, 5px border-radius, 1px #d6dee6 border, #252b2f text, 14px. Label 'Display Language:' above in bold #252b2f 14px. Sits on the canvas mist background in the footer area.

### Footer Band
**Role:** Page footer with locale controls

Light mist background (#f2f7fd), generous vertical padding (~40-60px), contains the language selector and links. No heavy borders or dividers — flows naturally from the canvas.

## Do's and Don'ts

### Do
- Use the mint pill button (#11ee92 fill, 45px radius) as the single primary action on every screen — never introduce a second chromatic action color.
- Anchor every full-bleed hero or banner with the indigo-to-sky-blue linear gradient (90deg, #3b1e9 → #5a3cc4 → #3a6ef0) when an energetic landing moment is needed.
- Set page backgrounds to #f2f7fd and float cards on #ffffff to preserve the cool, calm, blue-tinted workspace mood.
- Reach for Nista weight 800 at 36-40px for display and weight 400 at 14-16px for body — the bold/regular contrast is the system's voice.
- Frame all language or category choices in circular containers (border-radius 9999px) with a 1px shadow at rgba(0,0,0,0.1) 0px 1px 2px — circles are the system's signature shape.
- Use #116eee exclusively for brand identity moments (logo, links, nav accents) — never as a filled action background.
- Apply 20px padding to cards, 64px between sections, and 10-20px between elements to maintain the comfortable, breathable rhythm.

### Don't
- Don't use mint (#11ee92) for anything other than the primary filled CTA — it must stay rare to retain its punch.
- Don't stack multiple shadows or use heavy elevation — the system is intentionally flat with a single 1px shadow as the deepest depth cue.
- Don't introduce a second brand blue or replace #116eee — Signal Blue is the only blue that carries brand meaning.
- Don't use sharp corners on primary controls — buttons must be 45px pill, tiles must be circles, and cards must be 16px or rounder.
- Don't set body text in pure black (#000000) for long-form copy — use #252b2f charcoal for reading comfort; reserve black for icons and illustration linework.
- Don't put yellow anywhere except the Trustpilot star — #ffcf00 is reserved for the rating context only.
- Don't break the illustrated, playful tone with stock photography, corporate gradients, or dense data tables — the system is character-driven, not chart-driven.

## Elevation

- **Language flag tiles and card surfaces:** `rgba(0, 0, 0, 0.1) 0px 1px 2px 0px`

## Surfaces

- **Canvas Mist** (`#f2f7fd`) — Page background — the calm base layer for all content below the hero
- **Paper White** (`#ffffff`) — Card surfaces, language tile backgrounds, nav bar
- **Hero Gradient** (`#3b1e9`) — Full-bleed landing banner — deep indigo to sky blue gradient with illustrated character art

## Imagery

The visual language is illustration-first: flat, colorful character art with rounded forms, dark hair and simplified facial features, set against circular pastel halos. Speech bubbles containing greeting words in different scripts ('Ciao!', 'Bonjour!', 'Hello!', '你好') float around the characters, reinforcing the multilingual theme visually. A faint world map outline in lighter blue sits behind the hero illustration. No photography appears in the visible interface — every human or contextual element is drawn. Icons are minimal and geometric (chevrons, flags in circles, star ratings). The overall treatment is bright, friendly, and slightly cartoonish, with primary colors used liberally within illustrations while the surrounding UI stays neutral and calm.

## Layout

The page model is max-width contained (~1200px) on a full-bleed light mist canvas. The hero breaks the container with a full-width gradient banner containing a two-column composition: text stack left (headline, body, CTA, social proof) and illustration right. Below the hero, content sections sit on #f2f7fd with white cards and generous 64px vertical gaps. The 'I want to learn' section uses a centered heading above a horizontal scrollable row of circular language tiles with chevron controls flanking it. Section rhythm is consistent: generous breathing room, no heavy dividers, seamless flow between bands. Navigation is a simple sticky white top bar with logo left, action buttons right — no mega-menu, no sidebar. The footer is a single light band with locale controls.

## Similar Brands

- **Duolingo** — Same playful illustrated-character hero, vivid single-accent CTA (Duolingo's green vs Busuu's mint), and circular tile vocabulary for language selection
- **Babbel** — Same edtech language-learning category with a single bold display headline over a colorful hero, though Babbel leans warmer/red while Busuu is cooler/blue-purple
- **Khan Academy** — Same light-mist canvas, white card surfaces, and generous 64px section breathing room with a single trustpilot-style social proof strip under the primary CTA
- **Notion** — Same quiet, near-white workspace aesthetic with white cards floating on a very light tinted background, and the same restraint of using shadows as a single 1px hint rather than heavy elevation
- **Headspace** — Same friendly, illustration-driven hero with a bold gradient and rounded character art, paired with a calm pastel content area below
