# Grove AI — Style Reference
> clinical journal in morning light — a single green word anchors a page of measured prose

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Grove AI uses a clinical-credibility language: bright white canvas, restrained forest-green accents, and a deliberate typographic contrast between an editorial serif (Libre Caslon Text) for hero-level storytelling and a precise grotesque (Geist) for body and interface. The brand voice lives in a single green word — "Grace" — set in the serif and dropped into an otherwise monochrome headline, so the AI agent reads as the personality of the product rather than a feature. Surfaces are flat with a single light-gray card layer; elevation comes from soft inset shadows and hairline borders, never from heavy drop shadows. Component weight is lightweight: pill buttons, ghost controls, thin outlined tags, and tight small-caps section labels. Overall the system feels like a well-funded medical journal that also happens to be a product page — clinical authority expressed through restraint, not decoration.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Grove | `#0b835c` | Primary brand color — used for the logo mark, the signature word in serif headlines, accent borders on tags and announcement pills, and small icon highlights. A deep, slightly desaturated green that reads as clinical and trustworthy rather than energetic |
| Pine Shadow | `#1c2b27` | Secondary dark surface — a near-black green-tinted shade for inverted buttons and dark surface moments where #000 would feel too harsh against the green accent |
| Ink Black | `#1c1c1e` | Dark borders and separators for elevated surfaces and inverted UI. Do not promote it to the primary CTA color |
| Graphite | `#303033` | Secondary text and dividers — a mid-dark gray for body copy de-emphasis, subtle borders, and metadata |
| Slate Mid | `#676768` | Muted helper text, inactive labels, and tertiary metadata — sits at a comfortable AA contrast against white |
| Mist Gray | `#eff1f6` | Card surface and the only neutral fill color in the system. Creates a single elevated tier above the white canvas without introducing a new hue |
| Pure White | `#ffffff` | Page canvas, card-internal backgrounds, and inverse text on dark fills |
| Shadow Smoke | `#bfbfbf` | Box-shadow base color for the soft elevation that sits behind cards and the floating product mockup on the right side of the hero |

## Typography

### sans-serif — sans-serif — detected in extracted data but not described by AI
- **Weights:** 400, 700
- **Sizes:** 12px
- **Line height:** 1.2

### Libre Caslon Text — Display serif used exclusively for hero-level headlines and the signature brand word. The italic-leaning contrast strokes give "Grace" and "Meet" a humanized, editorial voice that contrasts with the precise Geist below. The choice is anti-SaaS: most clinical-tech sites use a geometric sans for the hero; this serif makes the brand feel like a respected medical publication.
- **Substitute:** Source Serif 4, Lora, or PT Serif
- **Weights:** 400
- **Sizes:** 36px, 40px, 92px
- **Line height:** 1.20, 1.25
- **Letter spacing:** -0.0110em

### Geist — Primary interface and body typeface. Covers body copy (16/24px, 400), subheadings (18–20px, 500), card titles (20–24px, 600), and large stat numbers (32–40px, 500/600). The negative letter-spacing tightens as size grows, creating density at body size and breathing room at display.
- **Substitute:** Inter, IBM Plex Sans, or system-ui
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 14px, 15px, 16px, 18px, 20px, 24px, 32px, 36px, 40px
- **Line height:** 1.00, 1.07, 1.11, 1.14, 1.20, 1.25, 1.40, 1.44, 1.50, 1.65
- **Letter spacing:** -0.0360em at 40px, -0.0310em at 36px, -0.0280em at 32px, -0.0250em at 24px, -0.0200em at 20px, -0.0170em at 18px, -0.0040em at 16px, 0.1000em at 12px (uppercase labels)
- **OpenType features:** `"ss01" on, "tnum" on`

### Geist Mono — Monospaced variant for code-like or technical callouts in body content where alignment matters.
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 
- **Sizes:** 
- **Line height:** 

### Geist Medium — Geist Medium — detected in extracted data but not described by AI
- **Weights:** 500
- **Sizes:** 16px
- **Line height:** 1.88

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 1.2px |
| body-sm | — | — | 14px | 1.5 | -0.28px |
| body | — | — | 16px | 1.5 | -0.32px |
| subheading | — | — | 20px | 1.25 | -0.4px |
| heading-sm | — | — | 24px | 1.25 | -0.6px |
| heading | — | — | 32px | 1.2 | -0.9px |
| heading-lg | — | — | 40px | 1.2 | -1.44px |
| display | — | — | 92px | 1.2 | -1.01px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 10px

### Border Radius

- **tags:** 9999px
- **cards:** 20px
- **icons:** 12px
- **inputs:** 8px
- **buttons:** 9999px
- **largeCards:** 24px
- **testimonialCards:** 20px

## Components

### Top Announcement Banner
**Role:** Full-width dark green strip pinned to the very top of the page above the nav.

Background #0b835c, white text, Geist 12–14px, 4px vertical padding. Centered single line of text with a trailing arrow indicator. No border, no radius.

### Sticky Navigation Bar
**Role:** Primary site nav that persists on scroll.

White background with a subtle bottom border (1px #1c1c1 at 0.1 opacity implied). Logo on left (grove + green leaf icon), horizontal nav links centered/right in Geist 14px, "Sign In" as a ghost pill button on far right. Padding 16px vertical.

### Announcement Pill
**Role:** Highlighted category tag sitting above the hero headline.

Transparent background with a 1px #0b835c border, 9999px radius, Geist 12px uppercase with 0.1em tracking, #0b835c text, 8px 16px padding. Reads as a medical or editorial tag.

### Hero Headline
**Role:** The signature brand statement that opens the page.

Libre Caslon Text 92px, weight 400, line-height 1.2, letter-spacing -0.011em. The word "Meet" is set in #1c1c1 and the product name "Grace" is set in #0b835c — same serif, color carries the brand. No other treatment; no gradient, no decoration.

### Hero Subhead
**Role:** One-sentence positioning statement directly under the headline.

Geist 18–20px, weight 500, #1c1c1e. Tight leading (1.25), left-aligned, no wider than 520px.

### Floating Product Mockup Card
**Role:** Right-side hero asset showing the AI agent in a phone/video call UI.

Tall card with 20px radius, 1px hairline shadow (0px 0px 1px rgba(0,0,0,0.35) + 1px 2px inset), white internal surface. Chat bubbles overlay the image: green pill for greeting, white outlined pill for status, and a prominent question bubble in Geist 18px.

### Filled Dark Button
**Role:** Primary action — the strongest interactive element on the page.

Background #1c1c1, white text, Geist 14px medium, 9999px radius, 12px 24px padding. Carries a subtle inset white highlight (rgba 0.75) and 1px outer shadow. Used for "Read Case Studies" and similar high-intent actions.

### Outlined Button
**Role:** Secondary action paired with the filled button.

Transparent background, 1px border #1c1c1, #1c1c1 text, Geist 14px medium, 9999px radius, 12px 24px padding. No fill on hover in screenshots — stays as a clean ghost. "Explore Products" uses this variant.

### Stat Card
**Role:** Display block for large numerical proof points (10,000,000+ queries, etc.).

Mist Gray (#eff1f6) background, 20px radius, 24px padding. Big number in Geist 40px weight 600 #1c1c1, label below in Geist 14px #303033.

### Small-Caps Section Label
**Role:** Section-categorization labels like "FOR 12 PHASE III TRIALS".

Geist 12px, letter-spacing 0.1em, uppercase, #0b835c or #676768. Sets a clinical-trial-report tone and provides color-coded category anchors.

### Big Stat Block with Icon
**Role:** Highlighted metric (580%, 28%, 2 second) with directional icon.

Large number in Geist 40px weight 600 #1c1c1, preceded by a small icon (upward arrow or lightning bolt) in #0b835c. The green icon + small-caps green label + dark number forms the brand's proof-point formula.

### Testimonial Card
**Role:** Customer quote card in the carousel.

White background, 20px radius, generous 32px padding, thin shadow halo. Brand logo in green at top-left, quote in Geist 18–20px regular, author photo (40px circle) + name (Geist 14px medium) + role (Geist 14px #676768) at bottom-left.

### Press / Partner Logo Strip
**Role:** Horizontal row of media or advisor logos under section headings.

Grayscale logos in Geist or custom sans, #1c1c1 at reduced opacity, evenly spaced with 40–60px gaps. No background container — logos sit directly on the white canvas.

## Do's and Don'ts

### Do
- Set the hero headline in Libre Caslon Text 92px, reserving the green #0b835c for the single product name (e.g. "Grace") while the rest of the headline stays #1c1c1e.
- Use 9999px radius on all buttons, tags, and pills to keep the interaction language soft and pill-shaped throughout.
- Reserve the forest green #0b835c for three jobs only: the brand word in serif headlines, small-caps section labels, and icon/directional accents (arrows, lightning). Never use it as a solid button fill or large background surface.
- Pair a Filled Dark Button (#1c1c1 fill, white text) with an Outlined Button (transparent, #1c1c1 border) as the canonical CTA pair on any page section.
- Use Mist Gray (#eff1f6) as the only card surface color; cards are never white-on-white when they need to group content.
- Type all small-caps category labels at 12px Geist with 0.1em tracking — the wide tracking is what makes them read as clinical-trial section headers.
- Keep body copy left-aligned and capped at ~520px width to maintain the editorial reading column.

### Don't
- Do not use Geist or any sans-serif for the hero headline — the serif Libre Caslon Text is the brand's signature and must stay in the display slot.
- Do not apply drop shadows greater than 1–2px of blur; the system rejects heavy elevation in favor of hairline halos.
- Do not introduce new accent colors; the palette is monochrome plus one green, and adding blue/red/purple would dilute the clinical authority.
- Do not use #0b835c for filled buttons — the dark filled button is always #1c1c1, and green is reserved for accent and small-caps labels.
- Do not center-align body paragraphs; the system reads as an editorial layout and left-alignment is non-negotiable below the hero.
- Do not use radii between 14px and 18px — the system commits to either 8/12px (tight elements), 20/24px (cards), or 9999px (pills), with nothing in between.
- Do not pair the serif with bright or saturated colors other than #0b835c; any other chromatic color on the serif text breaks the signature.

## Elevation

- **Floating product mockup (hero image card):** `0px 0px 1px 0px rgba(0, 0, 0, 0.35), 0px 1px 2px 0px rgba(0, 0, 0, 0.25) inset`
- **Testimonial carousel cards:** `0px 0px 1px 0px rgba(0, 0, 0, 0.35), 0px 1px 2px 0px rgba(0, 0, 0, 0.25) inset`
- **Filled dark button (subtle inner highlight):** `0px 1px 1px 0px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(255, 255, 255, 0.75) inset`

## Surfaces

- **Canvas** (`#ffffff`) — Default page background — the dominant surface across all sections.
- **Card** (`#eff1f6`) — Elevated card and tile background for stat blocks, feature panels, and grouped content.
- **Inverted Dark** (`#1c2b27`) — Dark surface for the announcement banner, testimonial overlays, and filled primary buttons.
- **Brand Accent** (`#0b835c`) — Brand-color surface for the top acquisition banner and any full-bleed green moments.

## Imagery

Imagery is documentary and human-centered, not abstract. The hero is anchored by a real photograph of a clinician/researcher with a green color wash, layered with chat UI bubbles to show the AI in conversation. There are no decorative illustrations, 3D renders, or abstract graphics anywhere — the brand communicates clinical reality rather than tech spectacle. Logo strips (press mentions, partner organizations, advisor brands) are treated as grayscale wordmarks at reduced contrast, sitting directly on white without frames. Icons are line-based, minimal stroke weight, and almost always colored Forest Grove when present. The visual density is low: large white expanses, one photograph, and restrained logo rows.

## Layout

Page model is centered max-width 1200px with generous side margins. The hero is a two-column split: left column holds the announcement pill, serif headline, subhead, and supporting meta, while the right column carries a tall floating product mockup card that breaks the container and extends slightly beyond. Below the hero, the page stacks single-column sections: a 3-up stat row, a 2-up results block with big numbers, a centered testimonial carousel, a CTA pair centered, and a partner logo strip. Section gaps are large (80px+) to maintain editorial breathing room. Navigation is a single sticky white bar at the top with horizontal links and a ghost pill "Sign In" on the right. The overall rhythm is white-on-white bands with one Mist Gray section per page; there is no alternating dark/light pattern.

## Similar Brands

- **Hippocratic AI** — Same clinical-AI positioning, identical forest-green accent on a white canvas, and the same pattern of green-serif signature words in otherwise monochrome headlines.
- **Abridge** — Healthcare AI with a light-mode interface, one restrained accent color, serif-meets-sans typographic contrast, and proof-point stat sections that echo Grove's formula.
- **DeepScribe** — Clinical documentation AI with flat white surfaces, pill-shaped CTAs, and a single accent color used sparingly for labels and icons rather than fills.
- **Verily (Alphabet)** — Life-sciences brand using editorial serif headlines on a white canvas with a single signature accent, medical-journal layout rhythm, and minimal drop-shadow elevation.
