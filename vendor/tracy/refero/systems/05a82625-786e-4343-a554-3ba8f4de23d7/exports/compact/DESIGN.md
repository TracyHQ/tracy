# NEVERHACK — Style Reference
> encrypted command terminal on cold marble

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

NEVERHACK operates in a stark, high-trust sovereign-cybersecurity register: near-white canvas, near-black navy type (#0a0f1f), and a single electric violet (#6b2bea) that activates only for AI surface. Hierarchy is carved through weight and scale, not decoration — the 72px display headlines paired with a quiet 11–17px body voice create a clinical, operator-grade tension. Components feel like equipment, not marketing: pill-shaped controls, hairline borders on cool gray (#e5e7eb), and a distinctive purple-tinted shadow system (rgba(40,30,93,*)) that makes every elevated surface feel on-brand rather than generic. A muted signal red (#dc2626) is reserved exclusively for critical/emergency semantics — CERT, crisis, hazard — so it never gets confused with the violet brand voice.

## Colors

| Name | Value | Role |
|------|-------|------|
| Sovereign Ink | `#0a0f1f` | Primary text, headlines, nav, core UI — near-black with a barely-perceptible blue cast that separates it from pure black and lets violet accents feel native |
| Signal White | `#ffffff` | Card surfaces, elevated panels, button text on dark fills |
| Mist Surface | `#f6f7fc` | Page canvas, soft card backgrounds, subtle wash sections |
| Cool Hairline | `#e5e7eb` | Borders, dividers, input outlines, structural separators — the single neutral that holds the whole UI together |
| Shadow Lichen | `#d8d7e2` | Card inset shadow tint, quiet elevation layer |
| Carbon Gray | `#4e4e4e` | Secondary text, supporting copy, muted labels |
| Ash Gray | `#999999` | Button shadow tint, disabled affordances, tertiary text |
| Sovereign Violet | `linear-gradient(rgba(107, 43, 234, 0.06) 0%, rgb(247, 248, 252) 100%)` | Brand accent, AI surface highlights, chat response fills, decorative strokes, badge dots, icon accents — defines the AI-native identity; Hero section ambient gradient: fades from a 6%-opacity violet into Mist Surface, signaling AI atmosphere without hard color blocking |
| Violet Wash | `#afa9fd` | Tinted backgrounds for AI-adjacent surfaces, soft highlight washes, capability tags |
| Cyber Cyan | `#28d3fe` | Blue wash for highlight backgrounds, decorative bands, and soft emphasis behind content. Do not promote it to the primary CTA color |
| Alert Crimson | `radial-gradient(circle at 70% 35%, rgba(220, 38, 38, 0.22) 0%, rgba(0, 0, 0, 0) 60%)` | Critical/emergency state only — CERT badges, crisis CTAs, hazard indicators. Never used decoratively; its scarcity is its meaning; Radial emergency glow behind critical badges — 22% opacity at upper-right, fading to transparent |
| Crimson Glow | `#f4baba` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Info Blue | `#2563eb` | Informational badges, neutral data callouts, non-critical status indicators |

## Typography

### Roobert — Single-family system. Roobert's geometric-humanist forms handle the full scale from 11px micro-labels to 72px display headlines. The custom face's slightly condensed proportions and subtle stroke contrast make headlines feel like terminal readouts rather than marketing copy. Weight 400 carries most UI; weight 500 is reserved for nav items, button labels, and emphasis. Letter-spacing tightens aggressively as size grows: -0.03em at 72px down to neutral at body sizes; micro-labels and ALL-CAPS badges open up to +0.08–0.12em for legibility
- **Substitute:** Inter (closest free alternative), then Söhne or General Sans
- **Weights:** 400, 500
- **Sizes:** 11px, 12px, 13px, 14px, 15px, 16px, 17px, 18px, 22px, 24px, 32px, 34px, 40px, 52px, 72px
- **Line height:** 1.00–1.63 (display: 1.00–1.08, headings: 1.20–1.45, body: 1.50–1.63)
- **Letter spacing:** Display 72px: -2.16px (-0.03em); 52px: -1.30px (-0.025em); 40px: -0.80px (-0.02em); 32px: -0.48px (-0.015em); 24px: -0.24px (-0.01em); 18–22px: -0.09px (-0.005em); 14–17px: 0; ALL-CAPS badges/eyebrows: +0.88 to +1.32px (+0.08 to +0.12em)

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.55 | 0.88px |
| body-sm | — | — | 14px | 1.55 | 0px |
| body | — | — | 16px | 1.6 | 0px |
| body-lg | — | — | 18px | 1.63 | -0.09px |
| subheading | — | — | 22px | 1.45 | -0.11px |
| heading-sm | — | — | 24px | 1.3 | -0.24px |
| heading | — | — | 32px | 1.2 | -0.48px |
| heading-lg | — | — | 40px | 1.12 | -0.8px |
| display | — | — | 52px | 1.08 | -1.3px |
| display-xl | — | — | 72px | 1 | -2.16px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 32px
- **Element gap:** 12px

### Border Radius

- **cards:** 14px
- **badges:** 9999px
- **buttons:** 9999px
- **nav-pills:** 18px
- **inner-cards:** 10px
- **small-elements:** 6px

## Components

### Primary Filled Button (Dark)
**Role:** Default CTA for key actions: 'Ask PROMETHEUS', 'How we work', 'Explore capabilities'

Pill-shaped, 9999px radius, Sovereign Ink (#0a0f1f) fill, Signal White (#ffffff) text, 12px 24px padding, Roobert 15px weight 500. Subtle elevation: rgba(0,0,0,0.4) 0px 0px 1px + rgba(0,0,0,0.08) 0px 4px 8px. Acts as the grounded counterpart to violet AI surface.

### Ghost Outlined Button
**Role:** Secondary CTA, paired alongside primary dark button

Pill shape, transparent fill, 1px Sovereign Ink border, Sovereign Ink text, 12px 24px padding, 15px weight 500. No shadow. Pairs with the dark CTA to form the standard two-button hero/section pattern.

### Nav Pill Button (Active State)
**Role:** Active nav highlight, as seen on 'Cyber AI' in header

Pill shape with 18px radius (or 9999px for fully rounded), 8px 16px padding, Sovereign Ink fill, Signal White text, 13px weight 500. The slightly tighter radius vs other pills makes it feel more like a tab.

### Alert Emergency Button
**Role:** Reserved for CERT/crisis actions only — 'Activate emergency response'

Pill shape, 9999px radius, Alert Crimson (#dc2626) fill, Signal White text, 12px 24px padding, 15px weight 500. Elevated with soft warm red shadow tint. Never use for standard CTAs — its scarcity preserves urgency.

### Capability Card
**Role:** Three-up feature cards in 'End-to-end cyber coverage' section

14px border radius, white surface, 1px Cool Hairline (#e5e7eb) border, 32px internal padding. Elevated with the brand purple-tinted shadow: rgba(40,30,93,0.04) 0px 4px 12px -4px + rgba(0,0,0,0.03) 0px 1px 2px. Contains an eyebrow label (12px ALL-CAPS +0.08em), a 22–24px heading, body copy, and a 'Learn more →' link.

### Highlight Card (Capability Expanded)
**Role:** Larger 'Technology Resale' style card with sub-list and visual treatment

16–20px border radius, Mist Surface (#f6f7fc) or white fill, 1px Cool Hairline border, generous 32–40px padding. Contains a violet dot indicator, heading, description, and an embedded sub-card with numbered list (01/02/03). The sub-card uses 10px radius and lighter surface for nesting.

### Principle Card
**Role:** Three-column principle cards in 'Three principles, one operating standard'

No visible border or background — pure typographic structure on canvas. Each card: short colored top-underline (violet, blue, or cyan, 2–3px tall, ~24px wide), 24–32px heading, body copy below. The color underline is the only decorative anchor.

### Chat Surface (AI Interaction)
**Role:** Hero chat widget showing AI conversation

Rounded card ~18px radius, white surface, multi-layer purple-tinted shadow stack. Contains: a light gray (#e5e7eb) user message bubble (rounded ~14px), a vibrant Sovereign Violet (#6b2bea) AI response bubble (rounded ~14px, white text), and a message input with a subtle 1px border. The violet bubble is the strongest brand-color moment on the page.

### Eyebrow Label / Tag
**Role:** ALL-CAPS section identifiers: 'SOVEREIGN CYBERSECURITY & AI', 'CAPABILITIES'

12px Roobert weight 500, ALL-CAPS, +0.12em letter-spacing, Sovereign Violet (#6b2bea) or Carbon Gray color. No background, no border. Sets context before each major section.

### Category Badge
**Role:** Tag above capability card titles: 'AI', 'MSP', 'CRITICAL'

Inline pill, small radius (~6px), 10px vertical / 12px horizontal padding, 11–12px weight 500, ALL-CAPS +0.08em. Color signals category: violet-tinted for AI, neutral for MSP, crimson-tinted for CRITICAL.

### Sector Ticker Bar
**Role:** Horizontal scrolling industry sector labels: 'Finance, Health, Industry, Telecoms...'

Borderless row on white, single 1px top + bottom hairline in Cool Hairline. Each label: 13–14px Roobert weight 400, Carbon Gray, 24–32px horizontal padding. Repetition is the visual — no decoration needed.

### Top Banner (Notification)
**Role:** Slim announcement bar at very top of page

Thin band (~40px), white or very light background, 1px bottom border. Centered text: 12–13px, contains a violet sparkle/dot icon and a violet 'Access the report →' link.

### Header / Navigation Bar
**Role:** Primary site navigation

White background, 1px bottom border Cool Hairline, ~64–72px height. Left: NEVERHACK wordmark + N monogram. Center: 6–7 nav items in 15px weight 500 Sovereign Ink. Right: ghost 'Sign in' text, three text nav items, one dark 'Cyber AI' pill, 'Contact' text. Logo mark is a stylized 'N' in negative space within a square.

### Input Field (Chat Input)
**Role:** Message entry in chat widget

Pill shape (~999px radius), white fill, 1px Cool Hairline border, 12–16px padding. Placeholder 'Enter your message' in 14px Carbon Gray. Optional icon buttons (up-arrow submit, mic) at right edge, 32×32 hit targets.

## Do's and Don'ts

### Do
- Use 9999px radius for all interactive elements: buttons, badges, chat input, nav pills
- Set the primary CTA to Sovereign Ink (#0a0f1f) on Signal White text — never let Alert Crimson become the default action
- Apply the purple-tinted shadow stack (rgba(40,30,93,*) values) to all elevated cards and chat surfaces for brand-coherent depth
- Tighten letter-spacing aggressively at large sizes: -0.03em at 72px, -0.025em at 52px, -0.02em at 40px
- Open letter-spacing on ALL-CAPS eyebrows and badges: +0.08 to +0.12em for legibility at small sizes
- Reserve Alert Crimson (#dc2626) exclusively for CERT, crisis, emergency, and hazard contexts — its rarity is the signal
- Use Sovereign Violet (#6b2bea) as the AI signature: chat responses, brand dots, capability tags, decorative strokes

### Don't
- Don't use Alert Crimson for non-critical actions, marketing copy, or decorative emphasis — it loses meaning through overuse
- Don't pair Sovereign Violet with Alert Crimson in the same component — the two chromatic accents must stay in separate semantic lanes
- Don't add shadows to text, icons, or small UI elements — elevation belongs only on cards, chat surfaces, and the primary CTA
- Don't use 72px or 52px display sizes for sub-headings or section intros — those are hero-only; step down to 32–40px for section openers
- Don't introduce new chromatic colors beyond the defined palette — the 5% colorfulness is the brand contract
- Don't use pure black (#000000) for body text — Sovereign Ink (#0a0f1f) is the only acceptable text color; black is reserved for nav border accents and button micro-details
- Don't apply soft radius (6–14px) to buttons or interactive controls — only cards, inputs, and nested elements use measured radii

## Elevation

- **Primary Button (Dark):** `rgba(0, 0, 0, 0.4) 0px 0px 1px 0px, rgba(0, 0, 0, 0.08) 0px 4px 8px 0px`
- **Capability Card:** `rgba(40, 30, 93, 0.04) 0px 4px 12px -4px, rgba(0, 0, 0, 0.03) 0px 1px 2px 0px`
- **Chat / AI Surface:** `rgba(40, 30, 93, 0.25) 0px 30px 45px -30px, rgba(0, 0, 0, 0.1) 0px 18px 36px -18px`
- **Inset Card Border:** `rgb(235, 232, 228) 0px 0px 0px 0.5px inset, rgba(0, 0, 0, 0.04) 0px 1px 1px 0px, rgba(0, 0, 0, 0.04) 0px 4px 4px 0px`
- **Body Text Subtle Lift:** `rgba(40, 30, 93, 0.06) 0px 1px 2px 0px`

## Surfaces

- **Page Canvas** (`#f6f7fc`) — Base page background, subtle off-white with cool cast that separates content from pure white surfaces
- **Card Surface** (`#ffffff`) — Default card and panel background, chat widget, elevated content blocks
- **Nested Surface** (`#f6f7fc`) — Sub-cards inside larger cards, inset content, visual differentiation within parent surfaces
- **Tinted Wash** (`#afa9fd`) — Sparse highlight surfaces for AI context, capability tag backgrounds — use only for emphasis, never as full sections

## Imagery

Visuals are sparse and purposeful: abstract 3D gradient orbs (violet-to-blue and crimson-to-pink) appear as card hero images, tightly cropped in rounded containers. No lifestyle photography, no people, no real-world environments. The visual language is: glowing liquid-metal sculptures on pure color, suggesting AI computation and threat energy. Icons are thin-line monochrome (1.5px stroke) in Sovereign Ink, with occasional violet accent. The overall density is text-dominant — imagery punctuates rather than narrates, occupying roughly 20% of any given section.

## Layout

Max-width 1200px centered, generous section gaps (80px+) between bands. Hero is a two-column split: left holds eyebrow + 52–72px display headline + body + two-button group; right holds the floating AI chat widget, vertically centered against the headline. Sections alternate between full-width white bands and subtle Mist Surface (#f6f7fc) washes, separated by hairline borders rather than heavy dividers. Feature sections use a 3-column card grid with equal-width cards and consistent 12–24px gutters. Principle sections drop to borderless 3-column typographic grids. Sector ticker sits as a single full-width borderless row between hero and content. Navigation is a sticky top bar with right-aligned utility nav and one dark accent pill marking the current context.

## Similar Brands

- **CrowdStrike** — Same sovereign-cybersecurity register: dark navy type on white canvas, pill-shaped controls, hairline borders, and a single accent color reserved for threat/AI context
- **Anthropic** — Near-identical chat-surface treatment with violet AI response bubbles, restrained palette, and 72px display headlines paired with quiet 15–17px body text
- **Linear** — Same pill-button geometry, hairline border system, and the discipline of using one chromatic accent (violet here, purple there) against a near-monochrome neutral system
- **Hugging Face** — Same comfortable density with 4px base, generous card padding, and the practice of letting eyebrows and badges carry the only chromatic punctuation
- **Palantir** — Same operator-grade typographic tension: oversized display headlines with 1.00 line-height next to clinical body copy, signal red reserved exclusively for critical state
