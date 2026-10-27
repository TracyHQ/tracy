/**
 * The buttons a visitor of the preview sees, as source for a probe (after PAGE_HELPERS): the same
 * selection the collapsed-button detector reads, so every button detector judges the same buttons.
 */
export const BUTTON_SELECTOR =
  'a.btn, button, .btn, input[type=submit], input[type=button], input[type=reset], [class*="button"]:is(a, button), ' +
  // a link button whose class names a variant or a family of its own, with no plain .btn (Tracy
  // Business EmDash's a.btn-primary / a.btn-outline-ink, Tracy Business Joomla's a.tb-btn): before,
  // no button check read them, and a square outline next to the system's pill passed (15/10/2026)
  'a[class^="btn-"], a[class*=" btn-"], a[class*="-btn"], a[class*="__btn"]'
