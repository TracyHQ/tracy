# Fable — Style Reference
> a literary reading nook with cream paper and ink — the book is the art

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Fable reads like an editorial book club brought to life: generous cream surfaces, large warm serif headlines, and alternating full-bleed colored bands (forest green and sky blue) that frame colorful flat-illustration scenes. Typography is the loudest voice — Heldane Display at near-black weight with tight 0.86–0.94 line-heights produces a literary, slightly compressed headline look, while Inter handles every utility and body line at modest sizes with strong negative tracking. Buttons are stadium-pill shapes (60px radius) in two tones — dark on cream, white on color — and book covers themselves become the primary decorative motif, treated as editorial artwork rather than thumbnails. The overall rhythm is section-band driven: each full-bleed color block introduces a single concept with a headline, supporting copy, a single pill CTA, and an illustration or product preview on the right.

## Colors

| Name | Value | Role |
|------|-------|------|
| Fable Forest | `#064c37` | Full-bleed dark section background, first-screen hero band — deep botanical green that makes the warm cream and orange illustration pop |
| Storybook Sky | `#43a1d7` | Full-bleed mid section background — cerulean blue band that carries product-feature storytelling between cream and green sections |
| Paper Cream | `#f7f4ee` | Hairline borders, dividers, input outlines, and card edges on light surfaces. |
| Ink | `#161015` | Primary heading and display text — near-black with a violet undertone that warms the editorial serif without losing contrast |
| Charcoal Plum | `#292229` | Filled pill button background, dark card surfaces, secondary heading color |
| Graphite | `#3f383d` | Body text, paragraph copy, secondary UI text — warm dark gray that reads softer than pure black on cream |
| Char | `#070607` | Footer background, darkest surface — reserved for terminal bands and footer chrome |
| Pure White | `#ffffff` | Page background, reverse-mode button fill (on dark sections), text on dark surfaces |
| Fog | `#ededed` | Subtle image placeholders, soft dividers, muted card backgrounds when a lighter neutral than cream is needed |

## Typography

### Inter — All UI, body, button, link, and supporting text. Negative letter-spacing across the scale tightens Inter into an editorial companion to Heldane — at 16px body the tracking reads noticeably tighter than default. Weights 400 for body, 500 for labels/buttons, 600–700 reserved for emphasis.
- **Substitute:** Inter (already Google Fonts), or DM Sans
- **Weights:** 400, 500, 600, 700
- **Sizes:** 8px, 10px, 12px, 14px, 15px, 16px, 18px, 20px, 24px, 30px
- **Line height:** 1.00–1.60 (1.50 typical body, 1.25 for tight UI rows, 1.00 for inline tags)
- **Letter spacing:** -0.42px at 10px (-0.042em), -0.30px at 15px (-0.020em), -0.27px at 18px (-0.015em), -0.24px at 20px (-0.012em), -0.21px at 24px (-0.012em equivalent), tightening as size increases
- **OpenType features:** `"ss01" on, "cv11" on`

### Heldane Display — Editorial display headlines at 48–80px. Near-regular weight (400) with tight tracking and compressed line-heights creates a literary, magazine-cover feel — the headline is the hero, not a shout. The 22–26px usage at weight 500 handles mid-size editorial subtitles.
- **Substitute:** Fraunces, Lora, or Playfair Display
- **Weights:** 400, 500
- **Sizes:** 22px, 26px, 48px, 72px, 80px
- **Line height:** 0.86–1.09 (extremely tight on display: 0.86 at 80px, 0.88 at 72px, 0.94 at 48px, 1.08–1.09 at 22–26px)

### Aktiv Grotesk — Aktiv Grotesk — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.5

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.2px |
| body-sm | — | — | 14px | 1.43 | -0.25px |
| body | — | — | 16px | 1.5 | -0.32px |
| subheading | — | — | 20px | 1.33 | -0.4px |
| heading-sm | — | — | 24px | 1.42 | -0.48px |
| heading | — | — | 30px | 1.25 | -0.66px |
| heading-lg | — | — | 48px | 0.94 | 0px |
| display | — | — | 72px | 0.88 | 0px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 24px

### Border Radius

- **cards:** 12px
- **buttons:** 60px
- **largeCards:** 48px
- **smallChips:** 8px

## Components

### Filled Pill Button — Dark
**Role:** Primary CTA on cream and white sections

Stadium-pill (60px radius), background #292229, white Inter text at 16px weight 500, padding 16px 28px, no border. Subtle shadow rgba(0,0,0,0.4) 0 4px 20px. Letter-spacing follows body tracking (~-0.32px).

### Filled Pill Button — White
**Role:** Primary CTA on colored bands (forest green, sky blue)

Stadium-pill (60px radius), background #ffffff, Ink (#161015) text at 16px weight 500, padding 16px 28px, no border. Same 60px radius and shadow as dark variant — only fill and text color invert.

### Ghost Text Link
**Role:** Secondary inline actions in nav and body copy

No background, 1px underline, Inter 16px weight 500, color #161015, no padding. Used for nav items and inline editorial links.

### Display Headline Section
**Role:** Hero and feature section headline block

Two-column layout: left column holds Heldane Display headline at 48–80px weight 400, line-height 0.86–0.94, color #161015 (on light) or #ffffff (on dark bands), max-width ~520px. Right column holds a 1:1 illustration or product mockup with generous negative space. 80px vertical padding top/bottom.

### Book Cover Tile
**Role:** Primary content unit — book cover grid items

No card chrome — book covers sit directly on the section background (cream or dark green). Slight 2–4px bottom shadow rgba(0,0,0,0.2) to lift covers off the page. 8–12px gap between covers. Arranged in a horizontally-scrolling row or 6-column grid.

### Cream Card
**Role:** General content card on white or colored backgrounds

Background #f7f4ee, radius 12px, padding 24px, no border. Optional lift shadow rgba(0,0,0,0.6) 0 4px 20px for elevated cards. Internal spacing: 16px between heading and body, 24px between card sections.

### Elevated Feature Card
**Role:** Phone mockup container and large feature blocks

Background #ffffff, radius 48px (large rounded card), padding 32–40px, shadow rgba(0,0,0,0.6) 0 4px 20px. Used to frame device mockups and product previews on colored section bands.

### Navigation Bar
**Role:** Top-of-page site navigation

Transparent or solid section-color background, no border, horizontal layout with logo left, center links, account/cart icons right. Nav links in Inter 14–16px weight 500. Logo is a small mark with the wordmark — minimal, no background fill.

### Section Band
**Role:** Full-bleed colored content section

Edge-to-edge background color (forest green, sky blue, or cream), internal max-width 1200px centered, vertical padding 80–120px. Contains a Display Headline Section or book grid. No visible borders between bands — the color change is the divider.

### Book Cover Grid Row
**Role:** Horizontal strip of book covers

Single row of 6–8 book covers, 12px gaps, no card frames, slight scale-on-hover. Sits inside a cream or dark-green Section Band. Overhangs the max-width slightly to imply the row scrolls or continues.

### Illustration Scene
**Role:** Brand artwork in hero and feature sections

Flat, dimensional illustration of a person with bold solid color blocks (orange, teal, pink, white). Placed in the right column of a Display Headline Section, roughly 1:1 aspect ratio, with floating geometric accents (stars, circles) in brand colors. No stroke outlines — color blocks define the form.

### Phone Mockup Frame
**Role:** Product screenshot container on feature bands

White phone bezel with rounded corners (radius 36px), screen content visible at 9:16 aspect, floats inside an Elevated Feature Card. Subtle drop shadow lifts it above the blue section background.

## Do's and Don'ts

### Do
- Use Heldane Display at weight 400 (never 500+) for all headlines 48px and above — the near-regular weight is the editorial signature
- Use the stadium-pill 60px radius for every button — filled dark on cream, filled white on colored bands, never square or small-radius
- Alternate full-bleed section bands: Fable Forest → cream → Storybook Sky → cream, using color as the primary section divider instead of hairlines or spacing
- Set Inter body text with negative letter-spacing matching the scale (-0.32px at 16px, -0.66px at 30px) — default Inter tracking breaks the editorial feel
- Use Paper Cream (#f7f4ee) as the default card and page surface over pure white — the warm off-white is the brand's "page"
- Let book covers speak for themselves: no card frames, no overlays, no badges — just the cover on a clean surface with 8–12px gaps
- Tighten display headline line-height to 0.86–0.94 at sizes 48–80px so lines lock together visually like editorial print

### Don't
- Don't use square or 4–8px radius buttons — the 60px pill is non-negotiable and defines the brand voice
- Don't place headlines on pure white over 24px — pair every display headline with either a cream, forest, or sky background
- Don't use chromatic color for CTAs — buttons are always dark or white; #43a1d7 and #064c37 are backgrounds only, never fills
- Don't introduce gradients, glows, or colored shadows — the only shadow allowed is the simple 0 4px 20px black drop
- Don't use Heldane Display for body, captions, or UI labels — it is headline-only at 22px+; everything else is Inter
- Don't add card borders or hairline dividers inside Section Bands — let the color contrast do the structural work
- Don't use 100% black for body or heading text — Ink (#161015) and Charcoal Plum (#292229) keep the warm editorial tone

## Elevation

- **Filled Pill Button:** `0 4px 20px 0 rgba(0, 0, 0, 0.4)`
- **Cream Card / Elevated Feature Card:** `0 4px 20px 0 rgba(0, 0, 0, 0.6)`
- **Book Cover Tile:** `0 2px 8px 0 rgba(0, 0, 0, 0.2)`

## Surfaces

- **Page Canvas** (`#ffffff`) — Base page background between colored section bands
- **Paper Cream** (`#f7f4ee`) — Warm card surface, light section bands, signature brand surface
- **Soft Fog** (`#ededed`) — Image placeholders, muted inset surfaces
- **Storybook Sky** (`#43a1d7`) — Full-bleed mid-page blue band for feature storytelling
- **Fable Forest** (`#064c37`) — Full-bleed dark hero band — primary brand color moment
- **Char Footer** (`#070607`) — Darkest terminal surface for footer chrome

## Imagery

Illustration is the hero imagery style: flat, dimensional, color-block figures of people reading or interacting with books, painted in bold solids — burnt orange clothing, teal trousers, warm skin tones, pink and white accents. Scenes include floating geometric confetti (stars, circles, plus signs) in brand yellow/blue. The illustrations are roughly 1:1, sit in the right column of two-column sections, and are unsigned editorial-feeling. Photography is almost entirely book cover artwork, treated as editorial content — no lifestyle photography, no people photography outside the illustrations. The visual density is illustration-and-type-forward with very little photographic surface.

## Layout

Max-width 1200px centered, but section bands break to full-bleed edge-to-edge. Hero and feature sections are always two-column: left text block (max-width ~520px) with headline + sub + single pill CTA, right illustration or phone mockup. After every Display Headline Section, a full-width Book Cover Grid Row runs edge-to-edge with slight overhang, implying a horizontal scroll. Section rhythm alternates: dark green band → cream band → blue band → cream band → dark footer. Navigation is a minimal transparent top bar with logo left, two center links, and two right-side icons (account, cart). No sidebar, no mega-menu, no sticky header behavior — the sections themselves carry the eye through the page.

## Similar Brands

- **Bookshop.org** — Same editorial serif-headline + cream-surface approach with book covers as primary content units
- **The New Yorker digital** — Same tight-line-height display serif and warm off-white reading surface for literary content
- **Substack homepage** — Same full-bleed color-band section structure with left-text/right-illustration split and pill CTAs
- **Headspace** — Same flat-illustration character art with bold color-block clothing floating against solid color backgrounds
- **MagicLinks / Literati** — Same book-discovery grid pattern with covers as the dominant visual, cream and dark contrast
