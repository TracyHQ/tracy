# Design System Inspired by JA Kinetic

> Category: Developer Tools
> Observability and developer platform. Near-neutral grounds, one saturated accent per colourway, tight geometric display over a humanist body, monospace everywhere a machine speaks.

## 1. Visual Theme & Atmosphere

JA Kinetic is a developer-tool language. The page is a near-neutral ground, almost never pure white and almost never pure black, and every surface above it is separated by a 1px hairline rather than by a shadow. One saturated accent does all the signalling: links, eyebrows, primary buttons, check bullets, active navigation, the logo glyph. Nothing else in the chrome is chromatic.

It ships dark by default. The `default` and `signal` Site profiles set `other_default_theme` to `dark` (`etc/site/default.json`), so the near-black `#0A0D0C` ground with a lime `#A3E635` accent is the design's home state, and the light mode is the variant. Both are complete token sets, and the switch flips the root element before paint.

The system's second move is that it ships one grammar in three colourways, called directions, selected by a `data-style` attribute that `index.php:54` always writes on `<html>`: `terminal` (olive and lime), `blueprint` (indigo), `signal` (cyan). A direction is a full palette swap, not a hue rotation: ground, text, hairline and grid all move with the accent. The chrome, by contrast, does not: the header, megamenu, drawer and footer run on a separate seven-token neutral set that stays on the terminal values in every direction.

Typography is a three-family split with no serif in it. Space Grotesk carries display at weight 700 with negative tracking that scales with size. IBM Plex Sans carries reading and every control. JetBrains Mono carries everything a machine would have printed: the `// observability, reimagined` eyebrow above almost every section title, chips, stat values, table headers, and the code and log panels that are the system's signature component.

**Key Characteristics:**
- Off-white canvas (`#FBFCFA`) in light and a near-black canvas (`#0A0D0C`) in dark, with a pure-white or `#121614` card and a tinted band as the third tier
- One saturated accent per direction (`#4D7C0F` olive light, `#A3E635` lime dark for the shipped `terminal`), and no second chromatic colour in the chrome
- Space Grotesk 700 display with NEGATIVE tracking (h1 at -1.5px) over IBM Plex Sans body at 1.55 leading
- A monospace eyebrow, uppercase and tracked +2px, above almost every section title
- Flat cards: a 1px hairline on the surface token, no resting shadow anywhere, exactly one shadow token in the whole design
- A rounded-rectangle ladder (8 / 12 / 16px); the pill is reserved for status badges, not for buttons
- A faint 30px line grid behind the hero and every page masthead, plus a single lime radial glow in the hero
- An 80px section rhythm that holds unbroken to 620px, then drops to 56px everywhere at once
- Code panels, terminal windows, status dots and incident timelines used as content, not as decoration
- A dark mode that is a pure token remap, and that is the shipped default

## 2. Color Palette & Roles

> **Source:** the unprefixed custom-property set on `:root, html[data-style="terminal"]` (`scss/_kinetic.scss:15-33`, compiled to `css/template.css:19310-19341`) and its dark remap under `html.t4-dark` (`scss/darkmode.scss:8-20`, compiled to `css/darkmode.css:1-26`). The T4 Theme keys in `etc/theme/default.json` ship equal to the terminal light values and reach only T4's generic classes.

### Primary
- **Olive** (`#4D7C0F`) light / **Lime** (`#A3E635`) dark: links, eyebrows, primary buttons, check bullets, active navigation, the logo glyph. 61 uses in the compiled CSS.
- **Olive Deep** (`#3F6A0A`) light / **Lime Bright** (`#BCF25A`) dark: the hover tone. A fixed second value, never computed from the primary.
- **Accent Ink** (`#FFFFFF`) light / (`#0A0D0C`) dark: the label on the accent fill. It inverts, because a white label on lime would fail contrast.

### Secondary & Accent
- **Leaf** (`#65A30D`): the template's own `--accent`, a second, brighter green for decorative marks beside the primary. It is not a semantic colour, and it is not remapped in terminal dark.
- **Line Grid** (`rgba(16,20,15,.04)` light, `rgba(255,255,255,.035)` dark): the two 1px gradients on a 30px pitch behind the hero and every masthead.

### Surface & Background
- **Off-white Canvas** (`#FBFCFA`): the page in light. Deliberately not `#FFFFFF`, so a white card reads as a card with no shadow to help it.
- **Paper White** (`#FFFFFF`): cards, code panels, the megamenu panel, the drawer.
- **Tinted Band** (`#F2F5EE`): raised bands, table hover rows, ghost-button hover, icon chips. Cool, not warm.
- **Night Canvas** (`#0A0D0C`), **Night Card** (`#121614`), **Night Band** (`#0F1311`): the three dark counterparts.
- **Footer Ground** (`#F2F5EE` light, `#161B18` dark): a chrome token, and the one chrome value that does not equal its body counterpart. In dark the footer is lighter than the band, so it lifts off the page.

### Neutrals & Text
- **Body Ink** (`#46514B` light, `#9AA6A1` dark): body copy, header menu links, table cells.
- **Heading Ink** (`#10140F` light, `#F2F5F3` dark): headings only. Darker than the body ink in light, lighter in dark.
- **Muted** (`#7C877F` light, `#5F6B66` dark): captions, meta, chip labels, code-panel comments. There is only one quiet ink in this design.
- **Hairline** (`#E4E8E0` light, `#232A27` dark): every card edge, table rule, field edge, ghost-button border and the header divider.

### Semantic & Accent
- **Success** (`#30A46C`), **Warning** (`#F5A623`), **Danger** (`#E5484D`): the template's shared status literals (`scss/_kinetic.scss:31`). They are direction-independent and they are NOT remapped in dark, on purpose: a green "operational" dot has to stay green in the indigo and cyan colourways.
- **Up** (`#16A34A`): a fourth status literal for an upward metric delta. It has no schema slot and is not bound in `tokens.css`; use `--success` for it, or declare it as a local extension.
- **Focus** (`rgba(77,124,15,.25)`): a 3px ring, drawn as a box-shadow. Always olive, in every direction and both modes, because the upstream `--primary-rgb` it interpolates is never declared. See section 9.

### The other two directions
Full palettes, not tints. Swap the whole column, never a single value.

| token | blueprint light | blueprint dark | signal light | signal dark |
|---|---|---|---|---|
| `--bg` | `#FAFAFB` | `#0B0D14` | `#F7FAFC` | `#0A0F1A` |
| `--surface` | `#FFFFFF` | `#12141E` | `#FFFFFF` | `#0F1626` |
| `--surface-warm` | `#F3F4F8` | `#161925` | `#EDF3F8` | `#121A2C` |
| `--fg` | `#57606E` | `#9AA1B3` | `#41506A` | `#93A0B8` |
| `--fg-2` | `#0F1117` | `#EEF0F6` | `#06121F` | `#EAF1FB` |
| `--muted` | `#9AA1AD` | `#646B7D` | `#7D8AA0` | `#566179` |
| `--border` | `#E4E7EC` | `#242838` | `#DBE5EE` | `#1E2A41` |
| `--accent` | `#4F46E5` | `#6366F1` | `#0891B2` | `#22D3EE` |
| `--accent-hover` | `#3F37CF` | `#7C7EF5` | `#0B7E9B` | `#56E0F4` |
| `--accent-on` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#04141A` |
| `--accent-secondary` | `#7C3AED` | `#A78BFA` | `#6366F1` | `#818CF8` |

Source: `scss/_kinetic.scss:35-49` and `scss/darkmode.scss:22-44`.

### Gradient System
- There is no decorative gradient in the brand layer, with one exception: the hero carries a single radial glow, `radial-gradient(120% 100% at 80% 0%, rgba(163,230,53,.12), transparent 60%)`, laid under the line grid (`acm/hero/css/style.css:11-19`). It is a hard-coded lime in every direction and in both modes.
- The line grid itself is built from two linear gradients at 1px, which is a texture, not a gradient in the visual sense.

## 3. Typography Rules

### Font Family
- **Display Family:** `Space Grotesk`, fallbacks `system-ui, -apple-system, "Segoe UI", sans-serif`
- **Body Family:** `IBM Plex Sans`, fallbacks `system-ui, -apple-system, "Segoe UI", sans-serif`
- **Mono Family:** `JetBrains Mono`, fallbacks `ui-monospace, "SFMono-Regular", Menlo, monospace`
- **Usage Split:** Space Grotesk carries every heading and the hero title. IBM Plex Sans carries body copy, the header menu and every control. JetBrains Mono carries eyebrows, chips, stat values, table headers, the code and log panels, and the pricing badge: everything a machine would have printed.

### Hierarchy
| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Hero / h1 | 52px | 700 | 1.04 | -1.5px | Steps to 38px below 860px |
| Section / h2 | 38px | 700 | 1.08 | -1px | Steps to 30px below 860px |
| Plan price | 40px | 700 | 1.04 | -1px | Pricing block |
| Block title | 28px | 700 | 1.08 | -1px | Most ACM section headers |
| h3 | 23px | 600 | 1.3 | -0.5px | Card and panel titles |
| Plan name / card title | 20px | 600 | 1.3 | -0.5px | Pricing, teams, testimonials |
| h4 | 19px | 600 | 1.3 | -0.3px | Sub-headings, brand wordmark |
| Hero lead | 17px | 400 | 1.6 | 0 | Steps to 15px below 860px |
| Body Primary | 16px | 400 | 1.55 | 0 | Standard body |
| Control / menu / cell | 14px | 400-600 | 1.2 | 0 | Buttons at 600, menu at 400 |
| Code panel line | 13.5px | 400 | 1.6 | 0 | Monospace |
| Eyebrow | 12.5px | 400 | 1 | +2px, uppercase | Monospace, accent-coloured |
| Chip / plan badge | 11px | 400-600 | 1 | +1px, uppercase | Monospace |

### Principles
- **Tracking is negative and it scales.** The display face tightens as it grows: -1.5px at 52, -1px at 38, -0.5px at 23, -0.3px at 19. Set at 0 it stops looking like this system.
- **The monospace is the counter-move.** The eyebrow runs at +2px, the widest tracking in the design, against a display that runs at -1.5px. That tension is the whole visual idea.
- **Body leading is 1.55, not 1.65.** This is a product page, not a magazine. Loosening it toward editorial values softens the system in the wrong direction.
- **Weight ladder is short.** 700 for display, 600 for controls, sub-headings and card titles, 400 for everything read in sentences and for the monospace. There is no light weight anywhere.
- **Three families, three jobs, no serif.** A serif anywhere in this system reads as a different product.

### Note on Font Substitutes
- All three families are free and load from one Google Fonts `@import` at `scss/_kinetic.scss:9` (compiled to `css/template.css:20`). `fonts/` ships no local file, so if that request fails the page renders in the system sans and loses the display character entirely.
- The three Kinetic Site profiles set `dont_use_google_font: true`, so T4 itself adds no font request, and a family chosen in the T4 Site settings screen is not loaded. The three families are also written literally in hundreds of block-CSS rules, so a font change through the admin reaches plain body text and plain headings only.
- When substituting the display face, keep a geometric sans with a large x-height that survives negative tracking. A humanist or grotesque face at -1.5px collides.

## 4. Component Stylings

### Buttons
- **Primary:** accent fill, accent-ink label, 8px radius (NOT a pill), 14px IBM Plex Sans at weight 600, 11px by 18px padding, an 8px gap to an optional icon. Hover swaps to the fixed hover tone. (`scss/_kinetic.scss:120-126`.)
- **Ghost:** transparent fill, heading-ink label, a 1px hairline border; hover fills with the tinted band. (`:127-128`.)
- **Header CTA:** the same primary button, held at the right end of the header bar, beside a plain "Sign in" link. It is hidden below 992px and repeated inside the drawer.
- **Pressed Behavior:** none is declared. The template has no pressed colour for its own buttons; the schema's `--accent-active` is bound to the hover value as an honest proposal.

### Cards & Containers
- **Card:** `var(--surface)` with a 1px hairline, 12px radius, 26px by 28px padding, and NO resting shadow. Depth comes from the border and the ground change, never from a stack.
- **Large card:** the same at 16px radius. Pricing plans and the "Every plan includes" bar use it.
- **Chip:** a monospace 11px label in a 8px-radius box with a hairline border and muted text. The quiet counterpart to the card.
- **Code panel:** the signature component. A surface card at 12px radius with a window bar (three coloured lights, a muted 12px monospace filename, a hairline below) over a 13.5px monospace body with syntax colours drawn from the accent, the warning and the info literals. This is the one component the design spends its single shadow token on.
- **Band:** a full-width section that swaps the ground to the tinted band while the 1240px container stays constant.

### Inputs & Forms
- **Fields:** surface fill, hairline border, 8px radius, body ink, muted placeholder. Focus adds the 3px olive ring as a box-shadow.
- **Newsletter form:** a single email field and a primary button side by side, the most common form in the design.
- **Density Strategy:** forms are rare and quiet. The persuasion is carried by the code panels, the stat rows and the incident timeline, not by controls.

### Navigation
- **Primary Site Nav:** a sticky 66px bar on the chrome ground, carrying a left logo lockup (a 26px accent glyph plus a 19px Space Grotesk wordmark at -0.5px), a horizontal menu of 14px IBM Plex Sans links in 8px-radius hit boxes, a theme toggle, and the header CTA at the right.
- **Mega Panel:** on the chrome surface with the chrome hairline.
- **Off-canvas Drawer:** below 992px the menu collapses into a drawer on the chrome surface, and the header CTA is repeated inside it.
- **Link Hierarchy:** menu links are chrome text and turn chrome heading on hover and active; the accent appears only on the CTA and the logo glyph.

### Image Treatment
- **Panel images:** the hero and the split block each show one product screenshot, and they ship three of them, one per direction, selected by `html[data-style]`. There is no photography in the system.
- **Line grid:** the hero and every page masthead sit on the two-gradient grid instead of an image.
- **Avatars:** round, `object-fit: cover`, with an initials fallback in the teams and testimonials blocks.

### Other Distinctive Components (the 20 ACM blocks)
The template ships 20 blocks, none of them a carousel and none of them with a script. Most open with `.hx-section` (80px) inside `.hx-container` (1240px).

| block | what it renders |
|---|---|
| `hero` | eyebrow, h1, sub, two buttons, a trust line, and a per-direction panel image on a 1 : 1.12 split |
| `bento` | a 2-column tile grid (style-1) or a 4-column editorial grid with a featured tall tile and a spark-line stat tile (style-2) |
| `features-intro` | icon cards with title, text and a stat, at 2, 3 or 4 columns |
| `features-ledger` | three layouts: stat cards, numbered ruled spec rows, or one card of stat columns |
| `kineticql-split` | copy with accent check bullets and a CTA beside a per-direction panel image |
| `incident-timeline` | 3 or 4 timeline steps with an icon node, time, phase, status badge, title and text, joined by a connector line |
| `pricing` | three plan cards, a fixed "MOST POPULAR" pill badge, a 40px price, a per-line feature list, and an "Every plan includes" bar |
| `pricing-matrix` | a 3-column comparison table where a cell reading `yes` draws a check and `no` a dash |
| `clients` | a logo strip with a caption, then a CSS-animated ticker band (style-1), or integration cards grouped by heading (style-2) |
| `teams` | member cards with avatar or initials, name, role, bio and social links, at 2 to 4 columns |
| `testimonials` | the first quote as a large hero card, the rest stacked beside it |
| `accordion` | an FAQ list of native `<details>` rows with optional group headings, no script |
| `faq-support` | a centred card with a life-buoy icon, title, sub and one button |
| `cta` | eyebrow, title, sub, primary button, a monospace `$` command chip and a ghost button; a `card` or a full-bleed `band` variant |
| `prose-quote` | a ruled header, rich-text body and a pull quote with attribution |
| `page-masthead` | eyebrow, h1 and sub on the line grid, centred or left |
| `header-cta` | the "Sign in" link and "Start free" button in the header |
| `footernews` | a newsletter title, text and email form |
| `footerlegal` | copyright text and legal links |
| `social` | the footer brand lockup and social icon tiles, pinned to the chrome tokens |

## 5. Layout Principles

### Spacing System
- Base unit is `8px` (`--global-spacing`, `css/template.css:17632`), and the grids land on its multiples: 4px rail gap, 8px button gap, 16px stat and bento gap, 24px column gap, 32px container gutter, 48px split gap.
- 12px and 20px are the two odd steps. 20px is the phone container gutter; both appear as block gaps throughout `acm/*/css/style.css`.
- Card padding is 26px by 28px and is not part of the ramp.

### Grid & Container
- **One container width:** 1240px, declared as both a token (`--content-max`) and the `.hx-container` max-width, and re-asserted with `!important` on the three block families that had drifted off it.
- **One gutter:** 32px at every width down to 620px, where it drops to 20px. The header uses the same pair.
- **Grids:** hero and splits 1 : 1.12 or 1 : 1 stepping to one column at 860px; bento 4 to 2 to 1; feature and team grids 4 or 3 to 2 to 1; the incident timeline 4 to 1 at 760px.

### Whitespace Philosophy
- **Band pacing:** 80px above and below a section is the default, and the CTA block is the one that opts down, to 56px at 991px and 48px at 620px.
- **One breakpoint for rhythm:** at 620px the section rule is redeclared once and every band follows.
- **Contrast-led separation:** sections are separated by a change of ground (canvas, card, tinted band) or by a hairline, never by a decorative divider.

### Border Radius Scale
- **8px:** buttons, chips, header nav hit boxes, small tiles.
- **12px:** cards and code panels.
- **16px:** large cards, pricing plans, the includes bar.
- **100px:** status pills and the plan badge only.
- Component-local steps exist at 9px (pricing feature rows) and 10px (Joomla alerts). The signature shape is the rounded rectangle; the pill is a badge shape here, not a button shape.

## 6. Depth & Elevation

| Level | Treatment | Use |
|------|-----------|-----|
| Level 0 | A 1px hairline on a surface token, no shadow | Every card, every field, the table rules, the header divider |
| Level 1 | A ground change (canvas to card to tinted band) | Bands, hover rows, chips |
| Level 2 | The single shadow token, `0 18px 44px -20px rgba(20,30,15,.2)` | Code panels and the few tiles that lift on hover |
| Level 3 | None. The design declares no third step | |
| Accessibility | A 3px `rgba(77,124,15,.25)` ring as a box-shadow | Keyboard focus on inputs, buttons and links |

Depth is almost entirely absent, and that is the point: this is a system that separates things with a line, the way a terminal does.

### Decorative Depth
- The one atmospheric effect is the hero: the 34px line grid over a lime radial glow, both full bleed on the section wrapper rather than clipped to the content column.
- In dark the single shadow deepens from 20% to 60% black with a shorter spread, because a 20% shadow is invisible on `#0A0D0C`.

## 7. Do's and Don'ts

### Do
- Design dark first. Dark is the shipped default in two of the three Site profiles.
- Keep the three grounds honest: the canvas is never pure white, the card is, and the band is the third tier.
- Put a monospace eyebrow above a section title. It is the cheapest way to make a band read as part of this system.
- Track the display face negatively, and let the tightening scale with the size.
- Use a 1px hairline where another system would use a shadow.
- Let a code panel, a log line or a status dot do the persuading; that is the content of this design.
- Bind every colour to a token, so a direction swap and the dark remap both keep working.

### Don't
- Don't introduce a serif, or a fourth family.
- Don't make the primary button a pill. The pill here is a status badge, and swapping the two breaks the reading of both.
- Don't mix directions. The indigo accent on the terminal ground is not a variant, it is a mistake: ground, hairline and grid all move with the accent.
- Don't build a descending grey ramp from the heading ink; it is the darker of the pair in light and the lighter in dark.
- Don't compute the hover tone from the accent. It is a separate bound value, and a re-skin has to move both.
- Don't stack shadows to signal importance. Change the ground, or add a hairline.
- Don't paint a literal colour where a token exists: a literal breaks the other two directions AND dark mode at once. This is the template's own first rule.
- Don't re-skin through the T4 Theme screen alone. It moves `.btn.btn-primary`, plain links and the `.bg-*` classes and nothing else.

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Phone | 620px and below | Section rhythm drops to 56px, container gutter to 20px, bento and most grids to one column |
| Phone Wide | 621px to 759px | Grids at two columns; the container is still at the 32px gutter |
| Tablet | 760px to 859px | The incident timeline goes to one column and its connector line is hidden; bento to one column at 768px |
| Tablet Wide | 860px to 979px | Hero, splits and pricing stack; h1 drops to 38px and h2 to 30px; the hero lead drops to 15px |
| Desktop | 980px to 1239px | The header menu collapses into the drawer at 992px and the header CTA moves inside it; team grids to two columns |
| Desktop Wide | 1240px and above | The container locks at 1240px and the margins grow instead of the column |

### Touch Targets
- Buttons are 11px by 18px around a 14px label, which keeps a comfortable hit region without a separate mobile size.
- Header nav links sit in 8px by 12px hit boxes with their own 8px radius, so the target is visible on hover before it is pressed.
- The drawer repeats the header CTA rather than shrinking it.

### Collapsing Strategy
- Section rhythm collapses in one move at 620px, so vertical pacing stays even instead of drifting per band.
- Grids step 4 to 2 to 1 and 3 to 2 to 1; cards keep their radius and their padding at every step.
- The comparison table stays a table and tightens its cell padding from 14px by 16px to 10px by 8px, with the font dropping to 12px, rather than re-laying as stacked rows.
- The bento grid drops every explicit span below 880px, so a tall featured tile becomes an ordinary one instead of leaving a hole.

### Image Behavior
- The per-direction panel images are shown or hidden by `html[data-style]`, so only one ever loads visually; they scale within the split column and stack above the copy below 860px.
- The line grid and the hero glow stay full bleed at every width.

## 9. Agent Prompt Guide

### Quick Color Reference
- Primary action: **Olive** (`#4D7C0F`) light, **Lime** (`#A3E635`) dark; hover `#3F6A0A` / `#BCF25A`
- Page canvas: **Off-white** (`#FBFCFA`) / **Night** (`#0A0D0C`)
- Card canvas: **White** (`#FFFFFF`) / (`#121614`); band `#F2F5EE` / `#0F1311`
- Body text: (`#46514B`) / (`#9AA6A1`); headings (`#10140F`) / (`#F2F5F3`)
- Quiet text: (`#7C877F`) / (`#5F6B66`)
- Hairline: (`#E4E8E0`) / (`#232A27`)
- Status, both modes: success `#30A46C`, warning `#F5A623`, danger `#E5484D`
- Line grid: `rgba(16,20,15,.04)` / `rgba(255,255,255,.035)`

### Example Component Prompts
- "Design an observability hero on the near-black canvas (`#0A0D0C`): a 30px line grid over a faint lime radial glow, a JetBrains Mono eyebrow at 12.5px tracked +2px in lime (`#A3E635`), a 52px Space Grotesk headline at -1.5px tracking and 1.04 leading, a 17px IBM Plex Sans lead, a lime primary button and a ghost button at 8px radius, and a code panel beside it on a 1 : 1.12 split."
- "Build a code panel: a 12px-radius card on `#121614` with a 1px `#232A27` border, a window bar with three 11px coloured lights and a muted 12px monospace filename, and a 13.5px monospace body where keys are lime, strings amber (`#F5A623`) and comments muted."
- "Compose a three-plan pricing row: 16px-radius cards with a 1px hairline, a 100px-radius monospace 'MOST POPULAR' badge on the middle one, a 40px Space Grotesk price, a per-line feature list with lime check marks, and a filled button on the popular plan only."
- "Create an incident timeline: four steps joined by a 1px hairline connector, each with a circular icon node, a monospace time, an uppercase phase label, a status badge coloured from the shared literals, and a 19px title."
- "Lay out a sticky 66px header on `#FBFCFA`: a 26px olive glyph plus a 19px Space Grotesk wordmark at -0.5px, 14px IBM Plex Sans menu links in 8px-radius hit boxes, a theme toggle, and an olive 'Start free' button at the right end over one hairline."

### Iteration Guide
1. Pick the direction and the mode first, and take the whole column. Ground, hairline, grid and accent move together.
2. Lock the three grounds before touching the accent, and check the card is lighter or darker than the canvas by a real step.
3. Place the accent only where something happens. If more than two accent elements are visible at once, one of them is decoration.
4. Tune type in this order: display size, display tracking, body leading, then the monospace eyebrow. The eyebrow is what makes the band look like this system.
5. Set the rhythm once for the whole page (80px), and let only a closing CTA band opt down.
6. Match radius by component class: control 8, card 12, large card 16, badge 100. Do not round everything the same.
7. Check the page in BOTH modes before calling it done. This design ships dark, so light is the state that usually breaks.

### Known Gaps
- **The focus ring is always olive.** Every ring in the template interpolates `rgba(var(--primary-rgb, 77, 124, 15), .25)`, and `--primary-rgb` is never declared anywhere in the source, so the fallback always wins. A focused field keeps an olive ring in dark, in blueprint and in signal. Recorded, not fixed.
- **No pressed state exists.** `--accent-active` is bound to the hover value as an honest proposal. The template declares no pressed colour for its own buttons, and T4's Bootstrap layer paints an unrelated Bootstrap blue on `.btn.btn-primary:active`.
- **No global tablet rhythm.** `--section-y-tablet` has no counterpart in the source: 80px holds unbroken to 620px. The bound 56px is the CTA block's own 991px value, which is why tablet and phone carry the same number.
- **No second border token.** `--border-soft` repeats `--border` in both modes; fields and cards share one hairline.
- **No separate meta ink.** `--meta` repeats `--muted`; the design declares one quiet ink.
- **Cards have no resting shadow**, so `--elev-card` is `none`. A consumer that expects a whisper there will get nothing, which is correct for this design.
- **No scrim.** Nothing is laid over a photograph anywhere in the template, so no overlay token is declared.
- **Status colours do not flip in dark**, by design. If a downstream artifact needs a dark-tuned success green, it has to declare one, and should say so.
- **`--up` (`#16A34A`)** is a real fourth status literal with no schema slot; it is not bound in `tokens.css`.
- **The hero glow and the ticker accent are hard-coded lime** in all three directions (`acm/hero/css/style.css:11-19`, `acm/clients/css/style.css:304-314`), so a blueprint or signal page still carries a lime cast in those two places.
