# Upstash — Style Reference
> Emerald terminals in a sunlit workshop — bright white surfaces with one deep green accent that makes every action feel switched on.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Upstash presents a developer-first data platform with a bright, airy workshop aesthetic: white canvas, hairline borders, and a single emerald green accent that does the work of a dozen colors. The brand uses deep forest green (#022c22) for all text — not black — which gives every screen a subtle organic warmth while keeping the identity unmistakably technical. Headlines are massive (up to 180px) and use a compressed custom display cut of Inter Tight with tight tracking, creating a sense of confident engineering scale. Components are deliberately lightweight: pill-shaped controls dominate, borders are 1px and barely visible, shadows are reduced to a whisper (0 1px 2px at 5% opacity). The result is a surface that recedes so code, logos, and product chrome can do the talking.

## Colors

| Name | Value | Role |
|------|-------|------|
| Forest Ink | `#022c22` | All text, headings, and icon strokes — deep desaturated green replaces black throughout the entire interface, giving the system its organic technical warmth |
| Emerald Pulse | `linear-gradient(to right, #007a55, #00bc7d, #f59e0b)` | Green supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color; Hero headline gradient flowing from forest green through emerald to amber — makes the display wordmark feel alive |
| Pine | `#007a55` | Secondary brand green for darker button states, link text, and icon outlines when a heavier weight than Forest Ink is needed |
| Mint Glow | `#34d399` | Light accent green for secondary icons, decorative highlights, and hover state washes |
| Jade Wash | `#10b981` | Mid-green for outlined button borders, checkbox accents, and form focus rings |
| Spearmint | `#6ee7b7` | Lightest green for link hover states and subtle decorative washes |
| Signal Red | `#dc2626` | Red supporting accent for decorative details and low-frequency emphasis. Use as a supporting accent, not as a status color |
| Lilac Whisper | `#e9d5ff` | Soft violet accent for the QStash product icon and category tags that need chromatic separation from the green family |
| Snow | `#ffffff` | Page canvas, card surfaces, and inverse text on dark code blocks |
| Paper | `#f5f5f5` | Subtle alternating section backgrounds and disabled control fills |
| Pale Sage | `#c9dbd6` | Soft green-tinted surface for hero background washes and the gradient tail stop on decorative backgrounds |
| Mint Mist | `#d2f2e7` | Lightest green-tinted background for announcement bars, tag pills, and the hero's left-edge gradient wash |
| Hairline | `#e5e7eb` | Universal 1px border color for cards, inputs, dividers, and table rules — the most used color in the system |
| Graphite | `#71717a` | Muted secondary text, nav items, placeholder text, and subdued icon strokes |
| Carbon | `#3d3d3f` | Darkest neutral for code block backgrounds and high-contrast borders where #000 feels too harsh |
| Obsidian | `#000000` | Code block background only — the single hard-black surface in the system |

## Typography

### Inter — Body text, nav links, buttons, labels, and small UI chrome — the workhorse sans for everything below the heading level
- **Substitute:** system-ui, -apple-system, sans-serif
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 13px, 14px, 16px, 20px, 24px, 48px
- **Line height:** 1.40

### Inter Tight — Display and heading face — the compressed cuts with negative tracking give headlines an engineered, dense quality; the 128px and 180px sizes create the signature 'loud whisper' hero moments where weight 600-700 meets extreme size with restraint
- **Substitute:** Inter, system-ui, sans-serif
- **Weights:** 500, 600, 700
- **Sizes:** 22px, 24px, 30px, 48px, 128px, 180px
- **Line height:** 1.20
- **Letter spacing:** -0.025em

### ui-monospace — Code blocks and inline code — the slightly negative tracking tightens monospace characters for a cleaner, less typewriter-like read
- **Substitute:** JetBrains Mono, Fira Code, monospace
- **Weights:** 400
- **Sizes:** 14px
- **Line height:** 1.50
- **Letter spacing:** -0.073em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | 0px |
| body | — | — | 14px | 1.5 | 0px |
| heading-sm | — | — | 20px | 1.4 | -0.5px |
| heading | — | — | 30px | 1.25 | -0.75px |
| heading-lg | — | — | 48px | 1.2 | -1.2px |
| display | — | — | 128px | 1 | -3.2px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 32px
- **Element gap:** 8px

### Border Radius

- **tabs:** 12px
- **cards:** 16px
- **pills:** 9999px
- **buttons:** 9999px
- **codeBlocks:** 12px
- **smallChips:** 6px

## Components

### Primary Pill Button
**Role:** Main call-to-action

Fully rounded (9999px radius) button, Emerald Pulse (#00bc7d) background, white text, Inter 14px weight 500, 10px 20px padding, optional trailing arrow icon. The single filled action in the system.

### Ghost Outline Button
**Role:** Secondary navigation action

Fully rounded (9999px), transparent background, 1px Jade Wash (#10b981) or Emerald Pulse border, Emerald Pulse text, 14px Inter weight 500. Used for 'Login' in the nav.

### Navigation Bar
**Role:** Top-level site navigation

White (#ffffff) background, 1px Hairline (#e5e7eb) bottom border, 64px height, 1200px max-width container. Logo on left (pill-shaped emerald mark + wordmark), nav links centered in Graphite (#71717a), Login button right-aligned. No shadow, no sticky offset on landing.

### Product Tab Card
**Role:** Category selector for product suite

White background, 1px Hairline border, 16px radius, 20px 24px padding. Contains a colored icon tile (16px) and product name in Forest Ink. Active state shows darker background and Pine text.

### Code Example Block
**Role:** Syntax-highlighted code display

Obsidian (#000000) background, Carbon (#3d3d3f) left sidebar, 12px radius, ui-monospace 14px text with -0.073em letter-spacing. Sidebar shows example categories (Caching, Session Management) as left-aligned tabs with active item highlighted. Tab bar at top shows language toggles (TypeScript/Python).

### Feature Check List
**Role:** Bullet-point feature enumeration

Vertical stack, 8px row gap. Each item: 16px Jade Wash (#10b981) check icon, Forest Ink 14px text. No card background — sits directly on canvas or Paper surface.

### Customer Logo Pill
**Role:** Social proof logo display

White background, 1px Hairline border, 9999px radius, 12px 20px padding. Contains brand logo (max-height 20px) centered. Arranged in 2-3 rows with 12px gap.

### Testimonial Card
**Role:** Customer quote showcase

White background, 1px Hairline border, 16px radius, 48px padding. Centered layout: company logo (32px) at top, quote text in Forest Ink 16px below, attribution and pagination dots at bottom. Dots are 6px circles, active dot is Emerald Pulse.

### Announcement Bar
**Role:** Top-of-page policy update notice

Black background, white 13px text, centered, 40px height. Close button (×) on the right in white.

### Logo Wordmark
**Role:** Brand identity mark

Emerald Pulse circular pin/spiral icon (24px) + 'upstash' wordmark in Forest Ink Inter 600. Icon is a stylized spiral/arrow suggesting motion and data flow.

### Documentation Link Button
**Role:** Secondary action with icon

Ghost style, white background, 1px Hairline border, 12px radius (not pill), 10px 16px padding. Forest Ink 14px text, small document icon left, external link icon right.

### Hero Display Heading
**Role:** Primary page headline

Inter Tight weight 600, 128px or 180px, line-height 1.00, letter-spacing -0.025em. Fill is the Sunset Gradient (#007a55 → #00bc7d → #f59e0b). Text is centered, wraps to 2 lines. This is the visual signature of the brand.

## Do's and Don'ts

### Do
- Use #022c22 Forest Ink for ALL body and heading text — never default to black or #333
- Apply the 9999px pill radius to every button, nav link, and logo chip — pills are the system's defining shape
- Set display headings at 128px+ with Inter Tight weight 600 and the Sunset Gradient fill
- Separate surfaces with 1px #e5e7eb hairline borders, not shadows or background tints
- Use #00bc7d Emerald Pulse as the single filled button color — no other green should ever be a button background
- Space sections 64-96px apart vertically to let the large display type breathe
- Use ui-monospace 14px with -0.073em letter-spacing for all code blocks

### Don't
- Don't use #000000 for text — always use Forest Ink #022c22 to maintain the organic green-warmth
- Don't add drop shadows to cards, modals, or navigation — the system is intentionally flat
- Don't use square or moderately rounded corners (8px) for buttons — pills are mandatory for actions
- Don't apply the Sunset Gradient to anything smaller than 48px — the gradient only works at display scale
- Don't introduce additional accent colors — the system is monochrome green with one red reservation for Redis
- Don't use Inter for display headings — Inter Tight is required for the compressed, tracked-tight quality
- Don't use background color tints to separate sections — alternate between white and #f5f5f5 only

## Elevation

- **Buttons, links, small interactive elements:** `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px`

## Surfaces

- **Canvas** (`#ffffff`) — Primary page background
- **Paper** (`#f5f5f5`) — Alternating section bands and subtle background variation
- **Card** (`#ffffff`) — Elevated card surfaces sitting on canvas, separated by hairline borders
- **Code Surface** (`#000000`) — Dark code example blocks — the only black surface

## Imagery

Photography-free, icon-driven visual language. The only imagery is product chrome: colored SVG icons for products (red Redis hash, orange Vector, purple QStash, violet Workflow, green Box) and customer company logos. Abstract graphics include a subtle wireframe globe/mesh in the 'Fast Anywhere' section. No stock photography, no human faces, no decorative illustrations. The visual weight comes entirely from typography, gradients, and product UI screenshots.

## Similar Brands

- **Vercel** — Same clean white-canvas aesthetic with pill-shaped buttons and monochrome palette punctuated by a single brand accent
- **Linear** — Identical approach to display headings — massive compressed sans-serif with tight tracking, minimal shadows, hairline borders as the only separator
- **Supabase** — Same developer-tools visual language with a single green brand color, dark code blocks, and product-icon-driven navigation
- **Railway** — Same workshop-bright aesthetic with pill controls, generous spacing, and the convention of one chromatic accent against a white canvas
- **PlanetScale** — Both use deep desaturated brand colors for text instead of black, creating the same organic-technical warmth with a single vibrant accent
