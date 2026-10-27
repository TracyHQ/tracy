# Bear Markdown Notes — Style Reference
> Quiet notebook on white linen

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Bear's marketing site is a hushed, paper-white canvas where a single warm red acts as the only voice that matters. Almost everything is achromatic — graphite text on cool off-white, with hairline borders, no filled buttons, and decoration appearing as faint pencil sketches (laurels, stars, a sketched bear mascot) rather than as polished illustrations. Headlines use a custom display face at weight 400 only, which strips the usual marketing-shout cadence and makes the wordmark feel handwritten rather than sold. The product itself — Bear's actual app window — is the dominant visual asset, rendered at near-1:1 scale so visitors study the real interface, not a marketing render. Pricing is a flat two-column compare with a small red PRO pill as the only chromatic punctuation.

## Colors

| Name | Value | Role |
|------|-------|------|
| Bear Red | `#dd4c4f` | Logo mark, link color, Pro badge fill, decorative underline on hero copy — the single chromatic voice in an otherwise achromatic system |
| Ink Black | `#000000` | Icon fills, graphic strokes, max-contrast emphasis |
| Graphite | `#444444` | Primary body and heading text, nav links — the dominant typographic color across the entire page |
| Ash Gray | `#888888` | Muted body text, secondary labels, icon strokes |
| Stone Border | `#d5d6d9` | Hairline borders on inputs, dividers, card edges |
| Fog | `#e6e7eb` | Subtle fills, decorative stroke elements, pricing card backgrounds |
| Mist | `#f3f5f7` | Page sections, soft surface lifts, alternating band backgrounds |
| Linen White | `#ffffff` | Page canvas, card surfaces, input backgrounds, nav background |
| Marker Lime | `#d3ffa4` | Highlight wash behind emphasized words (like a real highlighter stroke on text) |
| Tag Indigo | `#456aa3` | Note tag color in product preview, heading accent variant |
| Tag Forest | `#2b6451` | Note tag color in product preview, heading accent variant |
| Tag Plum | `#884aa8` | Note tag color in product preview, heading accent variant |
| Warning Amber | `#fcb827` | Yellow supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Info Sky | `#44a2e5` | Blue supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |

## Typography

### bearsans — Body text, navigation, buttons, pricing lists, inputs, footnotes. Weight 700 is reserved for emphasis (feature names, Pro plan title); weight 400 carries everything else. Carries a uniform +0.031em tracking that gives the body a slightly airy, typeset feel.
- **Substitute:** Inter or Source Sans Pro
- **Weights:** 400, 700
- **Sizes:** 13px, 14px, 16px, 18px, 19px, 20px, 22px, 24px, 29px, 40px
- **Line height:** 1.13–1.89 depending on size
- **Letter spacing:** 0.031em across all sizes

### bearsansheadline — Display headlines only — the singular 400 weight is the signature: no bold marketing-shout headlines, just quiet, confident regular weight at 42–51px. Creates the 'handwritten note on good paper' mood.
- **Substitute:** Inter Tight or Manrope at weight 400
- **Weights:** 400
- **Sizes:** 16px, 30px, 42px, 51px
- **Line height:** 1.10

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 13px | 1.6 | 0.4px |
| body | — | — | 16px | 1.7 | 0.5px |
| subheading | — | — | 19px | 1.45 | 0.6px |
| heading-sm | — | — | 22px | 1.42 | 0.7px |
| heading | — | — | 29px | 1.36 | 0.9px |
| display | — | — | 51px | 1.1 | — |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1100px
- **Section gap:** 64px
- **Card padding:** 32px
- **Element gap:** 13px

### Border Radius

- **cards:** 16px
- **pills:** 40px
- **badges:** 4px
- **buttons:** 8px

## Components

### Top Navigation Bar
**Role:** Primary site navigation

Linen White background, 64px height. Left-aligned bear logo + wordmark in Graphite. Right-aligned nav links (Features, Pricing, Blog, Community, Support) at 14px bearsans 400 in Graphite, no background or border on hover. No drop shadow, no sticky behavior visible.

### Platform Tab Selector
**Role:** Switch between Mac/iPhone/iPad product views

Inline group of three text labels with small device icons (16px outline icons in Graphite). Active tab has a Bear Red underline (2px) beneath the label. Tabs sit centered under the hero headline with 16px gap between icon and text, 32px between tabs.

### App Store Download Button
**Role:** Primary download trigger on hero

Black pill-shaped badge with Apple logo and 'Download on the Mac App Store' text. Standard App Store smart-banner dimensions. Centered below platform tabs with 24px gap. No custom button styling — the badge is the call to action.

### Hero Headline
**Role:** Above-the-fold primary message

51px bearsansheadline weight 400, Graphite color, centered. Underline accent (2px Bear Red) under a single keyword (e.g. 'love'). No subheadline. Sits 80px from the nav bar.

### Product Screenshot Frame
**Role:** Hero visual showing the actual app

Full app window screenshot (Mac window with traffic-light buttons) rendered at ~900px wide, 16px border-radius, single soft drop shadow (0 13px 34px rgba(0,0,0,0.12)). The screenshot IS the hero image — no marketing render, no device mockup.

### Award Laurel
**Role:** Social proof / press recognition

Light gray line-art laurel wreath (Fog #e6e7eb stroke), with two-line centered text inside: award name in bearsans 700 at 16px Graphite, year in bearsans 400 at 14px Ash Gray. Three laurels arranged in a horizontal row with 48px gap between them.

### Pricing Card — Free
**Role:** Free plan feature list

Fog #e6e7eb background, 16px radius, 32px padding. Plan title 'Free' at 29px bearsansheadline 400 in Graphite. Feature list as vertical stack of 13px-gapped rows, each with a Bear Red outlined checkmark (1.5px stroke, 16px square) and 16px bearsans 400 Graphite label. Crossed-out features (strikethrough, Ash Gray) indicate paid-only items.

### Pricing Card — Pro
**Role:** Paid plan feature list with emphasis

Same structure as Free card but with Linen White surface and a subtle Stone Border #d5d6d9 (1px) to create visual lift. Title 'Bear' at 29px followed by an inline Bear Red pill badge reading 'PRO' in 11px bearsans 700 white text, 4px radius, 8px horizontal / 3px vertical padding. All checkmarks are Bear Red filled (not outlined) to signal inclusion. Price line at bottom: $2.99/month struck through (Ash Gray) next to $29.99/year in Graphite, 22px bearsans 700.

### Pro Badge
**Role:** Paid-plan indicator chip

Bear Red #dd4c4f fill, 4px radius, white text in bearsans 700 at 11px. Inline next to plan title. The only filled color element on the pricing area.

### Feature Checkmark List Row
**Role:** Pricing bullet item

Horizontal row: 16px square checkmark + 12px gap + label text. Free card uses Bear Red outlined checkmark (#dd4c4f stroke, transparent fill); Pro card uses Bear Red filled checkmark. Label at 16px bearsans 400 Graphite. Row height ~32px with 8px vertical gap between rows.

### Section Heading
**Role:** Interstitial section titles (e.g. 'Write naturally')

42px bearsansheadline weight 400, Graphite, centered. No subtitle, no eyebrow — just the heading alone. 80px top padding from previous section.

### Decorative Bear Illustration
**Role:** Ambient brand character in feature sections

Line-art bear mascot in Fog #e6e7eb stroke, no fill, roughly 200px tall. Sits off to the side of section content as quiet decoration, not a focal point. Sparse, sketchy style — feels hand-drawn.

### Input Field
**Role:** Text input (e.g. search, email capture)

Linen White background, 1px Stone Border #d5d6d9, 8px radius, 12px vertical / 16px horizontal padding. Placeholder text in Ash Gray #888, bearsans 400 at 14px. No visible focus ring in extracted data.

### Footer
**Role:** Site footer with secondary links

Linen White background, 48px vertical padding. Multi-column text links in bearsans 400 at 13px Ash Gray. No social icons, no newsletter form visible in screenshots.

## Do's and Don'ts

### Do
- Use bearsansheadline at weight 400 only for all display and section headings — never set it bold.
- Use Bear Red #dd4c4f only for the logo, links, the Pro badge, and decorative underlines — nothing else gets red.
- Default all body text to Graphite #444444 at 16px bearsans 400 with the 0.031em tracking; reserve Ash Gray #888888 for muted/secondary text only.
- Use the single shadow pattern (0 13px 34px rgba(0,0,0,0.12)) for the product screenshot frame; keep all other elements flat with hairline borders.
- Set the hero CTA to the black Mac App Store badge — never invent a custom filled red button.
- Alternate section bands between Linen White #ffffff and Mist #f3f5f7 with 64px vertical padding to create rhythm.
- Render decorative elements (laurels, bear mascot, stars) as 1.5–2px Fog #e6e7eb line art only — no fills, no color.

### Don't
- Do not bold the display headlines — weight 400 is the signature; bolding them breaks the handwritten mood.
- Do not introduce additional accent colors outside the three note-tag hues (Tag Indigo #456aa3, Tag Forest #2b6451, Tag Plum #884aa8) and the single Bear Red.
- Do not use filled buttons with Bear Red backgrounds anywhere on the marketing site — the only filled red element is the Pro badge pill.
- Do not add drop shadows to anything other than the product screenshot frame; the rest of the page must stay flat.
- Do not use photography or lifestyle imagery — the product screenshot is the only image content allowed.
- Do not use bold marketing adjectives in headlines; the voice is quiet and declarative (e.g. 'Write naturally', not 'Unlock your creative potential').
- Do not set tight letter-spacing on body text — the +0.031em tracking on bearsans is the established rhythm.

## Elevation

- **Product screenshot frame:** `0 13px 34px rgba(0, 0, 0, 0.12)`

## Surfaces

- **Linen White** (`#ffffff`) — Page canvas, default section background
- **Mist** (`#f3f5f7`) — Alternating section band, subtle surface lift
- **Fog** (`#e6e7eb`) — Pricing card surface, decorative wash
- **Marker Lime** (`#d3ffa4`) — Inline text highlight wash

## Imagery

Photography is absent — the site relies entirely on the product itself (actual Mac app window screenshots) as imagery, plus hand-drawn line-art decorations (laurel wreaths, sketched bear mascot, small star/sparkle marks). The product screenshots are the heaviest visual element on every screen. All decorative illustrations use a single Fog #e6e7eb stroke at 1.5–2px, no fills, giving the entire decorative layer a unified pencil-sketch quality. Icons are uniformly outline-style at 1.5px stroke in Graphite or Ash Gray. No lifestyle photography, no abstract gradient art, no 3D renders.

## Layout

Centered, max-width ~1100px content column with generous side padding. The hero is a vertical stack: nav → headline → platform tabs → download button → product screenshot, all center-aligned. Below the fold, sections alternate between Linen White and Mist #f3f5f7 bands with 64px vertical padding. The award laurels and pricing are centered, symmetrical arrangements. The pricing is a strict two-column compare (Free | Pro) with equal width and no asymmetric emphasis beyond the Pro card's white-vs-gray surface lift. No sidebar, no mega-menu, no sticky elements. Decorative illustrations sit loosely to the right of section content rather than in a grid, creating an editorial, magazine-like rhythm.

## Similar Brands

- **Ulysses (writing app)** — Same minimalist single-product marketing approach, light theme, single warm accent color, and the actual app screenshot as the dominant hero visual
- **Things 3 (Cultured Code)** — Identical aesthetic — generous whitespace, achromatic body with one accent hue, no filled CTAs, hand-drawn decorative touches alongside product photography
- **Notion** — Same paper-white canvas with a single accent color for emphasis and clean geometric typography in display weights
- **Obsidian** — Light-themed notes-app marketing with the product UI as hero art, minimal decoration, and near-monochrome palette
