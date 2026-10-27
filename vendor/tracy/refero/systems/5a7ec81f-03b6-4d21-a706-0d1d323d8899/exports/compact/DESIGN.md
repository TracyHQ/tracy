# Turso — Style Reference
> Terminal glow in a server closet — the mint LED on a rack of dark steel.

**Theme:** dark

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Turso operates in a deep-space developer console aesthetic: near-black canvas with subtle teal undertones, a single vivid mint accent that acts as the system's 'powered on' signal, and a secondary electric magenta for beta/experimental framing. The interface stays quiet and typographic — white text on dark surfaces carries the content — while color appears only as functional punctuation for headings, badges, primary actions, and the thin colored borders that define product cards. Components feel light and terminal-like: pill buttons, thin outlined cards with a one-pixel gradient edge, monospace-flecked code snippets, and flat surfaces without drop-shadow elevation. The result reads as an infrastructure product designed by people who think in terminals — restrained, confident, and unmistakably dark.

## Colors

| Name | Value | Role |
|------|-------|------|
| Deep Space | `#0d1318` | Page background, deepest canvas layer, link-on-light contrast |
| Obsidian | `#121b1f` | Hero and large content surface, slightly lifted from canvas |
| Carbon Teal | `#162129` | Card surface, button hover backgrounds, elevated containers |
| Slate Drift | `#283945` | Subtle borders, dividers, muted panel borders, ghost button surfaces |
| Bone White | `#ffffff` | Primary text, icon strokes, button text, nav labels |
| Ash Gray | `#c5cace` | Secondary text, link default state, muted body |
| Fog Gray | `#b6b8ba` | Tertiary text, nav helper labels, subtle metadata |
| Smoke Gray | `#86898c` | Muted paragraph text, de-emphasized descriptions |
| Pewter | `#9ea1a3` | Disabled or low-emphasis body text |
| Mint Signal | `#4ff7d1` | Teal supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Deep Teal | `#0e342d` | Muted teal surface for announcement banner, subtle teal-tinted backgrounds |
| Electric Magenta | `#d946ef` | Secondary accent — beta badges, inline code highlights, experimental product card, code snippet button |
| Plum Edge | `#a21caf` | Chromatic card border for the open-source / self-hosted product variant |

## Typography

### Inter — Single typeface across the entire system. Weight 800 at 72px for hero headlines, weight 600-700 for product card titles and section headings, weight 500 for nav and labels, weight 400 for body and descriptions. Consistent -0.025em tracking tightens the geometric forms and gives the dark UI a compressed, technical feel.
- **Substitute:** Inter (Google Fonts)
- **Weights:** 400, 500, 600, 700, 800
- **Sizes:** 12, 14, 16, 18, 20, 24, 30, 36, 48, 72
- **Line height:** 1.20, 1.33, 1.50, 1.60, 1.78
- **Letter spacing:** -0.025em applied globally across the type scale

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.5 | -0.3px |
| body-sm | — | — | 14px | 1.5 | -0.35px |
| body | — | — | 16px | 1.6 | -0.4px |
| body-lg | — | — | 18px | 1.78 | -0.45px |
| subheading | — | — | 24px | 1.33 | -0.6px |
| heading-sm | — | — | 30px | 1.2 | -0.75px |
| heading | — | — | 36px | 1.2 | -0.9px |
| heading-lg | — | — | 48px | 1.11 | -1.2px |
| display | — | — | 72px | 1 | -1.8px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 40px
- **Element gap:** 16px

### Border Radius

- **nav:** 24px
- **cards:** 16px
- **badges:** 9999px
- **buttons:** 9999px
- **smallCards:** 12px

## Components

### Announcement Banner
**Role:** Top-of-page promo strip

Full-width band on a deep teal-tinted surface (#0e342d border tone over #0d1318). Centered text in 14px Inter weight 500, white with a teal underlined link. Zero vertical padding beyond 8px top/bottom. Used exclusively for beta or launch promotions.

### Primary Navigation Bar
**Role:** Top-level site navigation

Horizontal bar on the deepest canvas. Logo (teal bull icon + white 'turso' wordmark) left-aligned, nav links (Docs, Cloud, Pricing, Blog, Changelog) in 14px Inter weight 500, social icons, 'Login' text link, and a teal filled pill button 'Get Started' right-aligned. Links hover to white from a muted gray default.

### Pill Ghost Nav Link
**Role:** Inactive navigation item

Transparent background, text in #b6b8ba, 14px Inter weight 500, no border. Hover transitions text to #ffffff. No background fill on any state.

### Filled Teal CTA Button
**Role:** Primary action

Background #4ff7d1, text #0d1318 (near-black for AAA contrast), 14px Inter weight 600, 9999px border-radius, 10px vertical / 20px horizontal padding. No shadow. The single highest-prominence chromatic element in the system.

### Filled Magenta Secondary Button
**Role:** Secondary action, code-related call

Background #d946ef, text #0d1318, 14px Inter weight 600, 9999px border-radius, 8px 16px padding. Used for copy-to-clipboard code buttons and experimental/beta CTAs where the teal is already occupied by the primary action.

### Hero Badge
**Role:** Contextual label above hero headline

Pill-shaped (9999px radius), 12px Inter weight 500, text in teal #4ff7d1 on a #0e342d / #162129 tinted background. Optional hairline border in teal. Carries a short descriptor like 'The Database for the Age of AI Agents.'

### Hero Headline
**Role:** Primary page headline

72px Inter weight 800, color #4ff7d1, line-height 1.00, letter-spacing -1.8px. Centered. The display-scale choice that defines the brand voice — mint-on-black, maximally compressed.

### Product Card — Teal Variant
**Role:** Feature card for the cloud / production product

Background #121b1f, 1px solid #4ff7d1 border (the signature colored-edge treatment), 16px border-radius, 40px internal padding. Contains a teal pill badge ('PRODUCTION READY'), 30px Inter weight 700 title in white, 16px body in #86898c, and a teal filled CTA button at the bottom.

### Product Card — Magenta Variant
**Role:** Feature card for the open-source / self-hosted product

Same structure as the teal card but with a #a21caf (deep plum) border. Contains a magenta #d946ef pill badge ('BETA'), a code snippet block, and a GitHub star count button in ghost style.

### Pill Badge
**Role:** Status, version, or category label

9999px border-radius, 6-8px vertical / 14-16px horizontal padding, 12px Inter weight 600, uppercase or title-case. Two variants: teal-on-dark-teal (#4ff7d1 text on #0e342d surface) and magenta-on-dark-magenta (#d946ef text on a #1c2b34 / #0d1318 surface).

### Code Snippet Block
**Role:** Terminal-style command display

Background #162129, 12px border-radius, 1px #283945 border, 16px padding. Monospaced text in white with the command in white and flags/options in a muted gray. Often paired with a magenta copy button overlapping the right edge.

### Inline Text Link
**Role:** In-prose hyperlink

No underline by default. Text in #c5cace (secondary white). On hover, transitions to #4ff7d1 teal. Some in-prose links use the teal as the resting state to emphasize a product or feature name.

### Social Icon Button
**Role:** External link to GitHub, X, Discord

16-20px monochrome icon, white or #b6b8ba stroke, no background, no border, no padding. Used in the nav bar. Hover brightens to #ffffff.

### Logo Trust Grid
**Role:** Social proof / integration partners

Multi-column grid (4-5 columns) of partner logos in monochrome white or #b6b8ba, evenly spaced with ~40px vertical and ~48px horizontal gap. Logos sit on the page canvas directly — no card containers — to keep the section feeling like a developer credibility wall, not a marketing strip.

### Ghost Text Button
**Role:** Tertiary action, low-emphasis link-button

Transparent background, no border, text in #ffffff, 14px Inter weight 500, optional 4px 8px padding. Sits beside primary CTAs as a 'Schedule a Call' alternative path.

## Do's and Don'ts

### Do
- Use #4ff7d1 as the single primary action background and brand voice color — one CTA per viewport section.
- Set all buttons and badges to 9999px border-radius; use 12px for code blocks and 16px for product cards.
- Reserve -0.025em letter-spacing globally; tighten further at display sizes (-1.8px at 72px).
- Build product card distinction through 1px colored borders (#4ff7d1 or #a21caf) on a flat #121b1f surface — never use drop shadows.
- Use Inter weight 800 only for the hero display headline; use 600-700 for product card titles, 400-500 for everything else.
- Keep #d946ef magenta scoped to beta labels, code-adjacent buttons, and the self-hosted product card — never as a general accent.
- Maintain 80px section gaps and 40px card padding as the rhythm anchors for comfortable dark-mode reading.

### Don't
- Do not introduce drop shadows or elevation glows — depth comes from surface tone shifts and colored borders only.
- Do not use #4ff7d1 for body text or long-form paragraphs — reserve teal for headlines, links, and the CTA background.
- Do not mix the teal and magenta on the same surface element; they signal distinct product variants and must stay segregated.
- Do not use radii other than the four values: 9999px, 24px, 16px, 12px. No 4px or 8px rounding.
- Do not set body text below #86898c — anything dimmer fails contrast on the dark canvas.
- Do not use chromatic colors for borders on anything other than product cards; UI dividers stay in #283945.
- Do not introduce additional accent hues — the two-color chromatic system (mint + magenta) is the entire brand language.

## Elevation

Turso avoids drop-shadow elevation entirely. Depth is communicated through surface tonal shifts (canvas → card → elevated) and thin 1px colored borders on key cards. The teal and magenta border edges act as the only 'lifted' signal — the card itself is flat, but its colored perimeter says 'this is a distinct product variant.' This flat-with-colored-edge treatment keeps the UI feeling terminal-adjacent rather than app-like.

## Surfaces

- **Deep Space** (`#0d1318`) — Outermost page canvas
- **Obsidian** (`#121b1f`) — Hero and large content sections with the subtle inner-border treatment
- **Carbon Teal** (`#162129`) — Product cards, code snippet containers, elevated content blocks
- **Slate Drift** (`#283945`) — Hairline borders, ghost surfaces, nav pill backgrounds

## Imagery

No photography, no illustrations, no 3D renders. The visual system is pure UI: typography, colored borders, and a monochrome partner-logo trust grid. Icons are thin-stroke single-color (1.5-2px stroke weight) in white or teal, used sparingly in nav and product cards. Code snippets double as the primary visual texture — monospaced text in dark panels is the site's only 'imagery' equivalent.

## Layout

Centered, max-width 1200px contained layout with a full-bleed dark canvas. The hero is a centered text stack: announcement banner → nav → pill badge → 72px teal headline → two-paragraph description in muted gray → dual CTA row → 4-column partner logo grid. Below the hero, content sections alternate between centered text blocks and 2-column product card grids. Product cards are equal-width siblings in a 2-up grid with a 24-40px gap. Sections are separated by 80px vertical gaps with no dividers — the dark canvas flows continuously, with section identity carried by typography scale and the two product card border colors rather than surface color changes.

## Similar Brands

- **Supabase** — Same dark-canvas devtool aesthetic with a single vivid brand color (Supabase's green, Turso's mint) carrying the primary action and headline.
- **Fly.io** — Terminal-adjacent dark mode, flat surfaces without drop-shadow elevation, and a thin colored border treatment on feature cards.
- **PlanetScale** — Developer-focused dark UI with high-contrast white-on-near-black typography and a single saturated accent (PlanetScale's purple) used sparingly on CTAs and links.
- **Cloudflare** — Dense technical content on a near-black canvas with restrained chromatic accents that signal interactivity rather than decoration.
- **Vercel** — Pill-shaped buttons (9999px radius), near-monochrome dark surfaces, and a quiet single-accent approach that lets the accent do all the chromatic work.
