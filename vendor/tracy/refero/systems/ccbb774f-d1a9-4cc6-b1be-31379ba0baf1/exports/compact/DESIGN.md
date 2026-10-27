# Sandclock — Style Reference
> DeFi command terminal at midnight — green signal lights on a matte black console

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Sandclock is a DeFi yield terminal dressed in matte black: near-zero chrome, one vivid mint-green signal color, and typography that does all the work. The interface reads like a Bloomberg terminal reimagined for DeFi — dark canvas (#0a0a0a), hairline graphite borders (#222222), flat surfaces with no decorative elevation, and Inter for utility text paired with a custom Aeonik display face for the rare 72px headline. Green (#3fe280) appears as functional punctuation only: active nav underline, primary CTAs, and accent borders on live stat cards. Every other surface stays achromatic so the green reads as a live signal, not decoration. Components feel like a trading dashboard — compact, information-dense in numbers, but breathing with generous section gaps. No gradients, no drop shadows beyond a single subtle button lift, no colorful illustration chrome. Trust is communicated through restraint: the design says 'your money is here' by staying quiet.

## Colors

| Name | Value | Role |
|------|-------|------|
| Abyss | `#0a0a0a` | Page canvas and primary background — the entire site lives on this near-black surface so the mint accent reads as a live signal against pure darkness |
| Carbon | `#171717` | Elevated card and panel surface — used for stat cards, security badges, and announcement containers that need to lift off the canvas without introducing color |
| Graphite | `#222222` | Hairline borders, dividers, and the highest-frequency structural color in the system. Carries 356 borderColor uses — it is the wireframe that defines every container |
| Ash | `#9b9b9b` | Muted secondary text, helper labels, and de-emphasized nav items. The only non-white text color — reserves #ffffff for content that must be read first |
| Chalk | `#ffffff` | Primary text, icons, and the Connect Wallet button fill. Maximum contrast against Abyss (19.8:1) ensures legibility on the darkest possible surface |
| Signal Mint | `#3fe280` | Sole chromatic accent — active nav underline, primary CTA fills (Start Earning), and the highlight border on the TVL stat card. Appears sparingly so each instance reads as a live, money-moving action rather than decoration |

## Typography

### Aeonik — Display headlines (hero). Used exactly once on the page at 72px — custom face with tight tracking makes the financial-app statement feel engineered rather than templated. The 400 weight at this size is the signature choice: other finance sites use 600-800 bold; Sandclock whispers authority instead.
- **Substitute:** Satoshi (Indian Type Foundry) or General Sans
- **Weights:** 400
- **Sizes:** 72px
- **Line height:** 1.00
- **Letter spacing:** -0.025em

### Inter — All UI text — body, buttons, nav, card content, subheadings, and section headings. The positive 0.05em tracking on Inter is unusual for body copy and gives labels a slightly technical, instrument-panel quality rather than editorial warmth. Weight 500 is reserved for emphasis (CTA labels, section titles); 400 carries everything else.
- **Substitute:** DM Sans or system-ui
- **Weights:** 400, 500
- **Sizes:** 14px, 16px, 20px, 24px, 36px
- **Line height:** 1.11, 1.33, 1.40, 1.43, 1.50
- **Letter spacing:** 0.05em

### DM Sans — Minimal secondary usage — likely a single element or fallback. Not a primary type voice.
- **Substitute:** Inter
- **Weights:** 500
- **Sizes:** 16px
- **Line height:** 1.20

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 14px | 1.43 | 0.7px |
| body | — | — | 16px | 1.5 | 0.8px |
| subheading | — | — | 20px | 1.4 | 1px |
| heading-sm | — | — | 24px | 1.33 | 1.2px |
| heading | — | — | 36px | 1.11 | 1.8px |
| display | — | — | 72px | 1 | -1.8px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 48-64px
- **Card padding:** 16px
- **Element gap:** 16px

### Border Radius

- **cards:** 12px
- **pills:** 9999px
- **buttons:** 16px
- **heroButton:** 64px

## Components

### Primary CTA Button
**Role:** Filled button for the single most important action on a page (Start Earning, Connect)

Background #3fe280 (Signal Mint), text #0a0a0a (Abyss) for inverted contrast. Inter 500 at 16px, letter-spacing 0.05em. Padding 12px 24px. Border-radius 16px. No shadow. Green-on-dark makes the button pop as the only colored element on screen — visual priority is immediate.

### Ghost Button
**Role:** Secondary action paired with a Primary CTA (Buy QUARTZ)

Transparent background, 1px border in #222222 (Graphite), text #ffffff. Inter 500 at 16px. Padding 12px 24px. Border-radius 16px. A small icon precedes the label. Reads as a quiet companion to the green CTA — same shape, muted chrome.

### Connect Wallet Button
**Role:** Persistent wallet-connection action in the top-right nav

White fill #ffffff with #0a0a0a text — inverted from the rest of the dark UI. Inter 500 at 16px. Border-radius 9999px (full pill). The white pill in a sea of dark surfaces is the only high-contrast non-CTA on the page; it functions as a global utility, not a content action.

### Navigation Link
**Role:** Top-bar nav items (Home, Earn, Staking, Docs)

Inter 400 at 16px, #ffffff text. Active state: 3px solid #3fe280 bottom border — the only place green appears in nav. Inactive links carry no underline. The green underline is a live signal that mirrors the mint CTAs below.

### TVL Stat Card
**Role:** Highlighted live-data card showing protocol metrics

Background #171717 (Carbon), 1px border #3fe280 (Signal Mint) — the green border is the signal. Internal layout: small Ash label (14px, uppercase tracking) above a large white value (36px Inter 500). Padding 16-24px. Border-radius 12px. The green border should be reserved for cards showing live, money-bearing numbers.

### Generic Card
**Role:** Default elevated container for content groups

Background #171717 (Carbon), 1px border #222222 (Graphite). Border-radius 12px. Padding 16px. No shadow. Hairline border rather than elevation — the system communicates layer depth with color shift, not drop shadow.

### Announcement Card
**Role:** News/partner tiles with image hero and text body

Background #171717, border-radius 12px. Top half: full-bleed image or gradient artwork (allowed break from the no-imagery rule — external partnership visuals). Bottom half: small pill badge (Announcement / Security) in Graphite with white text, then heading (20px Inter 500, white) and body (14px Inter 400, Ash). Padding 16px on text block.

### Security Badge Tile
**Role:** Trust-signal cards (Safe data, SOC2 Compliant, Insured by Schwarzs child)

Background #171717, border-radius 12px. Centered icon in a small circle at top, single line of white label text below. No border, no shadow. Icon color: #ffffff or accent blue (the SOC2 badge uses a brand-blue circle as the one permissible color exception for third-party certification marks).

### Announcement Tag
**Role:** Small pill badge above announcement card headings

Background #222222 (Graphite), text #ffffff, Inter 500 at 12px. Padding 4px 12px. Border-radius 9999px (pill). Used to categorize cards (Announcement, Security) — never colored, always neutral.

### Partner Logo Strip
**Role:** Horizontal row of third-party protocol logos (AAVE, LIDO, Compound, Morpho)

White logos (#ffffff) on Abyss canvas, evenly distributed across full width. No borders, no separators — just the logos and breathing room. Functions as a trust-by-association strip below the hero.

### Feature Icon Block
**Role:** Small icon-plus-label units used in feature lists

White or Signal Mint icon (16-20px) paired with white label text (14px Inter 400). 4-8px gap between icon and text. Aligned to a vertical rhythm. No background or border — lives directly on the canvas.

## Do's and Don'ts

### Do
- Use Signal Mint #3fe280 only for: primary CTAs, active nav indicators, and the border on live-data stat cards. Every other surface stays achromatic.
- Set Inter letter-spacing to 0.05em on all text — this technical tracking is what differentiates the type from generic SaaS body copy.
- Use 12px border-radius for all cards and 16px for all buttons. Do not mix in 8px or 4px — the 12/16 split is the geometry signature.
- Use Aeonik 400 at 72px for hero-level display text only. Never use Aeonik for subheadings or body — it is reserved for the single statement moment per page.
- Default to #0a0a0a canvas with #171717 cards and #222222 hairline borders. Communicate layer depth with color shift, not shadow.
- Apply generous 48-64px section gaps. The density reads 'comfortable,' not compact — money products need breathing room.
- Place the Connect Wallet action as a white pill (9999px radius) in the top-right — it is the only inverted-color UI element allowed in nav.

### Don't
- Do not use Signal Mint for body text, icons, or decorative shapes. Green is a signal, not a theme color.
- Do not introduce drop shadows on cards, modals, or panels. Flat surfaces are a deliberate financial-trust convention.
- Do not use gradients. The system is deliberately flat; a gradient would break the terminal aesthetic.
- Do not set Inter letter-spacing to normal or negative. The 0.05em positive tracking is a signature choice.
- Do not use Ash #9b9b9b for anything longer than a short helper label — reserve it for de-emphasized text only.
- Do not apply border-radius below 12px on containers or below 16px on buttons. The system is geometrically opinionated.
- Do not use Aeonik weights above 400. The display face works at 400 because the size (72px) carries the weight; bolding would over-shout.

## Elevation

- **Primary CTA Button:** `rgba(24, 39, 75, 0.08) 0px 2px 3px 0px`

## Surfaces

- **Abyss** (`#0a0a0a`) — Full-bleed page canvas
- **Carbon** (`#171717`) — Cards, stat panels, and announcement containers
- **Graphite** (`#222222`) — Hairline borders and divider lines

## Imagery

Imagery is minimal and used only for partnership/announcement content. The site has no product photography, no lifestyle imagery, no illustration chrome — it is a text-and-data UI. The only visual content comes from third-party announcement cards (earth/aurora gradients, certification marks) which are external assets, not system design. The hero and core product surfaces are pure typography on Abyss. Icons throughout are monochrome line icons in white, used sparingly as functional markers. The overall density is text-dominant with data (TVL, stETH Exposure) taking visual priority over decorative imagery.

## Layout

Max-width ~1200px centered container on a full-bleed Abyss canvas. Hero follows a two-column split: large 72px Aeonik headline left, supporting copy + dual CTA stack right. Below the hero, a partner logo strip spans full container width with even horizontal distribution. Content sections are single-column, centered headings, with feature/icon blocks in 2-3 column grids. The TVL stat card is full-width with green border emphasis. Announcement cards use a 3-column grid. Vertical rhythm is generous — 48-64px between major sections. Navigation is a minimal top bar with left-aligned logo, center-left nav links, and a right-aligned Connect Wallet pill. No sticky behavior is evident beyond the standard top bar.

## Similar Brands

- **Aave** — Same DeFi dark-mode terminal aesthetic with hairline borders, flat surfaces, and a single accent color reserved for live protocol signals
- **Lido Finance** — Identical financial-product restraint — Abyss canvas, white-on-dark typography hierarchy, generous spacing, and zero decorative imagery
- **Yearn Finance** — Same vault-product visual language: compact data cards, green as a money-movement signal, and Inter for utility text
- **Coinbase Advanced** — Similar trading-desk dark UI with monospace-leaning typography and Signal-Mint-style accent for active actions
