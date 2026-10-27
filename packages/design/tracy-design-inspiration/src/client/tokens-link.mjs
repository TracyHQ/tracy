/**
 * The three token previews of every vendored system (`preview/colors.html`, `typography.html`,
 * `spacing.html`) load their tokens with `<link rel="stylesheet" href="../tokens.css">` — a URL
 * relative to the file on disk. The dialog draws them through `srcDoc`, and a `srcDoc` document
 * resolves relative URLs against the PAGE that holds the iframe, so on a lane the link asks for
 * `/<siteKey>/tokens.css`, gets the shell's 404, and every `var(--…)` in the page falls to its
 * initial value: Times, no colour, no spacing (measured on fijitrips, 06/09). The kit and the six
 * artifacts inline their `:root` block and never had this problem; all 456 previews share the one
 * link form counted below. No DOM here on purpose — a test runs it under node.
 */
const TOKENS_LINK = /<link\b[^>]*\bhref=(["'])\.\.\/tokens\.css\1[^>]*>/g

/**
 * The page with its `../tokens.css` link replaced by the tokens themselves; unchanged without one.
 * @param {string} html a Guideline page as text
 * @param {string} tokens the system's `tokens.css`
 * @returns {string}
 */
export function inlineTokens(html, tokens) {
  return html.replace(TOKENS_LINK, () => `<style data-tracy-tokens>${tokens}</style>`)
}
