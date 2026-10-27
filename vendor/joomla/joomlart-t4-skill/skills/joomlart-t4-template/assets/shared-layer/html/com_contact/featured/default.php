<?php

/**
 * Tracy — com_contact featured contacts.
 *
 * The T4 base theme ships nothing for this view, so core's Bootstrap table would surface the day an
 * owner adds a "Featured Contacts" menu item (gotcha #65). Same card grid as the contact directory.
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

/** @var \Joomla\Component\Contact\Site\View\Featured\HtmlView $this */
$params    = $this->params;
$levels    = $this->getCurrentUser()->getAuthorisedViewLevels();
$showImage = $params->get('show_image_heading');
?>
<div class="com-contact-featured">

    <?php if ($params->get('show_page_heading')) : ?>
        <div class="tracy-view-head">
            <h1 class="tracy-view-head__title"><?php echo $this->escape($params->get('page_heading')); ?></h1>
        </div>
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
            <ul class="tracy-cardgrid com-contact-featured__items">
                <?php foreach ($this->items as $item) : ?>
                    <?php if (!in_array($item->access, $levels)) : ?>
                        <?php continue; ?>
                    <?php endif; ?>
                    <?php $link = Route::_(RouteHelper::getContactRoute($item->slug, $item->catid, $item->language)); ?>
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

                        <?php if ($params->get('show_email_headings') && !empty($item->email_to)) : ?>
                            <p class="tracy-card__meta"><?php echo $item->email_to; ?></p>
                        <?php endif; ?>

                        <?php if ($params->get('show_telephone_headings') && !empty($item->telephone)) : ?>
                            <p class="tracy-card__meta"><?php echo $this->escape($item->telephone); ?></p>
                        <?php endif; ?>
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
