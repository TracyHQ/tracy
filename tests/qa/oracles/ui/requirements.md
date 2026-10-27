# Requirements the ui layer checks (quoted, not paraphrased)

Source: the QA suite plan §4 `ui` and the W5 brief
`briefs/w5-ui.md`. The plan is outside this repository, so the lines below are copied
here and `pins.json` pins this file by hash.

## Plan §4 `ui` (translated from the Vietnamese original)

> The machine checks DOM/action semantics, accessible names, focus/keyboard, dialog recovery, overflow, console/network, placeholders/interpolation, missing keys and fallback. Geometric oracles can be encoded from DESIGN, for example a 44px header, focus as one 1px stroke; judging what looks good or bad and the wording is left to people.

> RED: drop an accessible name, break a focus trap, drop a translation key, drop a switch binding or create an overflow. Missing font/browser/bench artifact → ENV; no state oracle found → PENDING. A contact sheet always pairs the bench image and the product image at the same size, theme, locale and SHA.

## W5 brief (English, verbatim)

> Machine cases: accessible name of every control, keyboard reach and focus order, focus = one 1px stroke with no halo (DESIGN rule), dialog open/close/Escape recovery, no horizontal overflow at 390, console errors and failed network requests, raw i18n keys/placeholders or untranslated English on a non-English locale, banned vocabulary words on screen, switch binding (a switch off hides its piece via `data-tracy-hide`).

## Invariants derived (what the assertions encode)

- **overflow-390**: `document.documentElement.scrollWidth <= 390` (+1 px rounding) at a 390 px viewport.
- **console-network**: zero `console.error`, zero `pageerror`, zero response with status >= 400 or failed request, other than a
  fixed list of Storybook-internal noise (`vite-inject-mocker-entry.js`) recorded in `assertions.mjs`.
- **accessible-name**: every visible interactive control (button, link with href, input, select, textarea, role=button/tab/menuitem/
  checkbox/radio/switch/option/combobox/slider/textbox) has a non-empty accessible name (HTML-AAM subset, WCAG 4.1.2).
- **tab-reach**: every enabled visible control with `tabindex != -1`, and the active member of each composite widget, is reached by
  Tab within the control count + 4 presses; a `tabindex=-1` control outside a composite widget is a violation.
- **focus-stroke**: when a control takes keyboard focus, `box-shadow` has no blur/spread halo, `outline-width <= 1px`.
