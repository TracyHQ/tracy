<?php

/**
 * Tracy — com_contact contact directory (one category).
 *
 * Core renders this through `joomla.content.category_default` + a `default_items` sub-template whose
 * markup is still Bootstrap-2 (`span2`/`row-striped`). This view is self-contained instead: the same
 * params, rendered as the design's ringed card grid with hairline-separated detail rows, so the page
 * needs no sub-template and no Bootstrap grid classes.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Joomla\CMS\Uri\Uri;
use Joomla\Component\Contact\Site\Helper\RouteHelper;

/** @var \Joomla\Component\Contact\Site\View\Category\HtmlView $this */
$params    = $this->params;
$levels    = $this->getCurrentUser()->getAuthorisedViewLevels();
$children  = isset($this->children[$this->category->id]) ? $this->children[$this->category->id] : [];
$showImage = $params->get('show_image_heading');
?>
<div class="com-contact-category">

    <div class="tracy-view-head">
        <?php if ($params->get('show_page_heading')) : ?>
            <h1 class="tracy-view-head__title"><?php echo $this->escape($params->get('page_heading')); ?></h1>
        <?php elseif ($params->get('show_category_title', 1)) : ?>
            <h1 class="tracy-view-head__title"><?php echo $this->escape($this->category->title); ?></h1>
        <?php endif; ?>

        <?php if ($params->get('show_description', 1) && $this->category->description) : ?>
            <div class="tracy-view-head__lead category-desc">
                <?php echo HTMLHelper::_('content.prepare', $this->category->description, '', 'com_contact.category'); ?>
            </div>
        <?php endif; ?>
    </div>

    <?php if ($children && $params->get('show_subcat_desc', 1)) : ?>
        <ul class="tracy-chips com-contact-category__children">
            <?php foreach ($children as $child) : ?>
                <?php if (!in_array($child->access, $levels)) : ?>
                    <?php continue; ?>
                <?php endif; ?>
                <li>
                    <a class="tracy-chip" href="<?php echo Route::_(RouteHelper::getCategoryRoute($child->id, $child->language)); ?>">
                        <?php echo $this->escape($child->title); ?>
                        <span class="tracy-chip__count"><?php echo (int) $child->numitems; ?></span>
                    </a>
                </li>
            <?php endforeach; ?>
        </ul>
    <?php endif; ?>

    <form action="<?php echo htmlspecialchars(Uri::getInstance()->toString(), ENT_COMPAT, 'UTF-8'); ?>" method="post" name="adminForm" id="adminForm">

        <?php if ($params->get('filter_field') || $params->get('show_pagination_limit')) : ?>
            <div class="tracy-filterbar">
                <?php if ($params->get('filter_field')) : ?>
                    <div class="tracy-field">
                        <label for="filter-search"><?php echo Text::_('COM_CONTACT_FILTER_SEARCH_DESC'); ?></label>
                        <input
                            type="text"
                            name="filter-search"
                            id="filter-search"
                            class="form-control"
                            value="<?php echo $this->escape($this->state->get('list.filter')); ?>"
                            onchange="document.adminForm.submit();"
                            placeholder="<?php echo $this->escape(Text::_('COM_CONTACT_FILTER_SEARCH_DESC')); ?>">
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
            <p class="tracy-empty"><?php echo Text::_('COM_CONTACT_NO_CONTACTS'); ?></p>
        <?php else : ?>
            <ul class="tracy-cardgrid com-contact-category__items">
                <?php foreach ($this->items as $item) : ?>
                    <?php if (!in_array($item->access, $levels)) : ?>
                        <?php continue; ?>
                    <?php endif; ?>
                    <?php
                        $link     = Route::_(RouteHelper::getContactRoute($item->slug, $item->catid, $item->language));
                        $location = [];

                        if ($params->get('show_suburb_headings') && !empty($item->suburb)) {
                            $location[] = $item->suburb;
                        }

                        if ($params->get('show_state_headings') && !empty($item->state)) {
                            $location[] = $item->state;
                        }

                        if ($params->get('show_country_headings') && !empty($item->country)) {
                            $location[] = $item->country;
                        }
                    ?>
                    <li class="tracy-card">
                        <?php if ($showImage && $item->image) : ?>
                            <div class="tracy-card__media">
                                <a href="<?php echo $link; ?>">
                                    <?php echo HTMLHelper::_('image', $item->image, $this->escape($item->name)); ?>
                                </a>
                            </div>
                        <?php endif; ?>

                        <?php if ($params->get('show_position_headings') && $item->con_position) : ?>
                            <p class="tracy-card__eyebrow"><?php echo $this->escape($item->con_position); ?></p>
                        <?php endif; ?>

                        <h2 class="tracy-card__title">
                            <a href="<?php echo $link; ?>"><?php echo $this->escape($item->name); ?></a>
                        </h2>

                        <?php echo $item->event->afterDisplayTitle; ?>
                        <?php echo $item->event->beforeDisplayContent; ?>

                        <?php if ($location) : ?>
                            <p class="tracy-card__meta"><?php echo $this->escape(implode(', ', $location)); ?></p>
                        <?php endif; ?>

                        <?php
                            $rows = [];

                            if ($params->get('show_email_headings') && !empty($item->email_to)) {
                                $rows[] = [Text::_('JGLOBAL_EMAIL'), $item->email_to];
                            }

                            if ($params->get('show_telephone_headings') && !empty($item->telephone)) {
                                $rows[] = [Text::_('COM_CONTACT_TELEPHONE'), $this->escape($item->telephone)];
                            }

                            if ($params->get('show_mobile_headings') && !empty($item->mobile)) {
                                $rows[] = [Text::_('COM_CONTACT_MOBILE'), $this->escape($item->mobile)];
                            }

                            if ($params->get('show_fax_headings') && !empty($item->fax)) {
                                $rows[] = [Text::_('COM_CONTACT_FAX'), $this->escape($item->fax)];
                            }
                        ?>
                        <?php if ($rows) : ?>
                            <div class="tracy-deflist">
                                <?php foreach ($rows as $row) : ?>
                                    <div class="tracy-deflist__row">
                                        <span class="tracy-deflist__key"><?php echo $row[0]; ?></span>
                                        <span class="tracy-deflist__val"><?php echo $row[1]; ?></span>
                                    </div>
                                <?php endforeach; ?>
                            </div>
                        <?php endif; ?>

                        <?php echo $item->event->afterDisplayContent; ?>
                    </li>
                <?php endforeach; ?>
            </ul>
        <?php endif; ?>

        <?php if ($params->get('show_pagination', 2) && $this->pagination->pagesTotal > 1) : ?>
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
</div>
