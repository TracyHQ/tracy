TRACY — BRAND ASSET SET
=======================

Source: the brand Figma file (starburst mark + serif wordmark).
This set replaces the whole old set (arc mark + Archivo Bold, orange #F5821F).

mark/       standalone symbol, transparent background (800x800)
  tracy-mark-color.svg    terracotta — default
  tracy-mark-black.svg    single-colour black — print, light backgrounds
  tracy-mark-white.svg    single-colour white — on dark/photo backgrounds

lockup/     symbol + Tracy wordmark
  tracy-logo-horizontal-color.svg          orange mark + ink text (light bg)
  tracy-logo-horizontal-color-on-dark.svg  orange mark + white text (dark bg)
  tracy-logo-horizontal-black.svg          single-colour black
  tracy-logo-horizontal-white.svg          single-colour white
  tracy-logo-stacked-color/black/white.svg vertical version
  tracy-wordmark-black.svg                 text only

app-icon/   application icons
  tracy-app-icon-terracotta.svg  rounded orange bg — IN USE for build/
  tracy-app-icon-dark.svg        rounded ink bg
  tracy-avatar-terracotta.svg    sharp-cornered square (Figma original)
  tracy-avatar-dark.svg          sharp-cornered square (Figma original)

  Rounding: radius 22% of the side, mark shrunk to 82% — added because
  macOS/Windows need rounded icons; the Figma original is sharp-cornered.

badge/      mark placed on a background, for avatars/social
  tracy-badge-square-color.svg       orange mark on white
  tracy-badge-square-ink.svg         black mark on white
  tracy-badge-square-dark.svg        white mark on black
  tracy-badge-circle-terracotta.svg  white mark on orange circle
  tracy-badge-circle-ink.svg         black mark on white circle

banner/     ready-made backgrounds, for web/social
  tracy-banner-cream.svg       horizontal lockup on cream
  tracy-banner-dark-mono.svg   white lockup on ink
  tracy-banner-dark-color.svg  orange mark + white text on ink
  tracy-og-1200x630.svg        Open Graph image

cobrand/    co-branding with JoomlArt
  tracy-by-joomlart-ink.svg    JOOMLART in ink
  tracy-by-joomlart-navy.svg   JOOMLART in navy
  joomlart-wordmark-ink.svg    JOOMLART text only (ink)
  joomlart-wordmark-mono.svg   JOOMLART text only (currentColor)

favicon/
  tracy-favicon.svg   orange circle, cream rays — simplified for small sizes

COLOURS
  Terracotta  #BF5B3D
  Ink         #101010
  Cream bg    #EAE7E0
  Cream light #FAF6F0   (favicon only)
  Navy        #354150   (JOOMLART wordmark only)

TYPE
  The serif wordmark is converted to paths — no font install needed to render.

ORIGIN OF THIS SET
  Copied as-is from TracyHQ/tracy-desk `docs/design/brand/` on 02/09/2026.
  Change the identity in tracy-desk first, then copy it back — don't let the two drift apart.

WHERE THIS SET IS USED IN TCH
  The old set (arc mark, orange #F5821F) was removed from the code on 02/09/2026.

  workers/fleet-bar/src/pages.js       LOCKUP constant — horizontal lockup.
                                       Sign-in screen at cowork.tracy.ai/login.
  packages/ui/tracy-ui/src/components/brand/
                                       TracyMark     → mark-color, shared component
                                       TracyWordmark → wordmark; TracyName adds the word "Cowork"
                                       The design bench (@tracy/design) and the @tracy/dsh-brand plugin
                                       both import from here — one source, no hand copies (03/09/2026).
  packages/brand/tracy-brand/scripts/gen-palette.mjs
                                       favicon/tracy-favicon.svg → data URI, the plugin sets it on <link rel=icon>
  packages/desktop/tracy-desktop/build/icon.svg
                                       app-icon-terracotta, copied verbatim.

  TWO CHANGES versus the Figma export, required wherever SVG is embedded in code:

    1. CROP the viewBox to the actual drawing. Figma exports a frame much larger than the
       artwork — 62% of the horizontal lockup's frame is empty margin — so height=26
       gives a logo 10px tall.
         horizontal lockup  0 0 1600 800  ->  290 240 1020 320
         wordmark           0 0 1600 800  ->  450 255 700 292
    2. Text switches to currentColor. Both surfaces follow prefers-color-scheme,
       so a hard-coded fill #101010 disappears on dark backgrounds. The mark KEEPS
       terracotta: that is the brand colour, not a text colour.

  The word "Cowork" is live text, separated from the wordmark by a vertical bar — no
  asset pre-combines the company name with the product name. The two surfaces must be
  kept in sync by hand: `.brand .co` in pages.js and TracyName in tracy-brand.

  Paths in tracy-desk (build/icon.png, src/renderer/...) do NOT apply to this repo.

DON'T
  Change the ratio between text and symbol · rotate · add shadows/gradients ·
  place the on-dark version on a light background.
