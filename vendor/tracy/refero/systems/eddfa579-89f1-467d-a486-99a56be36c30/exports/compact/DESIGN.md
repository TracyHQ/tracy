# ExpressVPN — Style Reference
> Fortress garden at dawn. A bright, spacious canopy of teal and ivory where dark navy anchors signal weight and warmth.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

ExpressVPN presents a light, spacious privacy interface that balances authority with approachability. The visual system pairs a deep midnight navy (#001d2f) for typography and structural borders with a warm forest teal (#0f866c) as the single decisive action color, creating a trust-through-restraint palette where chromatic color only appears as functional punctuation. Surfaces stay bright and flat with generous breathing room, and diffuse shadows on cards produce a gentle floating quality rather than hard elevation. The type system splits between a proprietary display face (FS Kim) for confident serif-leaning headlines and Inter for the entire UI vocabulary, producing a restrained tone: rounded cards in the 20–34px range, deeply pill-shaped CTAs, and soft pastel accent panels (peach, sand, mint) that occasionally surface warmth without disrupting the overall cool, protective mood.

## Colors

| Name | Value | Role |
|------|-------|------|
| Midnight Navy | `#001d2f` | Primary text, structural borders, heading strokes, nav separators, footer text — near-black with a cool cast gives authority without harshness |
| Soft Canvas | `#f7f8f9` | Page background, muted section bands, secondary card surfaces |
| Pure White | `#ffffff` | Card surfaces, nav background, button text on dark fills, product mockup backings |
| Hairline Gray | `#ccd2d5` | List dividers, hairline borders, subtle separators |
| Silver Edge | `#dcdcdc` | Secondary borders and dividers |
| Steel Caption | `#adadad` | Badge borders, neutral fills, muted borders |
| Slate Body | `#667782` | Secondary body text, muted helper copy, desaturated icon fills |
| Ink Black | `#000000` | Button borders, icon fills, high-contrast text accents |
| Forest Teal | `#0f866c` | Primary action buttons, filled CTAs, active link color, brand emphasis — the single chromatic decision color; warm emerald reads as secure and confident without aggression |
| Deep Teal | `#00695c` | Teal outline accent for tags, dividers, and focused UI edges. Do not promote it to the primary CTA color |
| Peach Cream | `#ffe4d4` | Warm accent card surface, soft highlight wash for feature callouts |
| Warm Sand | `#f0eacf` | Soft accent surface, nav highlight band, gentle warm wash |
| Pale Mint | `#c3ece8` | Light teal surface wash, nav highlight, brand-tinted decorative panel |
| Sea Mist | `#b7d1d0` | Card stroke accent, decorative outline on teal-themed cards |
| Brand Red | `radial-gradient(circle, rgb(218, 57, 64) 0px, rgb(176, 39, 45) 100%)` | ExpressVPN logo radial gradient stop — the red shield emblem |
| Deep Red | `#b0272d` | Outer stop of the brand logo radial gradient |
| Twilight Navy | `linear-gradient(261deg, rgb(12, 57, 86) 21.96%, rgb(0, 24, 39) 82.57%)` | Inner stop of the dark hero gradient band |

## Typography

### Inter — Universal UI and body face — every navigation label, button, form field, list item, caption, and paragraph runs in Inter. Weight 500–600 is the workhorse for buttons and nav; weight 400 for body. 10–12px uppercase labels (trustee badges, guarantee copy) use generous 0.10–0.14em tracking for an institutional, trustworthy feel. Proportional alternates enabled for tighter number and punctuation fit.
- **Weights:** 400, 500, 600, 700
- **Sizes:** 10px, 12px, 14px, 16px, 18px, 20px, 24px
- **Line height:** 1.20, 1.33, 1.44, 1.50, 1.67, 1.72, 1.75, 1.80, 1.83, 1.90, 2.00
- **Letter spacing:** 0.10em–0.14em for uppercase 10–14px labels; default 0 for body
- **OpenType features:** `"palt"`

### FS Kim — Display and headline face — proprietary serif-influenced typeface carries the brand voice in the hero ('World's #1 VPN'), section titles, and large numerical pricing callouts. Tight -0.016em tracking at 46–64px tightens the silhouette and signals premium quality. Use a humanist serif like 'Source Serif Pro' or 'Tiempos Headline' as substitute.
- **Substitute:** Source Serif Pro
- **Weights:** 500, 700
- **Sizes:** 18px, 32px, 46px, 64px
- **Line height:** 1.00, 1.09, 1.25
- **Letter spacing:** -0.016em at 32–64px
- **OpenType features:** `"palt"`

### Arial — Arial — detected in extracted data but not described by AI
- **Weights:** 400, 700
- **Sizes:** 13px, 18px
- **Line height:** 1.2, 1.45

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.8 | 1.4px |
| badge | — | — | 12px | 1.2 | 1.32px |
| body-sm | — | — | 14px | 1.72 | — |
| body | — | — | 16px | 1.5 | — |
| subheading | — | — | 20px | 1.44 | — |
| heading-sm | — | — | 24px | 1.33 | — |
| heading | — | — | 32px | 1.25 | -0.51px |
| display | — | — | 64px | 1.09 | -1.02px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64-80px
- **Card padding:** 32px
- **Element gap:** 24px

### Border Radius

- **nav:** 4px
- **cards:** 24px
- **badges:** 24px
- **buttons:** 10px
- **largeCards:** 34px
- **pillButtons:** 9999px

## Components

### Promo Top Banner
**Role:** Sitewide announcement strip

Full-bleed Forest Teal (#0f866c) background, white text at 14px Inter weight 500, horizontal padding 24px, vertically centered. Right-aligned CTA link in white with underline. No rounded corners. Optional illustration anchored left.

### Primary Navigation Bar
**Role:** Top-level site navigation

White (#ffffff) background, 64px height. Left: ExpressVPN wordmark with red radial-gradient shield icon. Center: Inter 14–16px weight 500 nav links in Midnight Navy (#001d2f), 10–24px horizontal spacing. Right: pill-shaped 'Get Started' ghost button — 1px Midnight Navy border, 10px radius, 14px 24px padding, 9999px alternate variant for primary CTA contexts. Globe icon for language switcher.

### Ghost Pill CTA
**Role:** Secondary action button

Forest Teal (#0f866c) 1px border, white fill, Midnight Navy text 14px Inter weight 600, 9999px radius (pill), 10px 24px padding, 13px line-height. Used for 'Get Started' and non-purchase actions.

### Filled Pill CTA
**Role:** Primary purchase action

Forest Teal (#0f866c) background, white text 14–16px Inter weight 600, 9999px radius, 14px 32px padding. The hero 'Get the Deal Now' button is the canonical example — the only place a solid teal fill should appear. Right-arrow icon adjacent to label.

### Hero Headline Block
**Role:** Landing hero copy

Centered, 64px FS Kim weight 700 in Midnight Navy, line-height 1.09, -0.016em tracking. Subhead in 20px Inter weight 400, Slate Body (#667782). Price emphasis uses Forest Teal inline highlight: '$2.79/mo' in teal against the navy headline.

### Trust Badge Row
**Role:** Social proof strip

Horizontal row of trust signals — App Store and Google Play star ratings (4.6+), CNET badge, review counts in 12px Inter weight 500 Slate Body. Optional gold star icons. Centered below hero with 16–24px vertical gap from CTA.

### Product Feature Card
**Role:** Feature illustration card (Time Protected, App Shortcuts, etc.)

White (#ffffff) surface, 24px radius, 32px padding, diffuse shadow rgba(0,0,0,0.12) 0 0 32px. 20px Inter weight 600 title in Midnight Navy, 14px Inter weight 400 Slate Body description. Mini chart or numeric figure (24px, weight 600) as data anchor. Cards arrange in a row of 4–5 overlapping the central phone mockup.

### Phone Mockup Frame
**Role:** Central product visualization

iPhone frame in pure white, ~340px wide, centered on hero. Screen shows VPN app UI: circular power button (teal), green-tinted connection confirmation, location chip ('Smart Location / Japan – Tokyo'), server stats. Positioned behind floating feature cards via z-index layering.

### Product Family Card
**Role:** Cross-sell product tile (ExpressKeys, ExpressMailGuard, Identity Defender, ExpressAI)

Rounded square icon container (64–80px) in Pale Mint, Sea Mist, or Peach Cream accent fill, 20px radius, paired with product name in 16px Inter weight 600 Midnight Navy and short descriptor. Arranged in a 5-column row with consistent 40px gap. Each icon is a simple 2-color illustration.

### FAQ Accordion Row
**Role:** Expandable question/answer list

Full-width rows, 16px vertical padding, 1px Hairline Gray (#ccd2d5) bottom border. Question text in 18px Inter weight 500 Midnight Navy, chevron icon right-aligned. Expanded body in 16px Inter weight 400 Slate Body, 24px top padding.

### Live Chat Widget
**Role:** Persistent support entry point

Floating bottom-right pill, white background, 34px radius, diffuse shadow rgba(0,0,0,0.12) 0 4px 16px. Red ExpressVPN shield icon at left, two-line copy: 'Need help? Chat with us!' (14px weight 600 Midnight Navy) and 'Online' (12px weight 500 Forest Teal with small green dot indicator).

### Cookie Consent Bar
**Role:** GDPR compliance notice

Fixed bottom bar, white background, 14px Inter body text in Midnight Navy. 'Customize' outlined ghost button (Midnight Navy 1px border, 10px radius) paired with 'Accept' filled teal pill button (Forest Teal fill, white text, 10px radius). 16px horizontal padding on the action cluster.

## Do's and Don'ts

### Do
- Use Forest Teal (#0f866c) as the only filled chromatic action color — never substitute blues, greens, or other hues for primary CTAs.
- Set the primary CTA to a 9999px pill radius and pair it with a right-arrow icon for purchase actions.
- Set display headlines in FS Kim at 46–64px with -0.016em letter-spacing; reserve Inter for everything below 32px.
- Apply diffuse center-anchored shadows (rgba(0,0,0,0.12) 0px 0px 32px 0px) to all cards — never use directional offset drops.
- Use the three soft accent surfaces (Peach Cream #ffe4d4, Warm Sand #f0eacf, Pale Mint #c3ece8) sparingly as decorative washes, not as functional backgrounds.
- Set uppercase trust/guarantee labels in 10–12px Inter with 0.10–0.14em tracking for an institutional, confident voice.
- Keep the canvas at Soft Canvas (#f7f8f9) and only escalate to pure white for cards and product surfaces.

### Don't
- Do not introduce a second chromatic accent color — the system is intentionally monochrome with one decision teal.
- Do not use FS Kim below 18px or for UI controls — it is a display face only.
- Do not use sharp 0–4px radii on cards; the system depends on 20–34px rounding for its soft, protected feel.
- Do not apply heavy directional shadows or saturated glow effects — elevation must remain diffuse and ambient.
- Do not use the red brand gradient outside the logo lockup — red is reserved for the shield emblem.
- Do not place body text below 14px; the 10–12px range is reserved for uppercase tracked labels only.
- Do not invert the teal/white relationship on buttons — teal is always the fill, white the text inside; ghost variants reverse border and text but never invert the fill.

## Elevation

- **Standard Card:** `rgba(0, 0, 0, 0.12) 0px 0px 32px 0px`
- **Subtle Card:** `rgba(0, 0, 0, 0.1) 0px 0px 15px 0px`
- **Badge / Trust Pill:** `rgba(0, 0, 0, 0.12) 0px 4px 16px 0px`

## Surfaces

- **Canvas** (`#f7f8f9`) — Page-level background, creates a soft off-white field so pure white cards read as lifted
- **Card** (`#ffffff`) — Primary card and nav surface; product mockup backing
- **Accent Wash** (`#c3ece8`) — Teal-tinted decorative band for nav highlights and brand callouts
- **Warm Accent** (`#ffe4d4`) — Peach-tinted card surface for soft feature highlights

## Imagery

Product visualization dominates over photography. The hero centers on a high-fidelity iPhone mockup of the VPN app with floating data cards (time protected, app shortcuts, transferred bytes) arranged in an overlapping constellation around it. Supporting visuals are flat 2D illustrations of the sister product family — simple two-tone icons in rounded square containers on pastel accent surfaces. No lifestyle photography, no abstract gradients beyond the brand red radial. Iconography throughout is line-and-fill hybrid: the red shield logo is a radial gradient mark, while functional UI icons (chevrons, arrows, globe) are single-color Midnight Navy line icons at 16–20px with 1.5–2px stroke. The visual density is text-and-illustration dominant with photography playing no role in the primary conversion path.

## Layout

Centered, max-width 1200px container with full-bleed section bands. Hero is vertically stacked: promo bar → nav → centered headline (FS Kim 64px) → subhead → filled teal CTA → trust badge row → phone mockup with overlapping feature cards. Below the hero, a 'One subscription. Complete protection.' section uses a single-line product family row of 5 evenly spaced icon+label tiles. FAQ section follows as a full-width centered list with hairline dividers, max-width ~800px. Section rhythm is spacious 64–80px vertical gaps on the off-white canvas. The navigation is a static top bar (not sticky) with a separate floating bottom-right chat widget and a fixed bottom cookie consent bar. No sidebar, no mega-menu — dropdowns reveal on hover with a subtle teal accent surface.

## Similar Brands

- **NordVPN** — Same light canvas with a single deep brand color (Nord uses deep blue, ExpressVPN uses forest teal) and diffuse card shadows for a trustworthy security-product feel.
- **ProtonVPN** — Light background with restrained chromatic palette, pill-shaped CTAs, and generous spacing create the same calm, privacy-focused atmosphere.
- **1Password** — Light SaaS surface with rounded 20–24px cards, diffuse ambient shadows, and a single decisive accent color on primary actions.
- **DuckDuckGo** — Bright, spacious, near-monochrome interface that uses a single warm accent for actions; both prioritize trust through visual restraint over spectacle.
- **Notion** — Centered max-width hero with a single display headline, pill-shaped buttons, and hairline-gray dividers structuring long content pages.
