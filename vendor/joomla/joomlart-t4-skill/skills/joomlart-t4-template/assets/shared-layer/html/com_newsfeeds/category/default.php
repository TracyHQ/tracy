<?php

/**
 * Tracy — one News Feeds category (the list of feeds).
 *
 * Core splits this across default.php + default_items.php + default_children.php and renders the
 * feeds as a Bootstrap table; this view is self-contained and renders the same params as the
 * design's card grid, with subcategories as capsule chips. Shipping it alongside categories/ keeps
 * com_newsfeeds a complete set rather than a half-set (gotcha #65).
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Layout\FileLayout;
use Joomla\CMS\Layout\LayoutHelper;
use Joomla\CMS\Router\Route;
use Joomla\CMS\String\PunycodeHelper;
use Joomla\CMS\Uri\Uri;
use Joomla\Component\Newsfeeds\Site\Helper\RouteHelper;

/** @var \Joomla\Component\Newsfeeds\Site\View\Category\HtmlView $this */
$params      = $this->params;
$headingTag  = $params->get('show_page_heading') ? 'h2' : 'h1';
$children    = isset($this->children[$this->category->id]) ? $this->children[$this->category->id] : [];
$categoryImg = $this->category->getParams()->get('image');
?>
<div class="com-newsfeeds-category newsfeed-category">

    <div class="tracy-view-head">
        <?php if ($params->get('show_page_heading')) : ?>
            <h1 class="tracy-view-head__title"><?php echo $this->escape($params->get('page_heading')); ?></h1>
        <?php endif; ?>

        <?php if ($params->get('show_category_title', 1)) : ?>
            <<?php echo $headingTag; ?> class="tracy-view-head__title">
                <?php echo HTMLHelper::_('content.prepare', $this->category->title, '', 'com_newsfeeds.category.title'); ?>
            </<?php echo $headingTag; ?>>
        <?php endif; ?>

        <?php if ($params->get('show_tags', 1) && !empty($this->category->tags->itemTags)) : ?>
            <?php $this->category->tagLayout = new FileLayout('joomla.content.tags'); ?>
            <?php echo $this->category->tagLayout->render($this->category->tags->itemTags); ?>
        <?php endif; ?>

        <?php if ($params->get('show_description_image') && $categoryImg) : ?>
            <div class="tracy-card__media com-newsfeeds-category__image">
                <?php echo LayoutHelper::render('joomla.html.image', [
                    'src' => $categoryImg,
                    'alt' => empty($this->category->getParams()->get('image_alt')) && empty($this->category->getParams()->get('image_alt_empty'))
                        ? false
                        : $this->category->getParams()->get('image_alt'),
                ]); ?>
            </div>
        <?php endif; ?>

        <?php if ($params->get('show_description', 1) && $this->category->description) : ?>
            <div class="tracy-view-head__lead com-newsfeeds-category__description category-desc">
                <?php echo HTMLHelper::_('content.prepare', $this->category->description, '', 'com_newsfeeds.category'); ?>
            </div>
        <?php endif; ?>
    </div>

    <form action="<?php echo htmlspecialchars(Uri::getInstance()->toString(), ENT_COMPAT, 'UTF-8'); ?>" method="post" name="adminForm" id="adminForm">

        <?php if (($params->get('filter_field') !== 'hide' && $params->get('filter_field') == '1') || $params->get('show_pagination_limit')) : ?>
            <div class="tracy-filterbar">
                <?php if ($params->get('filter_field') !== 'hide' && $params->get('filter_field') == '1') : ?>
                    <div class="tracy-field">
                        <label for="filter-search"><?php echo Text::_('COM_NEWSFEEDS_FILTER_LABEL'); ?></label>
                        <input type="text" name="filter-search" id="filter-search" class="form-control"
                               value="<?php echo $this->escape($this->state->get('list.filter')); ?>"
                               onchange="document.adminForm.submit();"
                               placeholder="<?php echo $this->escape(Text::_('COM_NEWSFEEDS_FILTER_LABEL')); ?>">
                    </div>
                <?php endif; ?>

                <?php if ($params->get('show_pagination_limit')) : ?>
                    <div class="tracy-field">
                        <label for="limit"><?php echo Text::_('JGLOBAL_DISPLAY_NUM'); ?></label>
                        <?php echo $this->pagination->getLimitBox(); ?>
                    </div>
                <?php endif; ?>
            </div>
        <?php endif; ?>

        <?php if (empty($this->items)) : ?>
            <p class="tracy-empty"><?php echo Text::_('JGLOBAL_NO_MATCHING_RESULTS'); ?></p>
        <?php else : ?>
            <ul class="tracy-cardgrid com-newsfeeds-category__items">
                <?php foreach ($this->items as $item) : ?>
                    <li class="tracy-card">
                        <h2 class="tracy-card__title">
                            <a href="<?php echo Route::_(RouteHelper::getNewsfeedRoute($item->slug, $item->catid, $item->language)); ?>">
                                <?php echo $this->escape($item->name); ?>
                            </a>
                        </h2>

                        <?php if ($params->get('show_articles')) : ?>
                            <p class="tracy-card__meta"><?php echo Text::sprintf('COM_NEWSFEEDS_NUM_ARTICLES_COUNT', (int) $item->numarticles); ?></p>
                        <?php endif; ?>

                        <?php if ($params->get('show_link') && $item->link) : ?>
                            <a class="tracy-card__link" href="<?php echo $this->escape($item->link); ?>">
                                <?php echo $this->escape(PunycodeHelper::urlToUTF8($item->link)); ?>
                            </a>
                        <?php endif; ?>
                    </li>
                <?php endforeach; ?>
            </ul>
        <?php endif; ?>

        <?php if (($params->def('show_pagination', 2) == 1 || $params->get('show_pagination') == 2) && $this->pagination->pagesTotal > 1) : ?>
            <div class="tracy-pagination">
                <?php echo $this->pagination->getPagesLinks(); ?>
                <?php if ($params->def('show_pagination_results', 1)) : ?>
                    <p class="tracy-pagination__counter"><?php echo $this->pagination->getPagesCounter(); ?></p>
                <?php endif; ?>
            </div>
        <?php endif; ?>

        <input type="hidden" name="filter_order" value="<?php echo $this->escape($this->state->get('list.ordering')); ?>">
        <input type="hidden" name="filter_order_Dir" value="<?php echo $this->escape($this->state->get('list.direction')); ?>">
        <input type="hidden" name="limitstart" value="">
    </form>

    <?php if ($this->maxLevel != 0 && $children) : ?>
        <div class="com-newsfeeds-category__children cat-children">
            <h2 class="tracy-contact__heading"><?php echo Text::_('JGLOBAL_SUBCATEGORIES'); ?></h2>
            <ul class="tracy-chips">
                <?php foreach ($children as $child) : ?>
                    <li>
                        <a class="tracy-chip" href="<?php echo Route::_(RouteHelper::getCategoryRoute($child->id, $child->language)); ?>">
                            <?php echo $this->escape($child->title); ?>
                            <span class="tracy-chip__count"><?php echo (int) $child->numitems; ?></span>
                        </a>
                    </li>
                <?php endforeach; ?>
            </ul>
        </div>
    <?php endif; ?>
</div>
