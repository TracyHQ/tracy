# Convex — Style Reference
> Cream paper engineering notebook

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Convex presents a warm cream-paper technical workspace: a desaturated beige canvas (#f6f6f6 to #f7f1ff) hosts both product UI and product screenshots, while dark code surfaces (#141414, #292929) carry TypeScript and dashboard previews with syntax-highlight punctuation in pink, violet, green, and yellow. GT America grotesque at whisper-weights creates a calm, editorial engineering voice — tight negative tracking on 40-56px headlines compresses the wordmark into confident, compact blocks. Components are squared and compact: 8-12px radii, thin charcoal borders, and minimal padding produce a blueprint-like density that reads more like a developer's notebook than a marketing site.

## Colors

| Name | Value | Role |
|------|-------|------|
| Ink Black | `#141414` | Primary text, dark card surfaces, code editor backgrounds, filled neutral buttons — the dominant dark across the site |
| Paper White | `#ffffff` | Light supporting surface for subtle backgrounds and section separation. Do not promote it to the primary CTA color |
| Cream Surface | `#f6f6f6` | Page canvas and section backgrounds — warm off-white that distinguishes Convex from cold-white SaaS |
| Lilac Wash | `#f7f1ff` | Subtle tinted background panels, icon wash areas, soft section dividers |
| Charcoal Surface | `#292929` | Secondary dark surfaces, navigation pills, dark-mode code block frames |
| Graphite Border | `#38383a` | Borders on dark surfaces, dividers within code blocks, outlined button strokes on dark fills |
| Slate Text | `#4f4f52` | Secondary body text, nav metadata, subdued labels |
| Fog Text | `#6d6d70` | Muted helper text, tertiary nav items, breadcrumb-style labels |
| Ash Text | `#a9a9ac` | Placeholder text, disabled labels, very low-emphasis metadata |
| Mist Divider | `#e5e5e5` | Hairline dividers, input borders on light surfaces, table row separators |
| Signal Blue | `#69bee2` | Blue supporting accent for decorative details and low-frequency emphasis. Do not promote it to the primary CTA color |
| Plum Button | `#8d2676` | Alternative filled button accent on specific marketing sections — rich magenta against cream |
| Ember Orange | `#de5d33` | Highlight accent on specific CTAs or callout chips — warm complement to the cool blues |
| Hot Pink | `#fc618d` | Red supporting accent for decorative details and low-frequency emphasis |
| Iris Violet | `#948ae3` | Violet supporting accent for decorative details and low-frequency emphasis |
| Mint Green | `#7bd88f` | Green supporting accent for decorative details and low-frequency emphasis |
| Canary Yellow | `#f8e67a` | Yellow supporting accent for decorative details and low-frequency emphasis |
| Dusk Gradient | `linear-gradient(135deg, rgb(34, 31, 29), rgb(49, 43, 43) 28%, rgba(41, 57, 105, 0.9) 50%)` | Dark section background gradient — diagonal fade from warm near-black through charcoal to a cool blue haze |

## Typography

### GT America — Primary typeface for all UI, headings, body, nav, and buttons — grotesque sans with tight optical spacing; weight 400/500 for body, weight 700 reserved for emphasis and button labels
- **Substitute:** Inter, Switzer, or General Sans
- **Weights:** 400, 500, 700
- **Sizes:** 10, 12, 13, 14, 15, 16, 18, 20, 36, 40, 56
- **Line height:** 1.00, 1.25, 1.38, 1.50
- **Letter spacing:** -0.05em at 56px, -0.025em at 40px, 0.025em at 10-12px, 0.05em at 10-12px

### ui-monospace / monospace — Code snippets, terminal output, file paths, inline code — exclusively inside code blocks and developer-facing surfaces
- **Substitute:** JetBrains Mono, IBM Plex Mono
- **Weights:** 400
- **Sizes:** 13
- **Line height:** 1.40
- **Letter spacing:** normal

### monospace — monospace — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 13px
- **Line height:** 1.4

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.25 | 0.5px |
| body | — | — | 14px | 1.5 | 0px |
| body-lg | — | — | 16px | 1.5 | 0px |
| subheading | — | — | 20px | 1.38 | 0px |
| heading | — | — | 36px | 1.25 | -0.9px |
| heading-lg | — | — | 40px | 1.25 | -1px |
| display | — | — | 56px | 1 | -2.8px |

## Spacing & Layout

**Density:** compact

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 12px

### Border Radius

- **nav:** 12px
- **tags:** 4px
- **cards:** 12px
- **inputs:** 4px
- **buttons:** 8px

## Components

### Top Navigation Bar
**Role:** Persistent site header

White (#ffffff) background, 12px radius on dropdown pills, GT America 14px/500 for links in #141414, GitHub stars pill with #292929 dark fill and white star count text. Height ~64px, horizontal padding 24px.

### Ghost Navigation Button (Log in)
**Role:** Secondary nav action

White fill, 1px #d7d7d7 border, 8px radius, GT America 14px/500 in #141414, 8px 16px padding. No shadow, flat appearance.

### Filled Light CTA (Start building)
**Role:** Primary action on light backgrounds

White (#ffffff) fill, #141414 text, GT America 15px/500, 8px radius, 10px 20px padding. Sits on cream canvas and reads as the highest-contrast action available.

### Filled Dark CTA (Learn more)
**Role:** Primary action on cream/light sections

#141414 fill, white text, GT America 15px/500, 8px radius, 10px 20px padding. The default filled CTA across most content sections.

### Blue Signal CTA (Learn more on dark)
**Role:** Primary action on dark gradient sections

#69bee2 fill, #141414 text, GT America 15px/500, 8px radius, 10px 20px padding. The only chromatic filled button; reserved for dark-section hero actions.

### Code Editor Card
**Role:** Product preview — TypeScript IDE

#141414 background, 12px radius, 1px #38383a border, three macOS-style traffic-light dots top-left, file tab strip in #292929, monospace 13px code with syntax colors (hot pink keywords, iris violet types, mint green booleans, canary yellow constants).

### Dashboard Preview Card
**Role:** Product preview — todo app UI

Light card surface #ffffff with #e5e5e5 hairline border, 12px radius, 24px padding. Header bar shows domain (.convex.dev) in #6d6d70 12px, table rows alternate white/#f6f6f6 with 1px #e5e5e5 dividers, blue #69bee2 'Add' button at 8px radius.

### Command Snippet Card (npm create convex)
**Role:** Hero install command

#292929 dark fill, 8px radius, monospace 13px white text, trailing copy icon in #a9a9ac. Sits inline beside the light CTA in the hero.

### Feature Section Card
**Role:** Content card for feature lists

No explicit background (sits on cream canvas), 0 border, GT America 18px/700 heading in #141414, body 15px/400 in #4f4f52, 24px gap between heading and body.

### Dark Gradient Hero Banner
**Role:** Full-bleed dark section with centered headline

Background is the 135deg dusk gradient (#221f1d → #38383a → rgba blue haze), 12px radius for any contained cards, centered GT America 40px/700 white headline, small 'PRODUCT' eyebrow tag in 12px/500 uppercase with 0.05em tracking inside a 1px #38383a pill at 4px radius.

### Chat Prompt Card
**Role:** AI/LLM demo card in feature section

Dark #292929 background, 12px radius, white monospace 13px prompt text, bottom-right 'Try Convex with Chef' CTA where 'Chef' is set in a custom decorative red serif/wordmark.

### GitHub Stars Pill
**Role:** Social proof in nav

White fill, 1px #e5e5e5 border, 8px radius, GitHub octocat icon + '260350 stars' in GT America 13px/500 #141414. Star count separated by hairline divider.

### Code Token
**Role:** Inline syntax highlight element

No background, monospace 13px, color picks from the accent palette: keywords #fc618d, types #948ae3, booleans #7bd88f, constants #f8e67a, strings default #e3d0df.

### Pixel Art Illustration
**Role:** Decorative graphic for LLM feature

Blocky pixel grid on cream #f6f6f6 background, scattered #292929 blocks forming a loose maze/character pattern, accent blocks in #de5d33 and #69bee2. 16px corner radius on the container.

## Do's and Don'ts

### Do
- Use GT America at weight 400/500 for body and 700 for emphasis; never introduce a secondary sans-serif
- Apply -0.05em letter-spacing only at 56px display, -0.025em at 40-36px headings, and 0.025-0.05em on 10-12px uppercase eyebrow labels
- Use 8px radius for buttons and 12px radius for cards and nav pills; reserve 4px for tags and small chips
- Keep dark code blocks on #141414 with monospace 13px and syntax colors from the accent palette
- Use the cream #f6f6f6 canvas as the default page background; only switch to dark sections for explicit product or gradient hero moments
- Use 12px for element gaps within cards, 24px for card internal padding, and 64px between major sections
- Prefer hairline #e5e5e5 borders over shadows for card separation on light surfaces

### Don't
- Do not add drop shadows to cards or buttons — separation comes from color and 1px borders only
- Do not use the syntax highlight colors (pink, violet, green, yellow) outside code blocks — they are semantic, not decorative
- Do not use #69bee2 (signal blue) as a filled CTA on light/cream sections — reserve it for dark-section actions only
- Do not introduce gradients on UI elements other than the documented dusk-gradient dark section background
- Do not use pure black #000000 for large text or backgrounds; #141414 is the darkest allowed tone
- Do not use border radii above 16px — the system is squared and compact, not soft and rounded
- Do not set body text below 14px or above 18px — GT America is tuned for a narrow mid-range scale

## Elevation

Convex deliberately avoids drop shadows. All separation is achieved through surface color contrast (cream → white → dark) and 1px hairline borders in #e5e5e5 or #38383a. This flat treatment reinforces the engineering-notebook aesthetic and keeps the focus on the product screenshots, which carry their own visual depth through code syntax colors.

## Surfaces

- **Canvas** (`#f6f6f6`) — Page-level cream background, default section backdrop
- **Card** (`#ffffff`) — Elevated card surfaces, code editor frames, dashboard panels
- **Tinted Panel** (`#f7f1ff`) — Soft lilac-washed feature panels, icon backgrounds, subtle callout zones
- **Dark Code** (`#141414`) — Code editor interior, dashboard dark-mode preview surfaces
- **Dark Section** (`#292929`) — Full-bleed dark marketing sections with gradient overlay

## Imagery

Convex uses dark product UI screenshots (code editor, dashboard) as the primary visual content — these are the hero elements, not stock photography. The code editor card shows a real TypeScript file with syntax-colored tokens, and the dashboard card shows a live todo app. The only illustrative element is a pixel-art style block grid used in the LLM section, rendered in a retro 8-bit aesthetic with charcoal and accent-color blocks on cream. No lifestyle photography, no abstract 3D renders. Icon style is minimal mono line icons (copy, GitHub octocat) at 1-1.5px stroke weight. Imagery serves as product demonstration rather than decoration — every visual is something a developer would actually see in the product.

## Layout

Max-width 1200px centered container with 24px gutter. Hero is a two-column split: left third holds headline + CTAs + feature accordion, right two-thirds stacks two dark product preview cards (code editor on top, dashboard below) with a slight overlap. Sections alternate between cream-light and dark-gradient full-bleed bands with 64px vertical padding. The LLM section uses a two-column text-left/visual-right pattern with the pixel art on a cream background and a dark chat card overlapping the visual. Navigation is a fixed white top bar with left-aligned logo, center-left nav links, and right-aligned GitHub pill + auth buttons. Component density is compact — feature cards stack tightly with 12-16px gaps rather than generous whitespace.

## Similar Brands

- **Linear** — Same ultra-tight grotesque typography with negative tracking at large sizes, minimal use of shadows, dark product UI screenshots as hero content, and a calm monochrome palette punctuated by one accent color
- **Vercel** — Identical developer-tool DNA: cream/off-white canvas, monospace code blocks front and center, GT America-adjacent geometric sans, and product-preview cards doing the work that photography would do on a consumer site
- **Supabase** — Same dark code-block hero treatment paired with a light content surface, squared 8-12px radii throughout, and a compact density that reads more like documentation than marketing
- **Railway** — Similar warm-neutral page surfaces, terminal/code-first visual language, and a restrained accent palette that appears only on interactive elements and syntax tokens
- **Render** — Same editorial engineering aesthetic — tight grotesque type, cream backgrounds, dark product previews, and minimal decorative chrome that lets the product screenshots breathe
