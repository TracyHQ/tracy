# Mr. Pops — Style Reference
> retro ice cream parlor on cream paper. A bright white shopfront with cherry-red trim, stacked marquee letters, and warm cream cards beneath full-bleed food photography.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Mr. Pops reads like a sunlit ice cream parlor printed on cream cardstock: warm white canvas, massive condensed display type set tight over full-bleed lifestyle photography, and a single cherry-red used almost exclusively as outline and stroke. The dominant gesture is bold — Cervo display hits 144px with 0.75 line-height and 0.05em positive tracking, stacked four lines deep — but the chrome stays airy: thin red borders, pill buttons, 40px corners, and cream-tinted secondary surfaces instead of gray. Neutrals (black, white, warm cream) carry the structure while the red punctuates. Components should feel like a hand-stamped menu card: generous whitespace, confident borders, no drop shadows, and photography that bleeds to the edge of the screen.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cherry Marquee | `#b00e2f` | Brand accent, heading text, link color, icon stroke, outlined button border, footer headline — vivid warm red used as the single chromatic signal across an otherwise cream-and-white interface |
| Cream Bisque | `#fee5ca` | Secondary surface for cards, callout panels, and the cart/bag detail button — warm near-white that reads as paper, not gray |
| Canvas White | `#ffffff` | Page background, card surface, input fill, button text on dark |
| Ink Black | `#000000` | Primary body text, icon fills, heavy borders, SVG fill — the only true dark |
| Slate Mid | `#aaaaaa` | Muted secondary text, disabled placeholders, low-emphasis dividers |

## Typography

### Cervo — Display and headings only. Set extremely tight (line-height 0.75 on the 144px hero, 0.9 on 64-72px) and tracked slightly outward at 0.05em — the condensed letterforms and compressed leading make the headline read as a hand-painted sign rather than a web type block. Weight 400 carries the body, weight 500 amplifies emphasis within the display.
- **Substitute:** Oswald, Bebas Neue, Antonio
- **Weights:** 400, 500
- **Sizes:** 16px, 18px, 22px, 42px, 64px, 72px, 144px
- **Line height:** 0.75, 0.90, 1.00
- **Letter spacing:** 0.05em at all sizes

### HelveticaNeueCyr — Body, UI, navigation, footer, input, captions. Light 400 weight throughout with generous 1.3-1.4 leading on running text — the whisper-weight keeps chrome from competing with the Cervo display, so the marquee headline always wins the eye.
- **Substitute:** Helvetica Neue, Inter, Arial
- **Weights:** 400
- **Sizes:** 12px, 15px, 16px, 18px
- **Line height:** 1.15, 1.20, 1.30, 1.40

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| caption | — | — | 12px | 1.4 | — |
| body-sm | — | — | 15px | 1.3 | — |
| subheading | — | — | 18px | 1.3 | — |
| heading-sm | — | — | 22px | 1.2 | — |
| heading | — | — | 42px | 1 | 0.05px |
| heading-lg | — | — | 64px | 0.9 | 0.05px |
| display | — | — | 144px | 0.75 | 0.05px |

## Spacing & Layout

**Density:** spacious

- **Page max-width:** 1200px
- **Section gap:** 40px
- **Card padding:** 30px
- **Element gap:** 10px

### Border Radius

- **cards:** 40px
- **buttons:** 300px
- **smallElements:** 5px
- **featuredPanels:** 60px

## Components

### Marquee Display Headline
**Role:** Hero and section title

Cervo weight 400, 144px on hero / 64-72px on sections, line-height 0.75-0.9, letter-spacing 0.05em, color Ink Black with selective words recolored Cherry Marquee. Sits as four stacked uppercase lines over a full-bleed photograph.

### Cherry Outline Button
**Role:** Primary call to action

1-2px solid Cherry Marquee border, transparent fill, Cherry Marquee text, 300px (pill) radius, 16-20px horizontal padding, Cervo or HelveticaNeueCyr at 16px. The signature button — red outline, white interior, never a filled red block.

### Cream Filled Button
**Role:** Secondary call to action (cart, bag, less prominent action)

Cream Bisque (#fee5ca) background, no border or 1px Ink Black, Ink Black text, 300px radius, 30px horizontal padding. Used for the shopping bag indicator and supporting actions that should feel warm rather than urgent.

### Ghost Navigation Item
**Role:** Top nav links (Flavours, Menu)

Text-only or 1px Ink Black border with rounded 300px radius, HelveticaNeueCyr 15-16px, black text. Sits in a row at the top-right of the screen with generous 30px horizontal gap between items.

### Cream Bisque Card
**Role:** Featured product, flavor panel, content block

Cream Bisque background, 40px corner radius, 30px padding, no border. Lifts warm content from the white canvas without using shadow. Sits inside a section with generous vertical breathing room.

### Hero Photograph Frame
**Role:** Full-bleed lifestyle / food photography

Edge-to-edge image with no padding. Text overlays sit directly on the photo using a high-contrast black or white headline. No gradient scrim, no dark overlay — the photo and type share the same z-plane.

### Inline Red Label
**Role:** Section link or 'FLAVOURS' style trigger

Cherry Marquee text in Cervo or HelveticaNeueCyr uppercase, often paired with a thin circle outline and small caret/arrow icon. Reads as a stamped label, not a button.

### Paragraph Block
**Role:** Long-form body copy beside the hero

HelveticaNeueCyr 16px weight 400, line-height 1.3-1.4, Ink Black, max-width roughly 400-500px so it sits as a narrow column next to the headline.

### Cart Badge
**Role:** Top-right shopping bag count

Small 1px Ink Black border square or rounded container with the count digit inside, positioned inline with the nav row.

### Scroll Cue Arrow
**Role:** Down-arrow prompt at the bottom of the hero

Thin Ink Black line forming a downward chevron or arrow with a vertical stem, positioned in the bottom-right of the hero. Decorative gesture, not an interactive element.

### Footer Band
**Role:** Site footer

Cervo or HelveticaNeueCyr at 16-18px, Ink Black text, Cherry Marquee accent for links and headings. No background tint — sits on canvas white with 36-40px top padding.

## Do's and Don'ts

### Do
- Stack Cervo display type four lines deep and let line-height collapse to 0.75 on the 144px hero size.
- Use Cherry Marquee (#b00e2f) as outline, link, and accent text — never as a filled button background.
- Set 0.05em positive letter-spacing on every Cervo size from 22px upward.
- Build every interactive element with a 300px (pill) radius.
- Lift secondary content with Cream Bisque (#fee5ca) fills at 40px radius, not with shadows.
- Let hero photography bleed edge-to-edge with text overlaid directly on the image — no scrim.
- Keep body copy in HelveticaNeueCyr weight 400 at 15-16px with 1.3-1.4 line-height so the display type stays the loudest thing on the page.

### Don't
- Don't fill a button solid Cherry Marquee — the brand signal is the red outline, not a red block.
- Don't apply drop shadows to cards, buttons, or panels — depth comes from cream surfaces, not elevation stacks.
- Don't set Cervo with line-height above 1.0 on display sizes; the compressed leading is the signature.
- Don't introduce gray or cool neutrals — every neutral should be warm (cream, white) or pure black.
- Don't use a second chromatic accent — Cherry Marquee is the only color allowed beyond the cream/black/white system.
- Don't switch the canvas to dark or use a dark-mode pattern — the brand is locked to a sunlit light theme.
- Don't set negative letter-spacing on Cervo — the 0.05em outward tracking is what makes the marquee read as signage.

## Elevation

The system avoids drop shadows entirely. Depth is created by warm cream surfaces, thick 1-2px colored borders, and the photographic bleed behind text — never by stacked shadow layers. If a component needs to feel elevated, give it a cream-tinted surface, not a shadow.

## Surfaces

- **Page Canvas** (`#ffffff`) — Default page background, all structural sections
- **Cream Card** (`#fee5ca`) — Featured panels, secondary callouts, warm-toned surface lift

## Imagery

Full-bleed lifestyle and food photography is the primary visual. Images fill the viewport edge-to-edge with no padding, no rounded corners, no gradient overlay — the photograph and the display type share the same plane. Subjects are hands holding ice cream bars, lips, and scoops, shot warm and close, cropped tight. The treatment is editorial and tactile rather than product-on-white: the object is held by a person, not staged on a surface. There are no illustrations, no abstract graphics, no 3D renders. Icons are minimal — thin outlines or 1px ink strokes that match the button-outline system. Imagery is image-heavy at the hero and text-dominant in supporting sections, so each section alternates between a photograph-first block and a copy-first block.

## Layout

The page is full-bleed at the hero (photograph fills the viewport, headline overlays top-left) and max-width 1200px centered for body sections. The hero uses an asymmetric composition: a massive stacked headline anchored to the left, a narrow paragraph column to the right of the headline, and a 'FLAVOURS' inline trigger tucked between them. Navigation is a minimal top bar with logo top-left and three items (cart, Flavours, Menu) pushed to the top-right, separated by 30px gaps. Below the hero, sections alternate between cream Bisque cards on a white canvas and white sections with red-outlined interactive elements, with 36-40px vertical breathing room between bands. Content arrangement is asymmetric — text-left/image-right is the dominant pattern, with cards and flavor blocks arranged in a single full-width column rather than multi-column grids. The overall density is spacious: every element has air around it, and the design uses the white canvas as a structural material, not just a background.

## Similar Brands

- **Magnum** — Same warm cream-and-red palette, lifestyle food photography cropped tight, and confidence with a single bold accent color across an otherwise neutral interface
- **Häagen-Dazs** — Edge-to-edge food photography with serif/display type overlaid, cream surface cards, and an editorial rather than e-commerce-density page rhythm
- **Salt & Straw** — Warm cream backgrounds, single chromatic accent, display type that plays off photography, and a parlor-brand voice that favors personality over UI density
- **Jeni's Splendid Ice Creams** — Bold condensed display type over lifestyle imagery, pill-shaped buttons with outlined treatment, and a hand-stamped menu-card feeling rather than a typical storefront grid
