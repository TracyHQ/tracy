# Supahub — Style Reference
> Soft daylight on a violet ridge. A mostly white, airy canvas lit by a single bright violet sun, with decorative gradient orbs spilling color into negative space and generous rounded geometry giving every surface a friendly, tactile weight.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Supahub is a sunlit feedback platform rendered in soft white space punctuated by violet confidence. The system favors a quiet, mostly achromatic canvas where a single vivid violet (#862fe7) carries all primary action weight, then lets decorative lavender, pink, and amber gradient orbs burst through hero and feature sections to dramatize product surfaces. Typography is a Bricolage Grotesque / Inter pairing: the geometric variable display face does the emotional heavy lifting at 48–56px with tight -0.025em tracking, while Inter handles dense UI, captions, and supporting copy in compact 14–16px weights. Components sit on a generous spacing rhythm with two dominant radii — 12px for buttons and small surfaces, and 9999px (pill) for avatars, tags, and decorative badges — producing a friendly, rounded, approachable product surface rather than an enterprise grid. The overall feeling is a modern SaaS product page that borrows energy from the consumer-app playbook: floating product mockups, gradient atmospheres, and testimonial walls treated as content wallpaper, never as filler.

## Colors

| Name | Value | Role |
|------|-------|------|
| Voltage Violet | `#862fe7` | Primary filled action buttons, active nav state, key accent text — the single saturated brand anchor against the white canvas |
| Ultra Violet | `#5f259e` | Deeper violet for gradient stop, hover state, or emphasis text where Voltage Violet feels too bright |
| Lavender Mist | `#ad6df4` | Soft decorative violet for card backgrounds, icon tints, and gradient mid-stops |
| Orchid Wash | `#bd8ff0` | Lightest decorative violet wash for large surface fills behind product cards and feature bands |
| Magenta Spark | `#ff5fe4` | Pink wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Hot Pink Ray | `#e22ba4` | Saturated pink gradient stop paired with violet in atmospheric gradient orbs |
| Amber Pulse | `#dc5f05` | Warm orange accent in gradient orbs providing chromatic counterpoint to the violet/pink palette |
| Midnight Ink | `#111827` | Primary heading and body text, primary border, and filled dark action background (the dark CTA variant) |
| Graphite | `#3f4654` | Secondary text, nav borders, muted UI text on white surfaces |
| Slate | `#6b7589` | Tertiary text, icon fills, helper copy, and supporting metadata |
| Pure White | `#ffffff` | Primary card and surface background, button text on filled violet actions, inverted text |
| Fog | `#f1f5f9` | Alternate section background, subtle surface lift above white |
| Mist | `#d8e0ea` | Hairline borders, input borders, button focus rings, subtle dividers |
| Mint Wash | `#d6fcf4` | Soft mint tint for highlighted feature panels and tag/badge backgrounds — appears as a chromatic counterpoint to violet |
| Lavender Field | `#ebdafd` | Violet wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |

## Typography

### Bricolage Grotesque — Display and heading face. Variable custom sans with subtle character (slightly condensed, soft terminals) used for hero headlines at 48–56px, section headlines at 32px, and emphasized subheadings. The tight -0.025em tracking at large sizes is signature — it pulls the wide geometric forms into a dense, confident block. Weights stay conservative: 400 for body-class copy in display contexts, 600 only when emphasis is needed.
- **Substitute:** Space Grotesk
- **Weights:** 400, 600
- **Sizes:** 16px, 20px, 22px, 24px, 32px, 48px, 56px
- **Line height:** 1.20 – 1.75
- **Letter spacing:** -0.025em

### Inter — Workhorse UI and body face. Used for nav, buttons, body copy, captions, and all dense interface text. Letter-spacing opens to +0.1em at 12px for uppercase labels (eyebrows like 'TESTIMONIAL', 'CUSTOMER FEEDBACK'). Carries the readability weight of the system; Bricolage never appears below 20px.
- **Substitute:** Inter (native)
- **Weights:** 400, 500, 600, 700
- **Sizes:** 12px, 14px, 16px, 18px, 20px
- **Line height:** 1.33 – 1.80
- **Letter spacing:** 0.1000em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 1.2px |
| body-sm | — | — | 14px | 1.6 | — |
| body | — | — | 16px | 1.75 | — |
| subheading | — | — | 20px | 1.5 | — |
| heading-sm | — | — | 24px | 1.3 | -0.6px |
| heading | — | — | 32px | 1.2 | -0.8px |
| display | — | — | 56px | 1 | -1.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **nav:** 8px
- **cards:** 24px
- **pills:** 9999px
- **images:** 16px
- **buttons:** 12px
- **featured-card:** 40px

## Components

### Primary Filled Button
**Role:** Main conversion action (Sign up, Get started)

Filled #862fe7 background, white text, 12px radius, 16px vertical / 24px horizontal padding, Inter 16px weight 600. Optional icon (sparkle/arrow) in white at 16px sits to the left of the label with 8px gap. Subtle inset ring rgba(11,61,121,0.16) 0 0 0 1px provides edge definition on bright displays.

### Dark Filled Button
**Role:** Secondary conversion action in lighter sections (Explore feedback boards)

Filled #111827 background, white text, 12px radius, 16px / 24px padding, Inter 16px weight 600. Right arrow icon at 16px in white. Used as the dark counterpart to the violet primary.

### Ghost / Outlined Button
**Role:** Secondary action (See Supahub Demo)

Transparent background, #111827 border 1px, #111827 text, 12px radius, 16px / 24px padding, Inter 16px weight 500. Hovers to faint #f1f5f9 fill.

### Nav Link
**Role:** Top navigation items (Features, Demo, Pricing, Changelog, Blog)

Inter 15–16px weight 500, #111827 text, no underline, 8px horizontal padding. Active or hover state shifts to #862fe7. Logo sits left: violet sparkle icon + 'Supahub' wordmark in Inter 600.

### Primary Nav CTA Button
**Role:** Header Sign up for free

Filled #862fe7, white text, 12px radius, 10px / 20px padding (compact for header), Inter 15px weight 600.

### Testimonial Card
**Role:** Wall of Love masonry cards and 3-up feature testimonials

White background, 1px #d8e0ea or #e5e7eb border, 16–24px radius, 24px padding, subtle lift via minimal shadow or no shadow. Avatar 9999px (circle) at 48px, name in Inter 16px weight 600, handle in #6b7589 Inter 14px, quote in Inter 15–16px weight 400 #111827. Quote uses a ✕ close icon at 16px in #d8e0ea top-right.

### Product Preview Card
**Role:** Floating UI mockups (Feedback Portal, Changelog, Roadmap windows)

White surface, 16px radius, deep soft shadow, macOS-style traffic-light dots top-left (red/yellow/green at 10px circles with 4px gap), lavender gradient orbs behind. Internal content uses Inter 12–16px, section headers uppercase tracked +0.1em. The 'card' is both a product screenshot and a design element.

### Feature Section Panel
**Role:** Tinted background bands (Public Feedback Portal / Your feedback hub, your way)

#ebdafd lavender background, no border, full-width band. Headline in Bricolage Grotesque 48px weight 600 #111827, eyebrow in Inter 12px weight 700 tracked +0.1em uppercase #111827. Dark filled CTA button right-aligned in supporting text column.

### Avatar Stack
**Role:** Social proof under hero CTAs

Four 40px circular avatars (9999px radius) in overlapping row with -12px margin, 2px white border ring. Next text 'loved by 300+ customers' Inter 14px weight 500 #111827, preceded by five gold star icons.

### Star Rating Row
**Role:** Testimonial and social proof rating display

Five solid gold/amber #f59e0b stars at 14px in horizontal row with 2px gap, followed by Inter 14px weight 500 supporting text in #6b7589.

### Section Eyebrow Label
**Role:** Pre-headline category tag (CUSTOMER FEEDBACK & FEATURE REQUEST TOOL, TESTIMONIAL, PUBLIC FEEDBACK PORTAL)

Inter 12px weight 700, letter-spacing +0.1em, uppercase, #862fe7 (for violet accents) or #111827. Centered or left-aligned depending on section, sits 16px above the headline.

### Gradient Orb Backdrop
**Role:** Decorative atmospheric glow behind hero and feature cards

Large soft radial or linear gradient: violet (#862fe7 at 0.2–0.4 opacity), pink (#e22ba4 or #ff5fe4 at 0.3 opacity), or amber (#dc5f05 at 0.4 opacity) bleeding from white to transparent. Positioned behind product mockup cards, creates the 'sunlit' feel without using literal color fills on cards.

### Impact Score Badge
**Role:** Numerical badge inside feedback table rows

Small pill: #1f2534 background, white text, Inter 12px weight 700, 9999px radius, 2px / 8px padding. Displays numbers like 129, 96, 58, 750.

## Do's and Don'ts

### Do
- Use Bricolage Grotesque exclusively for display and headings; switch to Inter at 20px and below — never mix the two faces at the same size
- Set the primary CTA to #862fe7 fill on white backgrounds and #111827 fill on lavender (#ebdafd) sections, never the reverse
- Round buttons at 12px and use 9999px (pill) exclusively for avatars, star ratings, and tag chips — these two radii are the system's signature
- Apply -0.025em letter-spacing to Bricolage Grotesque at 32px and above; the tightened tracking is what makes the display face feel custom
- Anchor every section with an uppercase eyebrow in Inter 12px weight 700 with +0.1em tracking, set 16px above the headline
- Place decorative gradient orbs (violet, pink, amber at 0.2–0.4 opacity) behind floating product mockup cards — never behind text or directly behind CTAs
- Use the 80px section gap as the default vertical rhythm between bands; tighten to 48px only between a section header and its first content block

### Don't
- Don't introduce new sans-serif families — Bricolage Grotesque and Inter are the only two faces permitted
- Don't use #862fe7 on lavender (#ebdafd) backgrounds where it loses contrast — switch to #111827 for actions on tinted sections
- Don't use sharp 4px or 0px radii on primary surfaces; the system is defined by its 12px buttons and pill avatars
- Don't apply Bricolage Grotesque below 20px — its character collapses at small sizes and Inter handles dense UI better
- Don't stack more than three gradient orbs in a single composition; the atmosphere stays airy, never psychedelic
- Don't use the decorative pinks (#ff5fe4, #e22ba4) or amber (#dc5f05) for text, borders, or interactive states — they live only inside gradient orbs and testimonial card highlights
- Don't add heavy drop shadows; the system uses a single inset ring and minimal product-mockup depth — surface differentiation comes from color and border, not elevation

## Elevation

The system deliberately avoids drop shadows for surface differentiation. Depth is created through three devices: the inset 1px ring on filled buttons (rgba(11,61,121,0.16) 0 0 0 1px inset), a single soft shadow on floating product preview cards, and color/border contrast between white, fog, and lavender surfaces. Cards do not lift via shadow — they sit on a different surface tone.

## Surfaces

- **Pure White Canvas** (`#ffffff`) — Primary page background and product card surfaces
- **Fog Alt** (`#f1f5f9`) — Alternate section background for visual banding
- **Lavender Field** (`#ebdafd`) — Full-width feature section background behind secondary CTAs
- **Mint Highlight** (`#d6fcf4`) — Accent surface for highlighted callouts, tags, and chromatic feature panels

## Imagery

Imagery is product-led and decorative. The dominant visual device is the floating product preview card: a white UI mockup (Feedback Portal, Changelog, Roadmap) rendered with macOS traffic-light dots, set against a soft gradient orb backdrop in violet, pink, or amber at 0.2–0.4 opacity. No lifestyle photography appears — instead, the system uses real user avatars (circular, 9999px) and 5-star ratings as social proof wallpaper, and a 'Wall of Love' masonry of tweet-style testimonial cards. Illustration is absent; all warmth comes from gradient atmosphere, rounded geometry, and the Bricolage Grotesque display voice. Icons are minimal: sparkle for the logo, arrow for CTAs, ✕ for testimonial dismissal, star for ratings, and small platform glyphs (Slack, Gmail) inside product cards.

## Layout

The page is a max-width 1200px centered composition with a full-bleed white canvas. The hero is a centered text stack over white — eyebrow, Bricolage Grotesque display headline at 48–56px, supporting paragraph, and a horizontal button row of one filled + one ghost CTA, followed by an avatar stack and star rating. Below the hero, a product preview area shows three overlapping UI cards floating over violet/pink/amber gradient orbs. Section rhythm alternates: white → lavender (#ebdafd) → white, with each band using the 80px vertical gap. Feature sections use a 2-column split (left text, right product mockup) or 3-column testimonial row. The 'Wall of Love' is a masonry-style 4-column grid of testimonial cards on white. Navigation is a single sticky top bar with logo left, links center, and a compact filled violet CTA right. Sections flow seamlessly without dividers — color and whitespace do the separation work.

## Similar Brands

- **Canny** — Same feedback/roadmap product category and identical purple-and-white product page treatment, with a custom geometric display face over Inter for body and floating product preview cards over gradient orbs
- **Nolt** — Closely related feedback-board product with a soft white canvas, violet accent system, and rounded card geometry for testimonials and feature panels
- **Featurebase** — Direct competitor in the same space sharing the soft-light-on-violet palette, pill-shaped avatars in social proof, and the lavender feature-section band pattern
- **Linear** — Same restrained light theme, generous whitespace, custom-feeling display face, and use of floating product UI cards as hero illustration
- **Framer** — Similar airy light product page with gradient atmosphere behind mockup surfaces, Bricolage Grotesque-style custom display typography, and pill-radius avatars in social proof
