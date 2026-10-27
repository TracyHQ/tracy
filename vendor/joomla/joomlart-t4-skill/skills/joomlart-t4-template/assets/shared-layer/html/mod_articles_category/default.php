<?php

/**
 * Tracy override for mod_articles_category.
 *
 * Joomla's core layout emits a bare `<ul class="mod-list">`, which inherits the list styling of
 * whatever surrounds it — in this template that meant a file glyph in front of every headline,
 * patched away with CSS in two separate places. The markup decision belongs here, once.
 *
 * The contract with the module's helper is unchanged: `$list`, `$grouped`, `$items`, `$params`.
 * Only the shape of the markup is ours.
 *
 * @package     Tracy
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Helper\ModuleHelper;
use Joomla\CMS\Language\Text;

if (!$list) {
    return;
}

$layout = $params->get('layout', 'default');
?>
<ul class="tracy-article-list">
    <?php if ($grouped) : ?>
        <?php foreach ($list as $groupName => $items) : ?>
        <li class="tracy-article-list__group">
            <h3 class="tracy-article-list__group-name"><?php echo Text::_($groupName); ?></h3>
            <ul class="tracy-article-list">
                <?php require ModuleHelper::getLayoutPath('mod_articles_category', $layout . '_items'); ?>
            </ul>
        </li>
        <?php endforeach; ?>
    <?php else : ?>
        <?php $items = $list; ?>
        <?php require ModuleHelper::getLayoutPath('mod_articles_category', $layout . '_items'); ?>
    <?php endif; ?>
</ul>
