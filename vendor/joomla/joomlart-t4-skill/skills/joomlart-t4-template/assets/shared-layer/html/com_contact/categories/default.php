<?php

/**
 * Tracy — com_contact category tree ("all contact categories").
 *
 * Joomla core renders this view as a stack of <h3> page-headers with a Bootstrap collapse button and
 * a `badge bg-info` count; the design asks for a ringed card grid on --surface (design-spec §6,
 * all-categories row). Nothing is collapsed: at this depth the whole tree fits, and children read as
 * capsule chips inside the parent's card, so the owner sees the structure without a JS toggle.
 *
 * Counts print as a real integer (gotcha #63: `Text::_('COM_CONTACT_NUM_ITEMS')` is the label
 * "Contact Count:" with no placeholder, so composing it with the number reads wrong).
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Joomla\Component\Contact\Site\Helper\RouteHelper;

/** @var \Joomla\Component\Contact\Site\View\Categories\HtmlView $this */
$params    = $this->params;
$parentId  = $this->parent->id;
$topLevel  = isset($this->items[$parentId]) ? $this->items[$parentId] : [];
$showCount = (int) $params->get('show_cat_items_cat', 1) === 1;
$showDesc  = (int) $params->get('show_subcat_desc_cat', 1) === 1;
$showEmpty = (bool) $params->get('show_empty_categories_cat');
?>
<div class="com-contact-categories categories-list">

    <div class="tracy-view-head">
        <?php if ($params->get('show_page_heading')) : ?>
            <h1 class="tracy-view-head__title"><?php echo $this->escape($params->get('page_heading')); ?></h1>
        <?php endif; ?>

        <?php if ($params->get('show_base_description')) : ?>
            <?php $baseDesc = $params->get('categories_description') ?: $this->parent->description; ?>
            <?php if ($baseDesc) : ?>
                <div class="tracy-view-head__lead category-desc base-desc">
                    <?php echo HTMLHelper::_('content.prepare', $baseDesc, '', 'com_contact.categories'); ?>
                </div>
            <?php endif; ?>
        <?php endif; ?>
    </div>

    <?php if (!$topLevel) : ?>
        <p class="tracy-empty"><?php echo Text::_('COM_CONTACT_NO_CONTACTS'); ?></p>
    <?php else : ?>
        <ul class="tracy-cardgrid com-contact-categories__items">
            <?php foreach ($topLevel as $item) : ?>
                <?php $children = $item->getChildren(); ?>
                <?php if (!$showEmpty && !$item->numitems && !count($children)) : ?>
                    <?php continue; ?>
                <?php endif; ?>
                <li class="tracy-card">
                    <h2 class="tracy-card__title">
                        <a href="<?php echo Route::_(RouteHelper::getCategoryRoute($item->id, $item->language)); ?>">
                            <?php echo $this->escape($item->title); ?>
                        </a>
                    </h2>

                    <?php if ($showCount) : ?>
                        <p class="tracy-card__meta">
                            <?php echo (int) $item->numitems; ?>
                            <?php echo (int) $item->numitems === 1 ? 'contact' : 'contacts'; ?>
                        </p>
                    <?php endif; ?>

                    <?php if ($showDesc && $item->description) : ?>
                        <div class="tracy-card__excerpt category-desc">
                            <?php echo HTMLHelper::_('content.prepare', $item->description, '', 'com_contact.categories'); ?>
                        </div>
                    <?php endif; ?>

                    <?php if ($children && $this->maxLevelcat > 1) : ?>
                        <ul class="tracy-chips">
                            <?php foreach ($children as $child) : ?>
                                <?php if (!$showEmpty && !$child->numitems && !count($child->getChildren())) : ?>
                                    <?php continue; ?>
                                <?php endif; ?>
                                <li>
                                    <a class="tracy-chip" href="<?php echo Route::_(RouteHelper::getCategoryRoute($child->id, $child->language)); ?>">
                                        <?php echo $this->escape($child->title); ?>
                                        <?php if ($showCount) : ?>
                                            <span class="tracy-chip__count"><?php echo (int) $child->numitems; ?></span>
                                        <?php endif; ?>
                                    </a>
                                </li>
                            <?php endforeach; ?>
                        </ul>
                    <?php endif; ?>
                </li>
            <?php endforeach; ?>
        </ul>
    <?php endif; ?>
</div>
