<?php
/**
 * Tracy — com_content / categories / default (the category TREE)
 *
 * Starts from the T4 base categories/default.php. Two changes, both required:
 *
 *   1. The design's wrapper class, so scss/_overrides-content.scss can render the tree as ringed
 *      cards on --surface (design-spec.md §6, all-categories.html). The cards themselves are in
 *      default_items.php.
 *   2. The base's inline expand/collapse script is rewritten. It is not cosmetic: the base version
 *      re-queries `.categories-list` for its BUTTONS (it should query the toggles), so one click
 *      flips the icon on every category at once and the aria-label goes out of step with the
 *      panel's real state. It also emits `data-toggle`, the Bootstrap 4 spelling, which BS5 —
 *      the bootstrap this template declares — ignores, so the panel never opens at all.
 *      The replacement binds one listener per toggle and drives the BS5 `collapse` class directly,
 *      with no dependency on which Bootstrap build T4 loaded.
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Layout\LayoutHelper;
use Joomla\Component\Content\Site\Helper\RouteHelper;

if (!class_exists('ContentHelperRoute')) {
    if (version_compare(JVERSION, '4', 'ge')) {
        abstract class ContentHelperRoute extends RouteHelper
        {
        };
    } else {
        JLoader::register('ContentHelperRoute', $com_path . '/helpers/route.php');
    }
}

HTMLHelper::_('behavior.core');

// Add strings for translations in Javascript.
Text::script('JGLOBAL_EXPAND_CATEGORIES');
Text::script('JGLOBAL_COLLAPSE_CATEGORIES');

$js = <<<JS
(function () {
	document.addEventListener('DOMContentLoaded', function () {
		var toggles = [].slice.call(document.querySelectorAll('.tracy-cattree__toggle'));

		toggles.forEach(function (toggle) {
			toggle.addEventListener('click', function (event) {
				event.preventDefault();

				var panel = document.querySelector(toggle.getAttribute('href'));

				if (!panel) {
					return;
				}

				var open = panel.classList.toggle('show');
				var icon = toggle.querySelector('span');

				if (icon) {
					icon.classList.toggle('icon-plus', !open);
					icon.classList.toggle('icon-minus', open);
				}

				toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
				toggle.setAttribute(
					'aria-label',
					Joomla.Text._(open ? 'JGLOBAL_COLLAPSE_CATEGORIES' : 'JGLOBAL_EXPAND_CATEGORIES')
				);
			});
		});
	});
})();
JS;

Factory::getDocument()->addScriptDeclaration($js);
?>
<div class="com-content-categories categories-list tracy-cattree">
	<?php
	echo LayoutHelper::render('joomla.content.categories_default', $this);
	echo $this->loadTemplate('items');
	?>
</div>
