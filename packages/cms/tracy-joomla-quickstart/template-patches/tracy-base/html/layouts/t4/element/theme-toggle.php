<?php
/**
 * Light/dark switch of the header blocks (header-1.html, header-2.html). An element, not markup in
 * the block, so its label goes through the language file. js/darkmode.js wires [data-tracy-theme-toggle].
 */
defined('_JEXEC') or die;

use Joomla\CMS\Language\Text;
?>
<button type="button"
        class="tracy-theme-toggle"
        data-tracy-theme-toggle
        aria-pressed="false"
        aria-label="<?php echo htmlspecialchars(Text::_('TPL_TRACY_THEME_TOGGLE'), ENT_QUOTES, 'UTF-8'); ?>">
  <span class="tracy-theme-toggle__icon" aria-hidden="true"></span>
</button>
