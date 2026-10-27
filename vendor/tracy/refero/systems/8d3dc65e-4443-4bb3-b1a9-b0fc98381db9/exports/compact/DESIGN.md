# Empower — Style Reference
> Chartreuse zine on midnight paper

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Tilt is a high-contrast financial brand built on three tonal registers: deep matte-black stages for emotional photography, warm cream paper for product education, and a single punchy chartreuse (#e4e24e) that acts as the system's only chromatic voice. The visual hierarchy is extreme — a 205px Gravity display headline commands the dark hero while supporting text settles into an unusually narrow extended sans-serif (GTAmericaExtendedRegular) that gives body copy a condensed, almost editorial feel. Photography is documentary-style real people, shot close, annotated with hand-placed price-tag pills (+$200, +$900) — the product literally hangs from their collars. The system feels like a fintech zine: confident, slightly retro, paper-warm, with yellow used sparingly to make CTAs feel switched on rather than branded.

## Colors

| Name | Value | Role |
|------|-------|------|
| Chartreuse Pulse | `#e4e24e` | Primary CTA fill, active states, highlight tags, product accent cards — the only saturated color in the system, used at 100% saturation to make every action feel deliberate |
| Lemon Cream | `#faf9b6` | Soft highlight wash for product feature cards and emphasis panels — a 70%-diluted chartreuse that carries the same hue without competing with CTAs |
| Midnight Ink | `#100f0f` | Primary text, icon strokes, dominant borders, dark hero and footer backgrounds — near-black with a barely-warm tint |
| Obsidian | `#000000` | Hard borders, focus rings, maximum-contrast text on light surfaces — pure black for structural edges |
| Bone Paper | `#fffdf6` | Default page canvas, light section backgrounds — warm off-white with a cream bias that pairs with the yellow accent |
| Pure White | `#ffffff` | Elevated card surfaces, product illustration cards, content blocks sitting on the bone canvas |
| Stone | `#64635c` | Secondary text, muted helper copy, subdued borders, inactive tab labels |
| Charcoal | `#3a3a3a` | Tertiary borders, dimmed UI affordances, body-level low-emphasis elements |
| Iron | `#262525` | Deep card surface for dark mode product showcases — sits one step above pure black |
| Smoke | `#171616` | Hero and footer background fill — a hair lighter than Midnight Ink, used where the page needs depth without going pure black |

## Typography

### Gravity — Display headlines — only the 900 black weight is used, always at extreme sizes (96–205px) with tight negative tracking (-0.0210em to -0.006em) and 1.0 line-height. The 205px hero size is the system's signature moment. Substitute: Mona Sans Black, Inter Black, or a compressed geometric display like Druk
- **Weights:** 900
- **Sizes:** 16px, 24px, 40px, 48px, 96px, 205px
- **Line height:** 1.00, 1.50
- **Letter spacing:** -0.21em at 96px, -0.006em at 205px
- **OpenType features:** `"dlig"`

### EmpowerSerif — Companion serif for display moments — used at the same monumental scale as Gravity to create editorial contrast between a geometric sans and a humanist serif. Substitute: GT Super, Tiempos Headline, or Reckless
- **Weights:** 400, 600
- **Sizes:** 16px, 40px, 96px, 205px
- **Line height:** 1.00, 1.50
- **Letter spacing:** -0.006em

### GTAmericaExtendedRegular — Primary body and subheading sans-serif at 16–21px with negative tracking (-0.019em to -0.015em). The extended/condensed width gives body copy a distinctive narrow rhythm. Substitute: Inter, Söhne, or GT America Regular
- **Weights:** 400
- **Sizes:** 11px, 13px, 16px, 18px, 20px, 21px, 26px
- **Line height:** 1.20–1.50
- **Letter spacing:** -0.015em at body, -0.030em at smallest sizes
- **OpenType features:** `"dlig"`

### GTAmericaExpandedMedium — Buttons, nav links, and small-caps style labels at 11–13px with positive tracking (+0.094em to +0.10em) at the 11–12px size for an ALL-CAPS tracked-out feel; relaxes to negative tracking at 16px body. The expanded width and tracked caps give UI chrome an open, airy counterpoint to the narrow body. Substitute: Inter Medium in all-caps with letter-spacing, or GT America Expanded
- **Weights:** 400, 500
- **Sizes:** 11px, 12px, 13px, 16px
- **Line height:** 1.50–1.82
- **Letter spacing:** +0.10em at 11px caps, -0.023em at 16px

### GTAmericaExtendedMedium — Mid-size section headings at 36px — a single-purpose weight for h2-level emphasis. Substitute: GT America Extended Medium, Inter SemiBold
- **Weights:** 500
- **Sizes:** 36px
- **Line height:** 1.11
- **Letter spacing:** -0.007em

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 11px | 1.5 | 1.1px |
| body | — | — | 16px | 1.5 | -0.304px |
| body-lg | — | — | 18px | 1.48 | -0.342px |
| subheading | — | — | 21px | 1.38 | -0.63px |
| heading-sm | — | — | 26px | 1.33 | -0.78px |
| heading | — | — | 36px | 1.11 | -0.252px |
| display | — | — | 96px | 1 | -2.016px |
| display-xl | — | — | 205px | 1 | -1.23px |

## Spacing & Layout

**Base unit:** 8px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 64px
- **Card padding:** 24px
- **Element gap:** 16px

### Border Radius

- **tags:** 9999px
- **cards:** 24px
- **inputs:** 16px
- **buttons:** 9999px
- **productCards:** 40px

## Components

### Chartreuse Pill Button
**Role:** Primary CTA — every action that moves a user forward

Background #e4e24, text #100f0f, border-radius 9999px, padding 12px 20px, font GTAmericaExpandedMedium 13px weight 500 with -0.019em tracking. No shadow, no gradient — the chartreuse fill on the cream/bone canvas is enough contrast. The pill shape is non-negotiable across all CTA variants.

### Ghost Outlined Button
**Role:** Secondary action — Log In, supporting nav actions

Background transparent, text #100f0f, border 1.5px solid #100f0f, border-radius 9999px, padding 12px 20px, font GTAmericaExpandedMedium 13px weight 500. Used when two actions sit side-by-side and one must recede.

### Dark Canvas Hero Section
**Role:** Full-bleed emotional stage for the brand's primary message

Background #171616, headline in Gravity 900 at 96–205px in #fffdf6, supporting subhead in GTAmericaExtendedRegular 18–21px in #fffdf6 at 60–70% opacity. Photography of real people is arranged as a mosaic, each portrait carrying a floating pill tag.

### Money Tag Pill
**Role:** In-photo annotation that signals a dollar amount tied to a person or moment

White pill (#ffffff) with rounded-square or pill radius, containing a small chartreuse circular avatar + dollar sign + amount in #100f0f. Font 11–13px bold. Floats over photos as a hand-placed graphic element — a visual signature of the brand.

### Product Feature Card
**Role:** Individual product (Cash Advance, Line of Credit, Credit Cards) showcased in a tabbed layout

Card surface #ffffff or #faf9b6, border-radius 24–40px, padding 24–40px. When filled with the chartreuse wash (#faf9b6) the card becomes the visual hero of the product; when white it recedes. Contains a phone-mockup illustration, headline, CTA pill.

### Product Tab Pill Group
**Role:** Tabbed navigation between product offerings

Three pills (CASH ADVANCE, LINE OF CREDIT, CREDIT CARDS) in a single row. Active tab: filled #100f0f with #fffdf6 text. Inactive: transparent with #100f0f text, 1px border. Font GTAmericaExpandedMedium 11px, tracked +0.10em in uppercase. Border-radius 9999px.

### Eyebrow Label
**Role:** Small all-caps section identifier above a heading

Text only, no background. Font GTAmericaExpandedMedium 11–13px weight 500, uppercase, letter-spacing +0.10em, color #64635c. Examples: 'OUR PRODUCTS', 'TERMS OF SERVICE'. Sits 16–24px above the section heading.

### Trustpilot Rating Block
**Role:** Social proof band embedded in the hero

Centered horizontal cluster: 'Excellent' in #fffdf6 13px + five green star squares (Trustpilot brand green) + 'Trustpilot' wordmark. No card or container — floats directly on the dark hero.

### Social Icon Tile
**Role:** Footer social links (TikTok, X, Instagram, LinkedIn, YouTube)

Circular 40px tiles, background #e4e24, icon glyph in #100f0f stroke or fill. Arranged in a horizontal row at the bottom-right of the footer.

### Navigation Bar
**Role:** Top-level site navigation on a dark stage

Background transparent over the dark hero. Logo 'Tilt' in a custom script at far left, nav links centered in GTAmericaExpandedMedium 13px uppercase +0.10em in #fffdf6, then Log In ghost button + Get Started chartreuse pill on the right. Bottom border 1px #100f0f only when transitioning to a light section.

### Legal/Footer Block
**Role:** Dark footer with fine print and legal links

Background #171616, body text in #64635c at 11–13px, line-height 1.5, copyright in #fffdf6. Headings (Terms of Service, Privacy) in #fffdf6 weight 500, font-size 16–18px. Generous padding: 64px horizontal, 48–64px vertical.

### Phone Mockup Product Card
**Role:** Product illustration card showing app UI on a phone

White card (#ffffff) containing a vertically-oriented phone mockup at roughly 240×500px, with a chartreuse (#faf9b6 or #e4e24e) background block behind the phone. The phone screen shows eligibility/amount UI. Border-radius of the card is 24–40px.

## Do's and Don'ts

### Do
- Use Gravity 900 at 96–205px for the single hero headline per page — do not split the 205px moment across multiple lines smaller than 96px
- Use #e4e24 chartreuse exclusively for the primary CTA pill and for product highlight cards; never apply it to body text or large background areas
- Set border-radius to 9999px for every button, tag, and tab — pills are non-negotiable in this system
- Use GTAmericaExpandedMedium at 11–13px with +0.10em tracking in uppercase for all eyebrows, nav, and button labels
- Stack the dark stage (#171616) and light stage (#fffdf6) as alternating full-width bands; never blend them with gradients
- Add floating chartreuse or white money-tag pills (+$200, +$900) directly on photography to anchor a person to a dollar amount
- Set section vertical rhythm at 64px between major bands, 32px between sub-sections, 16–24px between content elements

### Don't
- Do not use any chromatic color other than #e4e24 and its diluted wash #faf9b6 — the system is monochrome + chartreuse
- Do not use Gravity at sizes below 96px — it loses its impact and competes with the heading weight
- Do not use square or small-radius buttons — every interactive element is a pill (9999px) or a card (24–40px)
- Do not use #ffffff as a page background — the canvas must be #fffdf6 cream; white is reserved for elevated cards
- Do not use drop shadows on cards or buttons — depth comes from surface color shifts (#fffdf6 → #ffffff → #faf9b6), never from shadow
- Do not mix the extended and expanded sans-serifs within the same text block — extended is for body and subheadings, expanded is for UI chrome and labels
- Do not center-align body paragraphs — left-align at all sizes; centering is reserved for the hero headline and short eyebrow labels

## Elevation

The system uses no drop shadows. Depth and hierarchy are built entirely through surface color steps: #171616 (dark stage) → #fffdf6 (light canvas) → #ffffff (elevated card) → #faf9b6 (highlight card) → #e4e24 (CTA surface). This shadowless approach keeps the visual language flat and editorial — closer to print zine design than traditional SaaS UI. Components that would normally rely on shadow to feel clickable instead use the chartreuse fill to signal interactivity.

## Surfaces

- **Smoke Stage** (`#171616`) — Dark hero and footer — the dramatic stage for the brand's emotional photography
- **Bone Canvas** (`#fffdf6`) — Default page background — the warm cream that fills the light half of the site
- **White Card** (`#ffffff`) — Elevated product cards and content blocks sitting on the bone canvas
- **Lemon Wash** (`#faf9b6`) — Accent product highlight cards — the diluted chartreuse used to draw the eye to one product per section
- **Chartreuse** (`#e4e24`) — Full-saturation CTA and tag surface — the brightest, most attention-commanding layer

## Imagery

Documentary-style portrait photography of real working people (mechanics, creatives, parents) shot close to camera, often mid-action, with natural lighting. Photos are placed as a mosaic on the dark hero, each portrait annotated with a floating chartreuse or white money-tag pill showing a dollar amount. No lifestyle stock imagery, no abstract backgrounds — the human is the hero. Product illustrations consist of phone mockups on chartreuse washes, clean and flat, no 3D or skeuomorphism. Icons are flat, single-color (#100f0f on light, #fffdf6 on dark), no multicolor or illustrated iconography. The visual language deliberately reads as a financial zine: gritty photography + bold typography + one accent color.

## Layout

The page alternates between two full-bleed stages: a dark Smoke Stage (#171616) carrying the hero, footer, and emotional photography bands, and a light Bone Stage (#fffdf6) carrying the product education and tab sections. The hero is a centered headline (96–205px Gravity) with a surrounding photo mosaic — text and portraits share the same dark canvas. Below the hero, content shifts to max-width 1200px centered containers on cream. Product showcases use a two-column card layout (text left, illustration card right) within a tabbed pill group. Vertical rhythm is 64px between major bands, 32px between sub-blocks. Navigation is a single transparent top bar that sits on the dark hero and gains a hairline border when transitioning to a light section. The system is zine-like in its confidence — every section declares its tonal register before you read a word.

## Similar Brands

- **Cash App** — Same chartreuse-as-only-accent approach on a near-black stage, pill-shaped CTAs, and editorial zine energy
- **Chime** — Warm cream canvas paired with a single bold accent and condensed extended sans-serif body type
- **Affirm** — Documentary portrait photography with floating monetary annotations, large display headlines, and a matte-dark hero band
- **Plaid** — Mono-color product UI with one bright accent, pill buttons, and shadowless surface layering instead of elevation
- **Step** — Gen-Z financial brand that pairs saturated lime-yellow with warm off-white canvas and oversized condensed type
