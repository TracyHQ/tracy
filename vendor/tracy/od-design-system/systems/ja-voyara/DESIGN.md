# Design System Inspired by JA Voyara

> Category: Media & Consumer
> Travel company and travel magazine. Cream editorial calm, terracotta action, serif display over sans body.

## 1. Visual Theme & Atmosphere

JA Voyara is a warm editorial travel language: a cream page, white cards, near-black brown ink, and exactly one chromatic move for action. It reads like a printed travel magazine that learned to take bookings. The page never goes white-on-white and never goes cold; the canvas is `#FAF6F0` and every surface above it is warmer or lighter than the one below, so depth comes from paper tone rather than from shadow stacks.

The system runs in two gears without changing grammar. Editorial surfaces — destination grids, story panels, author boxes, the magazine home — lean on large serif headings, long relaxed measure, and photography that goes full bleed. Commercial surfaces — tour listings with price and itinerary, pricing tables, comparison tables, the contact and search forms — tighten the same tokens into cards, pills and fields without introducing a second palette. One terracotta carries every call to action across both.

Typography is the stabilizer, and it is a three-family split rather than the usual two. A high-contrast serif carries display; a neutral sans carries reading and controls; a monospace carries the small uppercase eyebrow that sits above almost every section title. That eyebrow is the system's signature tell: 12px, uppercase, letter-spaced a full pixel, teal by default and terracotta on the home page.

**Key Characteristics:**
- Cream canvas (`#FAF6F0`) with white cards and a warm sand band (`#F2EBE1`) as the third surface tier
- A single terracotta accent (`#C2562F`) for links, buttons and the focus outline, with a deep teal (`#1F6F6B`) as a non-competing secondary
- Serif display (Playfair Display) over sans body (Inter), with monospace eyebrows above section titles
- Heading ink is darker than body ink, not lighter: the neutral ramp is two pairs, not one descent
- Pill geometry on every button, every badge and the hero search bar; there is no square button in the system
- Soft tiered radii (8 / 14 / 22px) and whisper-weight shadows; borders do most of the containment
- An 88px section rhythm that holds unbroken to 640px, then drops to 48px everywhere at once
- Full-bleed hero photography under a warm scrim, with the title, lead and search bar overlaid on it
- A dark mode that is a pure token remap: same relationships, inverted ink, deeper shadows, nothing else

## 2. Color Palette & Roles

> **Source:** the `--voy-*` custom-property set on `:root` (`scss/_voyara.scss:7-43`, compiled to `css/template.css:18390-18419`) and its dark remap under `html.t4-dark` (`css/darkmode.css:8-48`).

### Primary
- **Terracotta** (`#C2562F`): Links, primary buttons, the header CTA, the focus outline. The only persistent chromatic move in the chrome.
- **Terracotta Deep** (`#A6451F`): The hover and pressed tone. A fixed second value, never computed from the primary.
- **Cream Canvas** (`#FAF6F0`): The page itself, and the reason the system reads as paper rather than as product.

### Secondary & Accent
- **Deep Teal** (`#1F6F6B`): Section eyebrows, teal bands, and the system's success semantics. Present enough to be a real second colour, restrained enough never to fight the terracotta.
- **Teal Ink** (`#EAF4F3`): Text on the teal bands.
- **Warm Amber** (`#E0A458`): Decorative only — rating stars and tour badges. Not a warning state, though the admin exposes it as one.

### Surface & Background
- **Paper White** (`#FFFFFF`): Cards, form fields, the header bar, the mega panel.
- **Warm Sand** (`#F2EBE1`): Raised bands, the inner-page masthead, the footer, icon chips.
- **Night Canvas** (`#15110E`): The dark-mode page.
- **Night Card** (`#211B16`) and **Night Band** (`#1C1712`): The dark counterparts of white and sand.

### Neutrals & Text
- **Body Ink** (`#2B2420`): Body copy and navigation links.
- **Heading Ink** (`#1A1512`): Headings only, and darker than the body ink.
- **Warm Grey** (`#8A7E72`): Excerpts, card meta, footer links, breadcrumbs.
- **Warm Hairline** (`#E5DCD0`): Card edges, the header rule, the drawer, form-field edges.

### Semantic & Accent
- **Success** (`#1F6F6B`): The brand teal doubles as success; valid fields and success alerts both paint with it.
- **Danger** (`#C2362F`): A brick red for invalid fields, held close enough to the terracotta to stay in family and far enough to be readable as an error.
- **Warning**: No real warning state exists in the design. The amber above is the honest proposal.
- **Focus** (`#C2562F`): A 2px solid outline at 2px offset, declared as a global floor on links and every button class.

### Gradient System
- There is no gradient in the brand layer. What looks like one is always the hero scrim (`#16100BB0`) over a photograph, or a surface token washing over an image. Colour richness comes from the photography, never from UI gradients.

## 3. Typography Rules

### Font Family
- **Display Family:** `Playfair Display`, fallbacks `Georgia, "Times New Roman", serif`
- **Body Family:** `Inter`, fallbacks `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Mono Family:** `Geist Mono`, fallbacks `ui-monospace, "SFMono-Regular", Menlo, monospace`
- **Usage Split:** Serif carries every heading and the hero title; sans carries body copy, navigation and all controls; monospace carries eyebrows, card categories, module titles and mega-column titles — small uppercase labels only, never a sentence.

### Hierarchy
| Role | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|--------|-------------|----------------|-------|
| Hero Display | clamp(34px, 5vw, 66px) | 700 | 1.08 | 0 | Fluid; sits over the hero photograph |
| CTA Display | 44px | 700 | 1.12 | 0 | Closing call-to-action band |
| Section Heading | 40px | 700 | 1.15 | 0 | Home section titles |
| Masthead Title | 42px | 700 | 1.14 | 0 | Inner-page masthead, 28px below 640px |
| Feature Heading | 38px | 700 | 1.14 | 0 | Feature-split panels |
| Sub-section | 28px | 700 | 1.14 | 0 | Secondary headings |
| Brand / Large Card | 22px | 700 | 1.14 | 0 | Wordmark and the largest card titles |
| Card Title | 20px | 700 | 1.2 | 0 | Destination and article cards |
| Hero Lead | 19px | 400 | 1.6 | 0 | Lead paragraph over the scrim |
| Article Body | 18px | 400 | 1.7 | 0 | Long-form reading measure |
| Body Primary | 16px | 400 | 1.65 | 0 | Standard body |
| Control Label | 15px | 500-600 | 1.2 | 0 | Buttons and navigation links |
| Excerpt / Footer | 14px | 400 | 1.6 | 0 | Card excerpts, footer links |
| Meta | 13px | 400 | 1.5 | 0 | Card meta, breadcrumbs, legal |
| Eyebrow | 12px | 500-600 | 1 | +1px, uppercase | Monospace; above almost every section title |
| Card Category | 11px | 500 | 1 | +0.6px, uppercase | Monospace; on the card image |

### Principles
- **Two leadings, far apart.** Body runs airy at 1.65, display runs tight at 1.14. The distance between them is most of the editorial feel; compressing either collapses it.
- **Tracking belongs to the monospace layer.** The serif is set flush at 0 — deliberately, to beat a base rule that would loosen it. Only the uppercase mono labels are tracked, +0.5px to +1px.
- **Weight ladder is short.** 700 for display, 500-600 for controls and labels, 400 for everything read in sentences. There is no light weight anywhere.
- **Three families, three jobs.** A fourth family, or the serif used below 20px, breaks the system faster than any colour change.

### Note on Font Substitutes
- Closest freely available substitutes: `Playfair Display` and `Inter` are themselves free; where they cannot be loaded the stacks fall back to Georgia and the system sans, which shifts the page toward the operating system's default voice.
- When substituting the serif, keep a genuinely high-contrast face. A low-contrast slab reads as corporate and loses the magazine register that the whole palette is built around.

## 4. Component Stylings

### Buttons
- **Primary:** terracotta fill, white label, pill radius, 15px sans at weight 600, roughly 8px vertical by 22px horizontal padding. Hover swaps to the fixed deeper terracotta; press lifts the button back down by one pixel rather than changing colour.
- **Secondary / Outline:** surface fill with a warm hairline; border and label both turn terracotta on hover.
- **Ghost:** used only over photography — white at low alpha, white label, pill radius.
- **Header CTA:** the same primary pill, held at the right end of the header bar and the one button visible above the fold on every page.
- **Pressed Behavior:** geometry only. A 1px lift on hover is reset on press; no pressed colour is declared anywhere in the system.

### Cards & Containers
- **Editorial / Destination Card:** white on cream, 22px radius, a warm hairline, a resting shadow of `0 1px 3px` at 6% black, lifting to `0 8px 24px` at 10% on hover. Body padding runs 20px top, 22px sides, 24px bottom.
- **Icon Chip:** a warm-sand square at 14px radius holding a stroked icon; the quiet counterpart to the card.
- **Mega Panel:** white, 22px radius, 16px padding, the same hairline as the cards. It is the only chrome element that floats.
- **Band:** a full-width section that swaps the canvas to sand or teal while the container width stays constant.

### Inputs & Forms
- **Fields:** white fill, the soft border token, 8px radius, body ink, warm-grey placeholder. Focus tightens the border to terracotta and adds a 3px terracotta wash.
- **Hero Search:** a white pill floating over the hero photograph, a stroked magnifier at the left, and a terracotta pill submit at the right. It is the single most recognisable component in the system.
- **Density Strategy:** forms stay quiet. Labels are 14px sans; the page never turns into a control panel, because the photography has to keep carrying the persuasion.

### Navigation
- **Primary Site Nav:** a white 76px bar carrying a left wordmark, a horizontal menu with mega panels, and a terracotta pill CTA at the right end.
- **Mega Panel:** column titles in tracked uppercase monospace, links in 14px sans, all on the floating white panel.
- **Off-canvas Drawer:** below 768px the bar drops to 64px and the menu collapses into a drawer whose rows are 16px by 20px, separated by hairlines rather than fills.
- **Link Hierarchy:** navigation links are body ink and turn terracotta on hover; the CTA is the only filled element in the bar.

### Image Treatment
- **Full-bleed hero:** one photograph, minimum 660px tall, under the warm scrim, with the title, lead and search bar overlaid.
- **Ratio discipline:** destination cards crop 16:11, feature splits 27:23, team portraits 3:4. The ratios are part of the rhythm; free-form crops break the grid visibly.
- **Photography carries the drama.** The UI stays quiet precisely so it can.

### Other Distinctive Components
- **Monospace eyebrow:** the small uppercase label above a section title. Teal by default, terracotta on the home page.
- **Rating badge:** a pill with a warm-amber star over a dark wash, sat on the card image.
- **Route steps:** four numbered steps in a row, collapsing to two and then one.
- **Comparison table:** a real table that re-lays itself below 768px rather than scrolling horizontally.

## 5. Layout Principles

### Spacing System
- Base unit is `8px`, and the ramp is computed from it rather than typed: 4, 8, 12, 16, 24, 32, 48.
- A 20px step exists outside that ramp as the card's own body padding; 24px is both the grid gap and the mega-column padding; 48px is both the footer grid gap and the header side gutter.
- Vertical rhythm is set once per band, not per element, which is why sections stay even down the page.

### Grid & Container
- **One container width:** 1140px, applied over the framework's own breakpoint ladder so the reading column does not step as the viewport grows.
- **One gutter:** 16px at every width. The header is the documented exception — a fluid container with a 48px side gutter that tightens to 20px at 1024px.
- **Grids:** three or four cards at desktop, two below 992px, one below 640px.

### Whitespace Philosophy
- **Band pacing:** 88px above and below a section is the default, 64px for compact bands (stats, closing CTA), 34px for the logo strip.
- **One breakpoint for rhythm:** at 640px the rhythm token is redeclared once and every section follows, with no per-section rule.
- **Contrast-led separation:** sections are separated by a change of canvas — cream, white, sand, teal — not by rules or decorative dividers.

### Border Radius Scale
- **8px:** form fields and inputs.
- **14px:** the brand mark and icon chips.
- **22px:** cards, feature panels, the mega panel.
- **9999px:** every button, the header CTA, badges, social icons, the hero search bar.
- There is no 0px tier. A square corner reads as foreign in this system.

## 6. Depth & Elevation

| Level | Treatment | Use |
|------|-----------|-----|
| Level 0 | Flat surfaces with a 1px warm hairline (`#E5DCD0`) | Theme toggle, drawer, social icons, bands |
| Level 1 | Resting card whisper (`0 1px 3px` at 6% black) | Destination, article and feature cards |
| Level 2 | Hover lift (`0 8px 24px` at 10% black) plus a 1px translate | Cards and CTAs under the pointer |
| Level 3 | Deep lift (`0 16px 40px` at 15% black) | The rare floating panel |
| Accessibility | 2px solid terracotta outline at 2px offset | Keyboard focus on links and every button class |

Depth is deliberately shallow. The system separates things with paper tone and hairlines first, and only then with a shadow; the deepest step appears perhaps once per page.

### Decorative Depth
- The one genuinely atmospheric effect is the hero scrim: a warm near-black at about 69% alpha over the photograph, which lets a serif title and a white search pill share the same image without either losing contrast.
- In dark mode the shadows deepen to roughly four times their light alpha, because a 6% black shadow is invisible on a near-black page.

## 7. Do's and Don'ts

### Do
- Keep the cream canvas as the page and let white and sand be the two tiers above it.
- Reserve terracotta for action: links, primary buttons, the CTA, the focus outline.
- Put a monospace eyebrow above a section title; it is the cheapest way to make a band read as part of this system.
- Set the serif flush and let the size do the work.
- Use pill geometry for anything the reader can press.
- Let one photograph carry the top of the page, and keep the chrome over it quiet.
- Bind every colour to a token, so dark mode remains one remap.

### Don't
- Don't build a descending grey ramp from the heading ink; it is darker than the body ink, and the pair inverts in dark.
- Don't compute the hover terracotta from the primary — it is a separate bound value, and a re-skin has to move both.
- Don't introduce a third chromatic family. The teal is already the second, and it is deliberately quiet.
- Don't square a corner or drop a heavy shadow to signal importance; change the canvas instead.
- Don't set the serif below 20px, and never use it for a control label.
- Don't track the serif. Tracking belongs to the uppercase monospace layer.
- Don't paint a literal colour anywhere a token exists: a literal does not follow the dark remap and stays light on a near-black page.

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Phone | 640px and below | Section rhythm drops to 48px, grids to one column, hero to 540px tall, masthead title to 28px |
| Phone Wide | 641px-767px | One or two columns; the hero search bar becomes a static strip above the image |
| Tablet | 768px-991px | Header bar steps to 64px and the menu becomes a drawer; grids at two columns |
| Tablet Wide | 992px-1023px | Three-column grids return; feature splits still stacked |
| Desktop | 1024px-1139px | Header side gutter tightens to 20px; container fills the viewport minus gutters |
| Desktop Wide | 1140px and above | The container locks at 1140px and the margins grow instead of the column |

### Touch Targets
- Every action is a pill with generous horizontal padding, which keeps hit regions comfortable without a separate mobile size.
- The hero search collapses into a full-width pill field with its own submit button rather than shrinking the desktop bar.
- Drawer rows are 16px by 20px, which keeps a list of menu items tappable without turning the drawer into a wall of fills.

### Collapsing Strategy
- Section rhythm collapses in one move at 640px, so vertical pacing stays even instead of drifting per band.
- Grids step 4 → 2 → 1 and 3 → 2 → 1; cards keep their radius, padding and crop ratio at every step.
- The header collapses to a wordmark, the CTA and a drawer toggle; the CTA never leaves the bar.
- The comparison table re-lays as stacked rows rather than scrolling sideways.

### Image Behavior
- The hero keeps its crop and its scrim, losing height rather than width.
- Card images keep their ratios through every breakpoint, so a two-column grid looks like the four-column one, only larger.
- Photography stays full bleed at every width; the container constrains type, not pictures.

## 9. Agent Prompt Guide

### Quick Color Reference
- Primary action: **Terracotta** (`#C2562F`), hover **Terracotta Deep** (`#A6451F`)
- Secondary / success: **Deep Teal** (`#1F6F6B`)
- Page canvas: **Cream** (`#FAF6F0`)
- Card canvas: **Paper White** (`#FFFFFF`), band **Warm Sand** (`#F2EBE1`)
- Body text: **Body Ink** (`#2B2420`), headings **Heading Ink** (`#1A1512`)
- Quiet text: **Warm Grey** (`#8A7E72`)
- Hairline: **Warm Hairline** (`#E5DCD0`)
- Hero overlay: **Scrim** (`#16100BB0`)

### Example Component Prompts
- "Design a travel hero: one full-bleed photograph under a warm scrim (`#16100BB0`), a monospace uppercase eyebrow, a Playfair Display title at clamp(34px, 5vw, 66px) in white, a 19px lead, and a white pill search bar with a terracotta (`#C2562F`) submit."
- "Build a three-card destination grid on the cream canvas (`#FAF6F0`): white cards at 22px radius with a warm hairline, a 16:11 image, a monospace category label over the image, a 20px serif title and a 14px warm-grey excerpt."
- "Compose a contact form on the warm sand band (`#F2EBE1`): white fields at 8px radius with the soft border, 14px sans labels, terracotta focus outline at 2px offset, and a terracotta pill submit."
- "Create a section header: a teal (`#1F6F6B`) monospace eyebrow tracked +1px above a 40px Playfair Display heading and a 16px lead at 1.65 leading, on an 88px vertical rhythm."
- "Lay out a white 76px header: left wordmark, horizontal menu in 15px sans, terracotta pill CTA at the right end, one warm hairline underneath, no shadow."

### Iteration Guide
1. Lock the three surfaces first — cream page, white card, sand band — before touching any accent.
2. Place the terracotta only where something happens. If more than two terracotta elements are visible at once, one of them is decoration.
3. Tune type in this order: serif display size, body leading, then the monospace eyebrow. The eyebrow is what makes the band look like this system.
4. Set the vertical rhythm once for the whole page (88px), then let compact bands opt down to 64px.
5. Match radius by component class — field 8, chip 14, card 22, anything pressable a pill — rather than rounding everything the same.
6. Check the page in dark before calling it done: every colour must come from a token, or it will stay light on a near-black canvas.

### Known Gaps
- No pressed colour exists anywhere in the system. `--accent-active` is bound to the hover value as an honest proposal; the real press changes geometry only, and that reset itself sits inside a reduced-motion guard, so under `prefers-reduced-motion: reduce` there is no pressed state at all.
- No real warning state exists. `--warn` carries the decorative amber used by rating stars and tour badges.
- The focus ring on form fields (`--elev-ring`) is a hard-coded light-terracotta wash upstream and is not remapped in dark, so a focused field keeps a light ring on the near-black page.
- The tablet section rhythm (`--section-y-tablet`) has no counterpart in the source: the 88px rhythm holds unbroken to 640px. The 64px bound here is the design's own compact-band value.
- On a stock install only the monospace family is actually fetched; the serif and the sans render from their fallback stacks unless the site loads them.
