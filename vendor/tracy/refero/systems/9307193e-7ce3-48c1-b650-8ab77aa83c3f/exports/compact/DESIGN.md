# Redbrick Coffee — Style Reference
> Scarlet ink editorial on butcher paper

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Redbrick is an editorial coffee storefront printed in scarlet ink on warm white pages. The system is defined by a single aggressive red (#e82c2a) that saturates every interactive surface — logo, nav text, section labels, borders, arrows, and the announcement bar — while the page canvas stays creamy white and cards sit on soft #f2f2f2 surfaces. Display headlines are a weight-300 didone-adjacent serif (Editorial Old) at extraordinary sizes (100–150px) with near-1.0 line-height, letting the letterforms breathe without bold weight. Body and UI copy use a humanist sans (Surt) with consistent positive tracking, giving even short labels a printed, typeset quality. Photography is overhead lifestyle — wooden tables, open books, espresso machines, hands cradling cups — warm and editorial rather than glossy e-commerce. Layout alternates half-width image and text blocks, anchored by tiny uppercase section labels and right-aligned arrow links that behave like magazine running heads.

## Colors

| Name | Value | Role |
|------|-------|------|
| Brick Red | `#e82c2a` | Red accent for outlined action borders, linked labels, and lightweight interactive emphasis. Do not promote it to the primary CTA color |
| Press Black | `#212529` | Primary body and paragraph text, hero supporting text, and darkest surface accents where deeper contrast than white-on-red is needed |
| Cream White | `#ffffff` | Page canvas, image backgrounds, nav fill, and card surface base — the warm white that makes Brick Red feel printed rather than digital |
| Soft Grey | `#f2f2f2` | Product card surface and elevated panels, one subtle step below the white canvas to separate scrolled content blocks |
| Carbon | `#121212` | Dark anchor for footer, inverse panels, and the few dark-on-light UI elements that need more weight than Press Black provides |

## Typography

### Surt — Body, nav links, buttons, card labels, and all functional UI. Positive tracking (0.013–0.05em) is consistent across sizes, giving the type a typeset, slightly old-style feel that pairs with the editorial display serif. Replaces body and UI text at every level.
- **Substitute:** Söhne, Inter, or Untitled Sans
- **Weights:** 400
- **Sizes:** 15px, 20px, 30px, 35px
- **Line height:** 1.00–1.50
- **Letter spacing:** 0.013em at 15px, 0.017em at 20px, 0.03em at 30px, 0.04em at 35px

### Editorial Old — Display headlines only. The weight-300 thin serif at 100–150px with ~1.0 line-height is the signature — anti-convention, never bold, letting the letterforms carry the page rather than weight. Enable 'clig' and 'liga' for contextual alternates.
- **Substitute:** Playfair Display, GT Super, or PP Editorial Old (paid)
- **Weights:** 300
- **Sizes:** 100px, 105px, 150px
- **Line height:** 0.99–1.20
- **Letter spacing:** near-zero (-0.005em to 0.006em)
- **OpenType features:** `"clig" on, "liga" on`

### GTStandard-M — Micro-labels and uppercase taglines (e.g. 'For Coffee Drinkers' banner). Tight 10px with 0.06em tracking mimics letterpress taglines.
- **Substitute:** GT Standard Mono, JetBrains Mono, or system-ui mono
- **Weights:** 400
- **Sizes:** 10px
- **Line height:** 1.50
- **Letter spacing:** 0.0600em

### system-ui — system-ui — detected in extracted data but not described by AI
- **Weights:** 400
- **Sizes:** 10px
- **Line height:** 1.5
- **Letter spacing:** 0.06

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.5 | 0.6px |
| body-sm | — | — | 15px | 1.5 | 0.195px |
| body | — | — | 20px | 1.3 | 0.34px |
| subheading | — | — | 30px | 1.2 | 0.9px |
| heading-sm | — | — | 35px | 1.2 | 1.4px |
| display | — | — | 100px | 0.99 | -0.5px |
| display-lg | — | — | 150px | 1.1 | 0.9px |

## Spacing & Layout

**Density:** compact

- **Section gap:** 50px
- **Card padding:** 30px
- **Element gap:** 10px

### Border Radius

- **cards:** 25px
- **links:** 3.75px
- **images:** 25px
- **inputs:** 50px
- **buttons:** 50px

## Components

### Announcement Bar
**Role:** Full-width top banner

Full-bleed #e82c2a background spanning the viewport edge-to-edge. Center-aligned tagline in 10px GTStandard-M white text with 0.06em tracking. Right side holds secondary nav links (About, Wholesale, Office Coffee, Contact) in same micro type. Height ~30px. Acts as a red frame that bleeds into the logo and nav below.

### Brick Logo Mark + Wordmark
**Role:** Brand identity in header

A small 3D red house/brick icon paired with 'REDBRICK' in Surt 400, ~20px, 0.017em tracking, all #e82c2a. The icon and wordmark are vertically aligned, left-padded from the viewport edge with ~30px. The red is the same Brick Red as everything else — no logo-specific variant.

### Primary Nav Link
**Role:** Top-level navigation items

Surt 400, ~15px, 0.013em tracking, color #e82c2a. Horizontal list spaced ~30px apart. No underline by default, no background. On hover, color stays red (no color shift) — the only state change is opacity. No dropdowns in the primary tier.

### Secondary Nav Row
**Role:** Sub-category navigation strip

Horizontal list of product categories (Coffee Coffee, Good Day, Rogue Coffee, Dark Coffee, Decaf Coffee) in Surt 400 ~15px #e82c2a, separated by ~30px padding. Sits below primary nav, separated by a 1px #e82c2a rule.

### Editorial Display Headline
**Role:** Hero and section headlines

Editorial Old weight 300, 100–150px, line-height ~1.0, color #e82c2a. Sits as the left column in a 50/50 image+text split. Never bold, never condensed. Allows the letterforms to dominate the viewport — the thin weight is the anti-statement that becomes the statement.

### Section Label
**Role:** Magazine-style running head for content blocks

Tiny 10px uppercase-style label in Surt 400, color #e82c2a, 0.06em tracking. Sits flush left at the top of a content section, above a 1px red rule, paired with a right-aligned 'Shop blends →' arrow link at the same size.

### Arrow Link
**Role:** Editorial cross-link with directional indicator

10–15px Surt 400 #e82c2a, right-aligned, with a thin '→' or '⟶' arrow character after the label. 3.75px border-radius (effectively a thin underline). Used to navigate between collections, e.g. 'Shop blends →', 'Stock up →', 'Enquire →'.

### Product Card
**Role:** Blend and single-serve product tiles

Rounded card with 25px border-radius, #f2f2f2 background fill, and 30px padding all sides. Contains a centered product package image (bag or sachet) on a pastel or colored background. Below the image sits a product name in Surt 400 20px #212529 and small descriptors. No drop shadow — the 25px radius does the work of separation.

### Lifestyle Image Block
**Role:** Full-bleed hero photography

Rounded 25px radius, full-bleed within its grid column. Photography is overhead or waist-level, warm-toned, featuring coffee on wooden tables, books, magazines, espresso machines, and hands. No overlays, no text on image — the image is a stand-alone visual paragraph.

### Split Text Block
**Role:** Companion copy for an image block

Right or left column of a 50/50 split. Contains the Editorial Old display headline (already specified) followed by a 20px Surt 400 #212529 paragraph at 1.3 line-height, max-width ~480px. Whitespace above and below the text is generous (~50px) to let the serif breathe.

### Outlined Action Link
**Role:** Ghost-style CTA inside content blocks

Ghost/outlined action in 1px #e82c2a border, 3.75px radius, 10–15px Surt 400 #e82c2a text, 10px vertical / 20px horizontal padding. No fill. Functions as the system's primary action style — no filled buttons exist in this system.

### Footer Mini-Nav
**Role:** Bottom utility links

Horizontal list in Surt 400 15px #e82c2a, separated by ~30px padding, sits at the foot of a dark (#121212) or light panel. No icons, no grouping — just inline text links.

## Do's and Don'ts

### Do
- Use Brick Red #e82c2a for every interactive text element, every section label, and every outlined action — the system is monochrome with a single chromatic thread.
- Set display headlines in Editorial Old weight 300 at 100–150px with line-height ~1.0; never bold, never weight 400+.
- Apply consistent positive tracking to Surt: 0.013em at 15px, 0.017em at 20px, 0.03em at 30px, 0.04em at 35px, 0.06em at 10px labels.
- Use 25px border-radius for all cards and image blocks; 50px for pill buttons and inputs; 3.75px for inline text links.
- Pair every image block with a text block in a 50/50 split — the system is editorial, not full-bleed spectacle.
- Use 10px GTStandard-M with 0.06em tracking for running heads, announcement text, and arrow links — never a larger size for utility labels.
- Keep product cards on a #f2f2f2 surface with 30px padding; no drop shadows, let the 25px radius do the elevation work.

### Don't
- Do not introduce a filled (solid background) button style — Redbrick's only action surface is the outlined chromatic link.
- Do not bold the display headline; weight 300 thin serif IS the hierarchy, increasing weight destroys the brand.
- Do not add a second brand color; the system is red-on-cream, not multi-color.
- Do not use drop shadows on cards or images; elevation is expressed by 25px radius and the #f2f2f2 surface shift.
- Do not center the display headline in narrow columns — it belongs in a wide left/right split with generous left padding.
- Do not place white text directly on the #f2c2f2 surface (low contrast) or on the announcement bar with anything other than pure white.
- Do not use stock product-on-white e-commerce photography; imagery must be warm overhead lifestyle with wooden surfaces, books, and hands.

## Elevation

The system avoids drop shadows entirely. Elevation is communicated through (1) the 25px border-radius on cards and images, (2) the one-step surface shift from #ffffff canvas to #f2f2f2 card, and (3) the full-bleed red band as a chromatic divider. Shadows would read as e-commerce convention and undermine the editorial identity.

## Surfaces

- **Cream White Canvas** (`#ffffff`) — Page base background for all sections and the dominant reading surface
- **Soft Grey Card** (`#f2f2f2`) — Product card and content block surface, one tonal step below the canvas
- **Brick Red Panel** (`#e82c2a`) — Top announcement bar and occasional full-width red bands
- **Carbon Panel** (`#121212`) — Dark footer and inverse panels

## Imagery

Photography is warm overhead lifestyle — wooden tables, open books, magazines, espresso machines, hands cradling cups. Shots are tightly cropped and feel like magazine spreads. Product packaging is shown on pastel or branded colored backgrounds within the card frame. There is no white-cyc product photography, no studio lighting, no model shots — the coffee and its context are the hero. Color treatment is warm and slightly desaturated, leaning into amber and cream tones that harmonize with the Brick Red and cream-white palette.

## Layout

Full-bleed sections with edge-to-edge content; the canvas is unconstrained horizontally. The dominant pattern is a 50/50 split of lifestyle image and editorial text, alternating left/right as the user scrolls. Section rhythm is marked by tiny uppercase red labels with a hairline rule and a right-aligned 'Shop blends →' arrow link — like magazine running heads. The top of the page has a full-width red announcement bar, then a white nav strip, then a hero split. A product card row (4–5 cards) appears at major intervals. A secondary sub-nav row sits between the primary nav and the hero. The page feels like a printed broadsheet, not a typical online store.

## Similar Brands

- **Aesop** — Same editorial typography pairing — thin serif display + tracked sans body — and a single restrained color thread throughout the interface.
- **Goop** — Magazine-spread layout language with alternating image+text splits, serif display headlines at huge sizes, and tiny tracked section labels.
- **Blue Bottle Coffee** — Same coffee brand restraint — generous whitespace, warm lifestyle photography, and editorial section rhythm over product-grid density.
- **Fellow Products** — Same thin-serif-at-scale display treatment paired with a clean humanist sans for body, and warm product photography on neutral surfaces.
- **MoMA Design Store** — Same full-bleed editorial storefront — image-led halves, hairline section rules, and arrow-link navigation that reads like a print catalog.
