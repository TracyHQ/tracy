<?php

/**
 * Tracy — com_newsfeeds category tree.
 *
 * Neither Joomla core nor the T4 base theme styles this view for a template, so without an override a
 * News Feeds menu item drops raw `page-header` headings and `badge bg-info` counts onto the page
 * (gotcha #65). Rendered here as the same ringed card grid the contact-category tree uses, with the
 * child feeds as capsule chips — one vocabulary across every "tree of categories" page.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Joomla\Component\Newsfeeds\Site\Helper\RouteHelper;

/** @var \Joomla\Component\Newsfeeds\Site\View\Categories\HtmlView $this */
$params    = $this->params;
$parentId  = $this->parent->id;
$topLevel  = isset($this->items[$parentId]) ? $this->items[$parentId] : [];
$showCount = (int) $params->get('show_cat_items_cat', 1) === 1;
$showDesc  = (int) $params->get('show_subcat_desc_cat', 1) === 1;
$showEmpty = (bool) $params->get('show_empty_categories_cat');
?>
<div class="com-newsfeeds-categories categories-list">

    <div class="tracy-view-head">
        <?php if ($params->get('show_page_heading')) : ?>
            <h1 class="tracy-view-head__title"><?php echo $this->escape($params->get('page_heading')); ?></h1>
        <?php endif; ?>

        <?php if ($params->get('show_base_description')) : ?>
            <?php $baseDesc = $params->get('categories_description') ?: $this->parent->description; ?>
            <?php if ($baseDesc) : ?>
                <div class="tracy-view-head__lead category-desc base-desc">
                    <?php echo HTMLHelper::_('content.prepare', $baseDesc, '', 'com_newsfeeds.categories'); ?>
                </div>
            <?php endif; ?>
        <?php endif; ?>
    </div>

    <?php if (!$topLevel) : ?>
        <p class="tracy-empty"><?php echo Text::_('JGLOBAL_NO_MATCHING_RESULTS'); ?></p>
    <?php else : ?>
        <ul class="tracy-cardgrid com-newsfeeds-categories__items">
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
                            <?php echo (int) $item->numitems === 1 ? 'feed' : 'feeds'; ?>
                        </p>
                    <?php endif; ?>

                    <?php if ($showDesc && $item->description) : ?>
                        <div class="tracy-card__excerpt com-newsfeeds-categories__description category-desc">
                            <?php echo HTMLHelper::_('content.prepare', $item->description, '', 'com_newsfeeds.categories'); ?>
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
