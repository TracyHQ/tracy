// Neutral labels provide no process copy. Keep the rule shared by planning, cleanup and served-page checks.
const LABEL =
  /^(?:steps?|items?|stage|phase|schritt|etappe|passaggio|fase|\u00e9tape|etape|stap|paso|b\u01b0\u1edbc|m\u1ee5c|\u6b65\u9aa4|\u6b65\u9a5f)(?:\s*\d+)?$/iu

/** True for an empty label, a bare number or a neutral step/item label, never for meaningful copy. */
export function isProcessPlaceholder(value) {
  const text = String(value ?? '')
    .replace(/<[^>]*>|\(\([^)]*\)\)/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/[\s.:#()-]+/g, ' ')
    .trim()
  return text === '' || /^\p{N}+$/u.test(text) || LABEL.test(text)
}
