# Daniellelevitt — Style Reference
> Punk broadsheet at billboard scale — a flat acid-mint field cracked open by a slab of vermillion condensed type the size of a car door.

**Theme:** mixed

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Danielle Levitt's portfolio operates as an oversized editorial broadsheet: white and acid-mint canvases carry massive condensed display type in #d15022 vermillion that functions as both content and architecture. The visual system is brutally limited — burnt orange, mint green, black, and white are the only colors, and the type weights are uniformly 800, creating a single gravitational pull across every page. Photography is arranged in deliberate asymmetric collages that sit on, over, or through the type — never in uniform grids or tidy cards. The aesthetic is punk-poster meets fashion editorial: type screams, layouts breathe, and the UI chrome is reduced to two words — 'D — L' and 'Menu' — with the display lettering itself acting as the page structure.

## Colors

| Name | Value | Role |
|------|-------|------|
| Vermillion | `#d15022` | Display type, navigation, outlined action borders, section headings — burnt orange against white and mint creates the system's only chromatic voice; it carries every heading, every link, and the massive name lockup |
| Acid Mint | `#75dfb5` | Green action color for filled buttons, selected navigation states, and focused conversion moments |
| Pure Black | `#000000` | Image borders, hairline dividers, secondary borders, and body-text outlines where Vermillion isn't used — the structural ink that frames every photograph |
| Paper White | `#ffffff` | Primary canvas behind image collages and the opening viewport — flat, untextured, the gallery wall on which the photographs are pinned |

## Typography

### Helvetica Now Display — Body emphasis, navigation labels, sub-headings, image captions, link text — the non-display workhorse at 29px bold for the bio statement and 18px for running text. The 800 weight everywhere (no medium, no regular) is a signature choice: the system never steps down from maximum volume.
- **Substitute:** Inter 800 or Archivo Black
- **Weights:** 800
- **Sizes:** 10px, 18px, 29px
- **Line height:** 0.95, 1.0, 1.6
- **Letter spacing:** -0.01em consistently — at 29px that is -0.29px, at 18px -0.18px, at 10px -0.1px

### Helvetica Now Display Condensed — Display name lockup and section-spanning hero type — the ultra-condensed bold at 72px+ fills viewports and overlaps photography. The condensation is the brand's signature: standard Helvetica at 800 wouldn't create the same monolithic, poster-scale letters that define the site's identity.
- **Substitute:** Anton, Oswald 700, or Bebas Neue for the same condensed impact
- **Weights:** 800
- **Sizes:** 72px
- **Line height:** 0.95
- **Letter spacing:** -0.01em at 72px = -0.72px, tightening the already-narrow glyphs further into a single massed shape

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 10px | 1.6 | -0.1px |
| body | — | — | 18px | 1.6 | -0.18px |
| heading | — | — | 29px | 1 | -0.29px |
| display | — | — | 72px | 0.95 | -0.72px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Section gap:** 50px
- **Card padding:** 0px
- **Element gap:** 20px

### Border Radius

- **tags:** 0px
- **cards:** 0px
- **images:** 0px
- **buttons:** 0px

## Components

### Display Name Lockup
**Role:** Site-defining typographic element

Vermillion (#d15022) Helvetica Now Display Condensed 800 at 72px+, lineHeight 0.95, letter-spacing -0.01em, bleeding past viewport edges. The text 'Danielle Levitt' (or 'Levitt' alone) fills the entire screen width and functions as both identity mark and page background. White or mint sits behind it depending on the section. Zero padding around the type — it touches every edge.

### Image Collage Block
**Role:** Editorial photo arrangement on white canvas

Editorial photographs placed on Paper White (#ffffff) with deliberate asymmetric overlap. Each image carries a 0px radius (hard rectangular edges) and is framed by a Pure Black (#000000) border approximately 1-2px thick. Images overlap the Vermillion display type, with the text remaining visible behind/beside — type and photography occupy the same plane rather than stacking.

### Bio Statement Block
**Role:** Primary descriptive text

Set in Helvetica Now Display 800 at 29px, lineHeight 1.0, Vermillion (#d15022) on Acid Mint (#75dfb5) or Paper White. Bold weight at 29px reads as display type, not body — the system doesn't have a 'comfortable' reading mode. Letter-spacing -0.01em tightens into a dense paragraph block. Centered or left-aligned, depending on the section.

### Minimal Navigation
**Role:** Site wayfinding

Two pieces only: 'D — L' top-left, 'Menu' top-right, both in Vermillion (#d15022) Helvetica Now Display 800 at 18px, 20px padding from viewport edges. No nav bar, no logo, no tagline — the massive display name IS the logo. Hairline 1px Pure Black border may separate the nav from the canvas.

### Outlined Action Link
**Role:** Outlined/ghost link treatment

Vermillion (#d15022) 1-2px border, transparent fill, Vermillion text. No background fill — this is a bordered link, not a filled button. Padding approximately 12px 24px. Text in Helvetica Now Display 800 at 18px. The outlined approach is the system's only action style; there are no filled CTA buttons.

### Full-Bleed Section Background
**Role:** Page-level color band

Entire viewport filled with Acid Mint (#75dfb5) or Paper White (#ffffff). No max-width container, no card surfaces, no rounded corners. The background IS the section — there is no separation between 'background' and 'surface'. Vermillion display type sits directly on the colored field.

### Image Frame Border
**Role:** Photograph containment

Every photograph receives a 0px-radius Pure Black (#000000) border of approximately 1-2px on all sides. No drop shadows, no rounded corners — the hard black line acts as the image's edge against white or mint. The framing is consistent across all images regardless of aspect ratio.

## Do's and Don'ts

### Do
- Use Vermillion (#d15022) for all display type, headings, and navigation — it is the only chromatic voice in the system
- Set all type at weight 800 — the system never steps down to medium or regular; 29px bold IS the body weight
- Use Helvetica Now Display Condensed 800 at 72px+ with lineHeight 0.95 for any display or section-spanning text
- Use 0px border-radius on every element — images, buttons, tags, cards all have hard rectangular edges
- Frame every photograph with a 1-2px Pure Black (#000000) border
- Let display type bleed to viewport edges — never constrain with max-width or padding around the name lockup
- Use Acid Mint (#75dfb5) as a full-bleed section background, never as a card surface or accent fill

### Don't
- Don't introduce a second body weight below 800 — medium and regular have no place in this system
- Don't add drop shadows, gradients, or any elevation — the system is completely flat
- Don't use rounded corners on images, buttons, or containers — 0px radius is non-negotiable
- Don't constrain the layout to a max-width container — the editorial poster aesthetic requires full-bleed
- Don't add a third color — the palette is strictly Vermillion, Acid Mint, Black, and White
- Don't separate type and photography into stacked rows — they should overlap and share the same plane
- Don't use a standard sans-serif at body sizes — even 18px and 29px text must be 800 weight to match the system's volume

## Elevation

The system is completely flat. No drop shadows, no glow effects, no gradient fills. Spatial separation is achieved through hard color contrast (white/mint/vermillion fields) and overlapping placement rather than elevation. The 1-2px Pure Black image borders are the only 'shadow-like' element, and they function as containment, not depth.

## Surfaces

- **Paper White** (`#ffffff`) — Primary canvas for the opening viewport and image collage sections — the gallery wall
- **Acid Mint** (`#75dfb5`) — Full-bleed section background for bio, about, and content-heavy pages — the only saturated surface

## Imagery

Editorial fashion and portrait photography in full color, high-production shoots. Images are presented as hard rectangular crops (0px radius) with 1-2px black borders, placed asymmetrically with deliberate overlap against massive type. The photography style is punchy, saturated, magazine-quality — studio portraits, backstage moments, staged fashion narratives. Images function as both content and collage composition, sharing the plane with display type rather than sitting in tidy cards or grids. The visual density is image-heavy in the opening section, with type dominating the mint-background sections.

## Layout

Full-bleed editorial layout with no max-width container. The page alternates between two modes: (1) Paper White canvas with a collage of bordered editorial photographs arranged asymmetrically, with Vermillion display type bleeding behind/through the images, and (2) Acid Mint full-bleed sections where massive Vermillion display type fills the viewport with body text below. Navigation is minimal — 'D — L' top-left, 'Menu' top-right with 20px viewport padding. No sticky header, no sidebar, no card grids. Sections transition by full-bleed color change rather than by dividers or whitespace gaps. The hero pattern is the massive display name lockup that fills the first viewport, functioning simultaneously as logo, heading, and background architecture.

## Similar Brands

- **Flaunt Magazine** — Same editorial poster aesthetic with oversized condensed display type overlapping photography, and a fearless use of high-contrast color fields (mint, orange) as full-bleed backgrounds
- **Bureau Cool** — Extreme typographic confidence — 800-weight display type that fills the viewport, zero rounded corners, flat color sections, and editorial image arrangement
- **Misha Hollenbach / Hotel Design** — Portfolio sites that use condensed ultra-bold display type as the primary visual element, with photography placed against or through the type rather than in separate containers
- **The Garbage Magazine** — Punk-zine sensibility expressed at scale: brutalist type choices, limited two-color palette, and image collages that break grid conventions
