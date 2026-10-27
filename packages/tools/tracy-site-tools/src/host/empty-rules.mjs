/**
 * Which elements a replacement may leave without words, shared with the residue sweep that plans the replacements
 * (`apps/tracy-web` `residue-sweep.js`, which reads this file as a leaf copied into its image). No imports: the web
 * image carries this file alone.
 */

/** Elements a replacement never leaves empty (`emptiedElement` in `replace.mjs`): a heading, a list item, a button, a link. */
export const CANNOT_EMPTY = new Set(['a', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'])

/** Elements that start a new run of text; inline tags (a, span, em, strong, custom elements) do not. */
export const TEXT_BLOCK = new Set(
  (
    'p h1 h2 h3 h4 h5 h6 li ul ol div section article figure figcaption button label header footer ' +
    'main nav aside td th tr table blockquote dt dd dl fieldset legend form option select textarea ' +
    'details summary pre address hr body html head title dialog search menu'
  ).split(' ')
)
