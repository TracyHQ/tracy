/**
 * The block / attribute pairs whose words the Claude Cowork WordPress plugin translates when a page
 * is drawn (`BlockWords::PAIRS` in claude-cowork `wordpress/cowork/lib/BlockWords.php`, branch
 * `fix/tcqr-g60-plugins`, after 0.18.7; Tracy fills the words through `wp-block-words.js`). LANG-2
 * does not fail a WordPress release for an attribute on this list: it has a translation path. A pair
 * outside it still fails.
 *
 * 🔒 A pinned copy: the plugin lives in another repo. `template-customization-question-readiness-g60
 * .test.mjs` compares it with the plugin file when a checkout of the plugin sits beside this one
 * (`../claude-cowork*` or `$CLAUDE_COWORK_DIR`); change both together.
 */
export const PLUGIN_BLOCK_WORD_PAIRS = /** @type {Record<string, string[]>} */ ({
  'core/read-more': ['content'],
  'core/post-excerpt': ['moreText'],
  'core/search': ['label', 'placeholder', 'buttonText'],
  'core/post-author-name': ['prefix', 'suffix'],
  'core/post-author': ['byline'],
  'core/post-terms': ['prefix', 'suffix'],
  'core/post-navigation-link': ['label'],
  'core/query-pagination-next': ['label'],
  'core/query-pagination-previous': ['label'],
  'core/comments-pagination-next': ['label'],
  'core/comments-pagination-previous': ['label']
})

/** True when the plugin translates this attribute of this block. */
export const pluginTranslates = (/** @type {string} */ block, /** @type {string} */ attr) =>
  PLUGIN_BLOCK_WORD_PAIRS[block]?.includes(attr) ?? false
