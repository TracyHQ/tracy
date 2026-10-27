# Family — Style Reference
> storybook spread on cream parchment

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Family speaks in a warm parchment-and-marker language: a cream canvas (#fbfaf9) carries hand-drawn characters and scattered confetti shapes in primary-bright fills, while typography stays calm and utilitarian in Inter. The interface itself is deliberately restrained — inset hairline borders define surfaces rather than shadows — so the cartoon illustrations carry all the emotional weight and the chrome stays quiet. Color functions as semantic markers: near-black for the one serious action, blue and orange for status, gold and green for positive signals, red and pink for destructive/attention. Every screen should feel like a children's storybook spread: generous whitespace, big confident headings, and a few vivid characters punctuating an otherwise monochrome layout.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cream Canvas | `#fbfaf9` | Page background, nav surface — warm off-white that reads as paper rather than screen |
| Stone Surface | `#f2f0ed` | Card surfaces, secondary panels, inset border tone — one shade darker than canvas to create depth without shadow |
| Ink Black | `#121212` | Headings, primary action fill, dark card surfaces — near-black that stays slightly warm |
| Heading Charcoal | `#343433` | Primary text, nav text, decorative strokes — softened black for readable body |
| Body Brown | `#474645` | Body copy, secondary text — warm desaturated brown rather than cool gray |
| Muted Gray | `#7e7e7d` | Helper text, inactive nav, tertiary labels |
| Stone Border | `#e5d5c3` | Hairline decorative borders on illustrations and shapes |
| Link Blue | `#0086fc` | Inline links, feature list text — vivid blue that reads as actionable without being a button |
| Sky Blue | `#64c6ff` | Illustration fill, decorative mascot accents — sky-bright for storybook characters |
| Alt Blue | `#00b2ff` | Secondary illustration fill, icon accents — slightly deeper blue for variation |
| Grass Green | `#00c978` | Green text accent for links, tags, and emphasized short phrases. Use as a supporting accent, not as a status color |
| Mint | `#00ca48` | Green wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |
| Ember Orange | `#ff3e00` | Orange text accent for links, tags, and emphasized short phrases |
| Sun Yellow | `#ffcd6c` | Illustration fill, decorative shapes, mascot coloring |
| Gold | `#d48f00` | Yellow text accent for links, tags, and emphasized short phrases. |
| Honey | `#ffbb26` | Yellow wash for highlight backgrounds, decorative bands, and soft emphasis behind content |
| Coral Pink | `#ff58ae` | Purchase badge fill, decorative illustration accent |
| Plum Violet | `#9f4fff` | Violet wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Alert Red | `#ff2b3a` | Red wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Use as a supporting accent, not as a status color |

## Typography

### Family — Display and hero headings — the custom Family typeface at weight 500, letter-spacing tightening to -0.031em at 68px creates a slightly playful, slightly condensed character that defines the brand
- **Substitute:** Druk Wide Medium or GT America Compressed Medium
- **Weights:** 500
- **Sizes:** 44px, 68px
- **Line height:** 1.09-1.10
- **Letter spacing:** -0.031em at 68px, -0.020em at 44px

### Inter — Body copy, nav text, card descriptions — Inter at regular weight carries the utility layer; tighter line-heights (1.42-1.53) for running text, generous (1.58) for caption-level
- **Substitute:** Inter (Google Fonts)
- **Weights:** 400
- **Sizes:** 12px, 13px, 14px, 15px, 16px, 17px, 19px, 23px, 44px
- **Line height:** 1.42-1.58
- **Letter spacing:** -0.0260em, -0.0190em, -0.0160em, -0.0130em, -0.0100em, -0.0090em, -0.0060em, -0.0010em

### Inter — Section subheads and emphasised list labels — Inter medium adds weight without changing the geometric personality
- **Substitute:** Inter (Google Fonts)
- **Weights:** 500
- **Sizes:** 12px, 13px, 14px, 15px, 16px, 17px, 19px, 23px, 44px
- **Line height:** 1.09-1.47
- **Letter spacing:** -0.019em at 23px, -0.009em at 15px

### Inter — Button labels and emphasized UI text — semi-bold for interactive elements that need to register as tappable
- **Substitute:** Inter (Google Fonts)
- **Weights:** 600
- **Sizes:** 12px, 13px, 14px, 15px, 16px, 17px, 19px, 23px, 44px
- **Line height:** 1.47
- **Letter spacing:** -0.009em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| micro | — | — | 12px | 19 | -0.01px |
| caption | — | — | 15px | 22 | -0.14px |
| body | — | — | 17px | 26 | -0.22px |
| subheading | — | — | 19px | 27 | -0.3px |
| heading | — | — | 23px | 25 | -0.44px |
| heading-lg | — | — | 44px | 53 | -0.88px |
| display | — | — | 68px | 75 | -2.1px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80-120px
- **Card padding:** 32px
- **Element gap:** 8-12px

### Border Radius

- **nav:** 10px
- **cards:** 10px
- **icons:** 40px
- **pills:** 9999px
- **small:** 2px
- **badges:** 6px
- **buttons:** 32px
- **illustration:** 72px

## Components

### Hero Illustration Cluster
**Role:** Decorative character/scatter artwork flanking the hero headline

Hand-drawn cartoon mascots (flower, blob, cat, triangle character) with scattered confetti shapes (stars, coins, hearts, gears, leaves). Uses fills from the accent palette (#64c6ff, #ffcd6c, #00c978, #ff3e00, #ff58ae, #e5d5c3) with thin strokes at #343433. Shapes use organic radii of 40-72px. Two clusters flank a centered text block — they do not overlap the type.

### Ghost Nav Button
**Role:** Secondary header action (Log In)

Transparent background, text in #343433, no border, font-size 13-14px Inter 400. Sits flush left of the primary CTA in the top nav.

### Dark Pill Button
**Role:** Primary header CTA (Get Started)

Background #121212, text white, fully rounded (32px radius), horizontal padding 14px, vertical padding sized to content height (roughly 8-11px). Small, dense, high-contrast — the one moment of darkness in the header.

### Sand Pill Button
**Role:** Secondary page CTA (Watch the Video)

Background #f6f4ef (lighter than canvas), text #121212, 32px pill radius, 14px horizontal padding. Pairs beside the dark primary to create tonal contrast.

### Inline Demo Link
**Role:** Feature-card watch-the-demo link

Underlined text link, no border, no background padding beyond 4px vertical. Color is #ff3e00 (ember orange) — this is the brand's signature secondary CTA color, used wherever a 'Watch the demo' or 'Manage your collectibles' link sits beneath a feature card. Border-radius 0 to read as text.

### Feature Card (Hairline-Bordered)
**Role:** Primary card for the 6-feature grid (Easy, Secure, Fast, Powerful, Fun, etc.)

White background (#ffffff), 10px radius, 32px padding on all sides. Border is a 1px inset in #f2f0ed (stone surface) rather than a drop shadow — the card is defined by an interior hairline, giving a pressed-into-paper feel. Cards sit in a 3-column grid with 8-12px gaps. Heading is 23px Inter medium, body is 16-17px Inter 400 in #474645.

### Light Tag Surface
**Role:** Secondary card surface for grouped feature blocks

Background #fbfaf9 (same as canvas) or #fcfbf9, 12px radius, no shadow, horizontal padding ~23px, vertical padding 14px. Used for the 'Watching Wallets' / 'Wallet Activity' demo blocks. Defines surface through subtle warmth shift rather than contrast.

### Dark Feature Card
**Role:** Dark-mode card for the leftmost action card (Send/Swap/Receive/Purchase)

Background #000000, 24px left-only radius (asymmetric), 24px soft drop shadow at rgba(0,0,0,0.15), 4px padding. Houses a stacked list of icon+label rows in white/cream text — the only dark surface on the page, creating strong focal contrast against the cream canvas.

### Action Row (Inside Dark Card)
**Role:** Send / Swap / Receive / Purchase list item

Each row: circular icon in app-brand color (#0090ff, #9f4fff, #00c978, #ff58ae), label in white Inter 500/600, helper text in muted white. Rows separated by 1-2px gaps. The colorful icons are the chromatic punctuation — the rest stays monochrome.

### Status Badge Pill
**Role:** Backing Up / Pending / Completed indicators

Fully rounded pill (9999px radius), background in status hue (mint #00ca48 for backing-up, gold #ffbb26 for pending), text in matching dark or light. Padded ~10-12px horizontal, 6-8px vertical. Sits inside light tag surfaces.

### Tweet Card
**Role:** Social proof card in the 'Friends of Family' grid

White background (#ffffff), 10px radius, 1px inset border in #f2f0ed, 32px padding. Avatar circle 40px, handle in #343433, tweet body in #474645 at 15-16px. X-platform icon top-right. Cards sit in a 4-column grid with horizontal scroll overflow.

### Inset-Bordered Surface
**Role:** Any container that needs subtle definition without shadow

The signature border technique: 1px inset box-shadow in #f2f0ed creates an interior hairline on white surfaces. No drop shadows on cards — the system relies entirely on inset strokes and tonal shifts to separate layers. This is what gives the page its flat, pressed-into-paper quality.

## Do's and Don'ts

### Do
- Use the custom Family typeface at 44-68px weight 500 for all display and hero headings; never substitute system fonts at this scale
- Use 10px radius as the default for cards and nav surfaces; use 32-9999px only for pill buttons and badges
- Build card definition with a 1px inset border in #f2f0ed rather than a drop shadow — the page should feel pressed into paper, not floating
- Let #ff3e00 carry the 'demo link' and accent text role; keep ember orange for inline links and feature callouts, never as a filled button
- Set body text in Inter 400 at 16-17px with line-height 1.42-1.53 and letter-spacing -0.013 to -0.016em
- Use the cream canvas (#fbfaf9) as the base for every full-bleed section; alternate by introducing the #f2f0ed stone surface for grouped card clusters
- Use illustration clusters of cartoon mascots in primary fills to anchor hero sections; scatter them asymmetrically so the centered text remains the focal point

### Don't
- Never use a drop shadow larger than rgba(0,0,0,0.04) — the design system rejects heavy elevation
- Don't use blue (#0086fc) as a filled CTA background; blue is reserved for inline links and list emphasis text
- Don't introduce gradients — the system is strictly flat with hairline inset borders
- Don't use Inter at the display sizes — display and hero headings must use the Family typeface at weight 500
- Don't separate surfaces with white-on-white; always shift toward #f2f0ed stone or toward #121212 black for clear contrast
- Don't add decoration to pill buttons — dark pill (#121212) and sand pill (#f6f4ef) are the only two pill variants
- Don't use warm reds (#ff2b3a) for anything beyond destructive/error states; the warm accent slot belongs to #ff3e00

## Elevation

- **Feature Card:** `inset 0 0 0 1px #f2f0ed`
- **Dark Feature Card:** `0 0 24px 0 rgba(0,0,0,0.15)`
- **Subtle Drop on Cards:** `0 1px 6px 0 rgba(0,0,0,0.04), 0 0 24px 0 rgba(0,0,0,0.05)`

## Surfaces

- **Canvas** (`#fbfaf9`) — Page background, hero backdrop — warm cream that reads as paper
- **Stone** (`#f2f0ed`) — Inset border tone, secondary card surfaces, subtle surface shifts
- **Sand** (`#f6f4ef`) — Pill button secondary variant, light tag surfaces for demo blocks
- **Pure White** (`#ffffff`) — Feature cards, tweet cards — only on white does the 1px inset hairline register
- **Dark Surface** (`#121212`) — Dark pill buttons, primary CTA — the only dark surface in the system
- **Full Black** (`#000000`) — Dark feature card (Send/Swap stack), shadow base — strongest tonal shift available

## Imagery

Illustration is the primary visual language: hand-drawn cartoon mascots (flower with square face, smiling green blob, yellow triangle character, orange cloud, cat) with dot eyes and stick limbs, rendered in flat fills from the accent palette (sky blue #64c6ff, sun yellow #ffcd6c, grass green #00c978, ember orange #ff3e00, coral pink #ff58ae). Scattered confetti shapes (coins, stars, hearts, gears, leaves, lock icons, QR markers) fill the negative space around them. All illustration strokes are #343433 at thin weight. Mascots use generous organic radii (40-72px). The illustrations are full-bleed on the left and right of the hero, then appear as smaller accents inside cards throughout the rest of the page. Photography is absent; phone mockups in the lower section show dark iOS UI screenshots. Icon style is solid filled circles in saturated brand colors, mono-weight.

## Layout

Full-width centered layout with max-width ~1200px for content. Hero is a three-column composition: left illustration cluster, centered headline+subtitle+CTA stack, right illustration cluster — all on the cream canvas. Below the hero, content flows in vertical bands separated by generous whitespace (80-120px section gaps). The 'Explore Ethereum' section uses a 3-column card grid with the dark Send/Swap/Receive card as left-column visual anchor, followed by a second row of three lighter feature cards. A second 3-column grid below shows phone mockups. The 'Friends of Family' section is a horizontally-scrolling 4-column tweet card grid. Navigation is a minimal top bar with logo left, center links, and two pill buttons (ghost + dark) right-aligned — no sidebar, no mega-menu. The overall rhythm alternates quiet centered-text sections with colorful illustration-rich sections.

## Similar Brands

- **Phantom (crypto wallet)** — Same storybook illustration style with cartoon mascots on a light canvas, playful tone with utility-grade Inter typography
- **Rainbow Wallet** — Similar cream-toned palette with playful illustrated characters and restrained typography for a crypto audience
- **Stripe** — Same hairline-bordered card aesthetic, inset 1px borders instead of shadows, generous whitespace and quiet interface chrome
- **Linear** — Same restrained typography hierarchy with custom display face over Inter body, minimal-elevation card system with deliberate restraint
- **Coinbase** — Same approach of using saturated brand colors as small accents against an otherwise quiet, near-monochrome interface
