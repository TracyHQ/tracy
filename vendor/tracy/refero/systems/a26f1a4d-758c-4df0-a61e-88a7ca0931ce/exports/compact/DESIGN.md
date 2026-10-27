# Mux — Style Reference
> Sunlit video workshop on olive paper — warm sage canvas with crisp white cards, orange CTAs, and a chunky display headline that feels hand-lettered

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Mux is a sunlit engineering workshop rendered in warm olive paper: a light, spacious developer-tool surface where the canvas itself (#e2e4dd, a warm sage-gray) feels like a drafting table, and crisp white cards sit on top like printed spec sheets. The system is deliberately low-chroma — the background, borders, and text carry the visual weight, while two warm accents (vivid orange #ff6100 and vivid yellow #ffb200) arrive as small functional punctuation: filled CTAs, hairline section dividers, and tiny AI labels. Typography is dual: a geometric neo-grotesque (Aeonik) for nearly everything, and a chunky display face (Rotonto) reserved for the biggest hero headlines, giving each page a clear two-register rhythm. Components are rounded generously — 28px card radii, 112–9999px pill buttons — making the interface feel hand-built and approachable rather than enterprise-precise. Dark product surfaces (#242628) appear as inset panels (transcript viewers, video player chrome) so the rest of the page stays calm and warm.

## Colors

| Name | Value | Role |
|------|-------|------|
| Olive Drafting | `#e2e4dd` | Page canvas, hero backgrounds, the warm sage paper that everything sits on — the dominant surface tone of the entire site |
| Snow Card | `#ffffff` | Card surfaces, navigation bar, elevated panels — the only surface that floats above the olive canvas |
| Inkstone | `#000000` | Primary text, heading strokes, nav text, icon strokes — maximum contrast on light surfaces, always pure black |
| Forge Dark | `#242628` | Dark inset surfaces — product mockups, transcript panels, video player chrome, footer; provides the only dark layer in the system |
| Mist Surface | `#f4f6f4` | Subtle secondary surface, quiet dividers between sections, gentle wash backgrounds |
| Linen Border | `#d0d2c8` | Hairline section dividers, card borders, warm gray rules that separate content bands |
| Steel | `#828c97` | Muted text, secondary button borders, disabled states, low-emphasis borders |
| Pewter | `#adb9c6` | Outlined button borders, subtle outlines on tags and chips, medium-weight hairlines |
| Graphite | `#565e67` | Secondary text on light surfaces, helper copy, metadata labels |
| Ember Orange | `#ff6100` | Orange outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Amber Signal | `#ffb200` | Hairline section dividers, feature underlines, AI badges, small punctuation strokes — a warm goldenrod that runs through the page like a highlighter mark |
| Marigold Deep | `#bd8209` | Darker amber tone used for emphasized amber strokes and secondary accent borders |
| Signal Blue | `#0091ff` | Inline text links, interactive link underlines — the only cool chromatic accent, reserved exclusively for hyperlink treatment |
| Sprout Green | `#00be43` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |

## Typography

### Aeonik — Primary workhorse — body copy, nav, buttons, cards, headings up to 50px; weight 400 for body, weight 700 for headings and emphasis. The geometric neo-grotesque forms give the page a clean engineering tone.
- **Substitute:** Inter, Söhne, or Neue Haas Grotesk
- **Weights:** 400, 700
- **Sizes:** 14px, 16px, 18px, 21px, 24px, 50px
- **Line height:** 1.20, 1.40, 1.50, 2.00
- **Letter spacing:** 0.0200em across all sizes (≈0.28px at 14px, 0.32px at 16px, 0.48px at 24px, 1.0px at 50px)
- **OpenType features:** `"dlig" on, "kern" on`

### Rotonto — Display face reserved for the hero headline only — chunky, slightly retro geometric forms that feel hand-lettered. Its presence is a signature: the biggest text on the page is visually distinct from everything else, creating a single moment of typographic drama per page.
- **Substitute:** Cooper Black, Quicksand Bold, or Mabry Pro Black
- **Weights:** 400
- **Sizes:** 50px, 66px
- **Line height:** 1.15, 1.20
- **Letter spacing:** 0.0200em (≈1.0px at 50px, 1.32px at 66px)

### JetBrains Mono — Code samples, technical metadata, tab labels, AI badge text, inline monospaced data — appears wherever the page needs to read as 'this is a developer surface'
- **Substitute:** IBM Plex Mono, Roboto Mono, or Geist Mono
- **Weights:** 400
- **Sizes:** 12px, 14px
- **Line height:** 1.20, 1.50, 1.60

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | 0.24px |
| body-sm | — | — | 14px | 1.5 | 0.28px |
| body | — | — | 16px | 1.5 | 0.32px |
| subheading | — | — | 18px | 1.5 | 0.36px |
| heading-sm | — | — | 21px | 1.4 | 0.42px |
| heading | — | — | 24px | 1.2 | 0.48px |
| heading-lg | — | — | 50px | 1.15 | 1px |
| display | — | — | 66px | 1.15 | 1.32px |

## Spacing & Layout

**Base unit:** 4px

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 28-56px
- **Element gap:** 14-28px

### Border Radius

- **tags:** 9999px
- **cards:** 28px
- **icons:** 2px
- **buttons:** 112px
- **smallCards:** 14px

## Components

### Primary CTA Button (Ember)
**Role:** The single filled action button — used for 'Get Started', 'Talk to Us', and all conversion CTAs

Pill shape with 112px border-radius, filled background #ff6100, white text at 16px Aeonik weight 400, 0.0200em tracking, padding 28px horizontal × 14px vertical. The pill is deliberately tall — the 112px radius with 14px padding produces an almost-capsule shape that reads as friendly and confident, not corporate.

### Ghost/Outlined Button
**Role:** Secondary action — 'Read our docs', less prominent CTAs

Pill shape with 112px radius, transparent fill, 1px border in #000000 or #adb9c6, black text at 16px Aeonik weight 400, 28px × 14px padding. Sits visually subordinate to the Ember CTA by stripping the fill while keeping the capsule geometry.

### Top Navigation Bar
**Role:** Persistent site navigation — logo, product menu, solutions, developers, pricing, blog, log in, CTA

White (#ffffff) background bar, 1px bottom border in #d0d2c8, logo left, centered link group in 16px Aeonik weight 400 black, right side splits into a text 'LOG IN' link and the Ember CTA pill. No shadow — the hairline border defines the edge.

### Trust Logo Bar Card
**Role:** Social proof — 'Trusted by top brands' with Cursor, Shopify, Runway, Dropbox, Yelp logos

White card (#ffffff) with 28px border-radius, 1px border in #d0d2c8, 28px vertical padding. A left label cell reads 'TRUSTED BY TOP BRANDS' in 12px Aeonik weight 400 uppercase, then 5 logo cells divided by subtle vertical hairlines. The card sits on the olive canvas like a printed spec sheet.

### Feature Card (Dark Product Mockup)
**Role:** Showcase live product UI — transcript panel, video features, summarization, content moderation

Dark card (#242628) with 28px border-radius, no border, generous 56px padding. White text headings at 21px Aeonik weight 700, muted gray body text, small yellow 'AI' badge (see below) in the top-right corner. The dark surface is the only place deep blacks appear.

### AI Badge
**Role:** Tiny tag indicating AI-powered features — appears on every Mux Robots card

Small yellow (#ffb200) rectangle or pill, 2px border-radius or full pill, 12px JetBrains Mono text in black, 7px padding. Functions as a highlighter mark — it stamps AI features the way you'd tag a printout.

### Section Header Tag (DEPLOY-style)
**Role:** All-caps small label above section titles

12px Aeonik or JetBrains Mono weight 400, uppercase, letter-spacing 0.0200em, in #0091ff (Signal Blue) or #ffb200 (Amber). Sits centered or left above the section title, acting as a category stamp.

### Tab Navigation Row
**Role:** Switch between content types — Transcript / Thumbnails / GIFs / Clipping / Storyboards

Horizontal row of text tabs on dark surface, 16px Aeonik weight 400, inactive tabs in muted gray (#828c97 or similar), active tab in white with a 2px amber underline (#ffb200). No background pills — the underline alone signals state.

### Yes/No Toggle Pair
**Role:** Binary choice in Q&A UI — 'Is this video a cartoon? YES / NO'

Two adjacent pill segments with 112px shared radius. Unselected side is dark gray fill with white text; selected side flips to Ember Orange (#ff6100) with white text. A '100% certainty' label in 12px JetBrains Mono sits to the right.

### Hero Headline Block
**Role:** The dominant text moment on the page

Centered stack: optional technical preview badge at top, then 66px Rotonto weight 400 in #000000 with 0.0200em tracking, line-height 1.15, followed by 18px Aeonik weight 400 body in #000000 at 1.5 line-height. Sits directly on the olive canvas — no card, no background.

### Robot Character Illustration
**Role:** Brand mascot — appears near hero and in Mux Robots section

A small illustrated robot character rendered in flat colors (white, navy, amber accents) with a 2px stroke outline. Functions as a signature mark, not a decorative graphic — it recurs in the same pose to anchor the Mux Robots narrative.

### Grid Pattern Section
**Role:** Textured background for feature explanation sections

Olive canvas (#e2e4dd) overlaid with a 1px grid in #d0d2c8 at ~28px intervals, creating a subtle architectural-drafting-paper texture. Cards float above the grid in white #ffffff.

### Summary Tone Selector
**Role:** Three-way toggle for AI summary tone — Neutral / Professional / Playful

Row of three pill segments on a dark surface. Active tone has white text with a subtle highlight, inactive tones in muted gray. No background fills — state is shown through text weight and color only.

## Do's and Don'ts

### Do
- Use the olive canvas (#e2e4dd) as the default page background — never substitute white for the root surface
- Reserve Rotonto exclusively for the 50–66px hero headline; use Aeonik for everything from 24px and below
- Set every Aeonik instance with letter-spacing 0.0200em and font-features 'dlig' on, 'kern' on — the tracking is part of the brand voice
- Use 28px border-radius on all cards and 112px on all pill buttons — these two radii define the soft, hand-built geometry
- Let Ember Orange (#ff6100) appear only as a filled CTA fill or active state — never as text color or decorative accent
- Separate content bands with 1px hairlines in #d0d2c8 or #ffb200, not with background color changes or shadows
- Stamp AI features with the small yellow 12px JetBrains Mono 'AI' badge — it is the system's signature punctuation

### Don't
- Don't add drop shadows to cards or panels — the system is intentionally flat; depth comes from surface color contrast only
- Don't use Rotonto for subheadings, body, or anything under 50px — its chunky forms are reserved for the hero moment
- Don't introduce a third or fourth border-radius value for cards beyond 7px, 14px, and 28px — the system has exactly three card radii
- Don't use Ember Orange for large fills like page sections or hero backgrounds — it is a button/accent color, not a surface color
- Don't pair Signal Blue (#0091ff) with non-link content — it is reserved exclusively for inline hyperlink text and underlines
- Don't switch to a different font-family for monospace code — JetBrains Mono (or its substitute) must stay consistent across all code contexts
- Don't override the 0.0200em letter-spacing on Aeonik at any size — the uniform tracking is a defining trait of the typeface treatment

## Elevation

- **Trust logo bar card:** `none — relies on 28px radius and border only, no shadow`
- **Feature mockup cards:** `none — dark fill (#242628) and 28px radius carry the weight, no drop shadow`
- **Pill buttons:** `none — flat fill, no shadow`

## Surfaces

- **Olive Canvas** (`#e2e4dd`) — Page background, hero sections — the warm sage base layer
- **Snow Card** (`#ffffff`) — Elevated cards, nav bar, feature panels floating above canvas
- **Mist** (`#f4f6f4`) — Quiet inset wash, secondary surface tone
- **Blue Highlight** (`#cde6ff`) — Light blue accent surface for special callouts
- **Forge Dark** (`#242628`) — Dark product UI panels — transcript, video player, code chrome

## Imagery

Imagery is minimal and product-centric. Photography appears only in one context: a real-world video still (retail store with employees at a counter) used inside a product mockup card to demonstrate Mux's video analysis features — treated as raw footage, not styled. The dominant illustrative element is a small flat-color robot character (white body, navy accents, amber highlights) with a consistent 2px stroke outline, acting as a recurring brand mascot. Section backgrounds occasionally carry a subtle 1px grid pattern on the olive canvas to evoke drafting paper. There is no lifestyle photography, no hero images, no full-bleed photography — the page is overwhelmingly text and UI mockups. The dark product panels (#242628) containing transcript, video player, and AI analysis UI serve as the primary visual content, making the product itself the imagery.

## Layout

Centered max-width layout at 1200px, with the olive canvas extending full-bleed behind contained content. The hero is a centered vertical stack on the olive canvas: small badge → display headline → supporting paragraph → CTA pair → trust logo bar card below. Sections follow in a single column rhythm with 64–80px vertical gaps, alternating between text-only centered blocks and two-column text-plus-product-mockup grids. Feature explanations use a consistent 2-column pattern (text left, dark product card right) that flips on alternating sections to create a Z-pattern reading flow. Product mockup cards (dark #242628, 28px radius) are the visual anchors of most sections. Navigation is a single top bar — no sidebar, no sticky elements beyond the nav. The grid pattern section provides the only textural background; everything else is flat color. The page reads top-to-bottom as a sequence of full-width bands on the olive canvas, each band self-contained but unified by consistent card geometry and spacing.

## Similar Brands

- **Linear** — Same approach of using a generous border-radius (28px cards, pill buttons) and a single warm accent color against a quiet neutral canvas, though Linear skews dark and Mux skews light
- **Resend** — Shares the developer-tool warmth — olive-toned canvas, neo-grotesque type, pill-shaped CTAs, and a single chromatic accent that appears only in CTAs and active states
- **Vercel** — Same dual-typeface strategy (one geometric workhorse + one display face for the hero) and the same flat, shadowless card system floating on a full-bleed canvas
- **Supabase** — Shares the green-canvas-adjacent warm-neutral developer-tool aesthetic, large pill buttons, and a chunky display headline treatment above centered hero copy
- **Cal.com** — Same spacious, light, rounded-everything developer-tool geometry with warm accents — though Cal.com goes brighter while Mux stays sage
