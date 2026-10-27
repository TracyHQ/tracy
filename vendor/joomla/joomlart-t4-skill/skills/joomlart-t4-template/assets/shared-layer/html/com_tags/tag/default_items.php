<?php

/**
 * Tracy — the tagged-items grid.
 *
 * The T4 base override renders a Bootstrap `.list-group`, which is a boxed list with its own borders
 * and radius; design-spec §6 says a tag page uses the SAME card grid as the blog, so this ships
 * .tracy-cardgrid + .tracy-card (18px radius, 1px containment ring, no shadow).
 *
 * Two base defects fixed on the way: `json_decode($item->core_images)` is null-guarded (gotcha #64),
 * and the filter/limit controls now use the design's field vocabulary instead of an `.input-group`.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Joomla\CMS\Uri\Uri;
use Joomla\Component\Tags\Site\Helper\RouteHelper;

/** @var \Joomla\Component\Tags\Site\View\Tag\HtmlView $this */
$this->getDocument()->getWebAssetManager()->useScript('com_tags.tag-default');

$params = $this->params;
?>
<form action="<?php echo htmlspecialchars(Uri::getInstance()->toString(), ENT_COMPAT, 'UTF-8'); ?>" method="post" name="adminForm" id="adminForm" class="com-tags-tag__items">

    <?php if ($params->get('filter_field') || $params->get('show_pagination_limit')) : ?>
        <div class="tracy-filterbar com-tags-tag__filters">
            <?php if ($params->get('filter_field')) : ?>
                <div class="tracy-field">
                    <label for="filter-search"><?php echo Text::_('COM_TAGS_TITLE_FILTER_LABEL'); ?></label>
                    <input type="text" name="filter-search" id="filter-search" class="form-control"
                           value="<?php echo $this->escape($this->state->get('list.filter')); ?>"
                           placeholder="<?php echo $this->escape(Text::_('COM_TAGS_TITLE_FILTER_LABEL')); ?>">
                </div>
                <button type="submit" name="filter-search-button" class="btn btn-secondary">
                    <?php echo Text::_('JSEARCH_FILTER_SUBMIT'); ?>
                </button>
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
        <p class="tracy-empty"><?php echo Text::_('COM_TAGS_NO_ITEMS'); ?></p>
    <?php else : ?>
        <ul class="tracy-cardgrid com-tags-tag__category" itemscope itemtype="https://schema.org/ItemList">
            <?php foreach ($this->items as $item) : ?>
                <?php
                    // Gotcha #64: core_images is NULL on any item saved without an image, and an
                    // unguarded json_decode prints a deprecation notice into the card.
                    $images     = json_decode($item->core_images ?: '{}');
                    $isLinkable = $item->type_alias !== 'com_users.category' && $item->type_alias !== 'com_banners.category';
                    $itemRoute  = $isLinkable
                        ? Route::_(RouteHelper::getItemRoute($item->content_item_id, $item->core_alias, $item->core_catid, $item->core_language, $item->type_alias, $item->router))
                        : '';
                ?>
                <li class="tracy-card" itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">

                    <?php if ($params->get('tag_list_show_item_image', 1) == 1 && !empty($images->image_intro)) : ?>
                        <div class="tracy-card__media item-tag-image">
                            <?php if ($itemRoute) : ?>
                                <a href="<?php echo $itemRoute; ?>" itemprop="url">
                                    <img src="<?php echo htmlspecialchars($images->image_intro, ENT_COMPAT, 'UTF-8'); ?>"
                                         alt="<?php echo htmlspecialchars($images->image_intro_alt ?? '', ENT_COMPAT, 'UTF-8'); ?>" itemprop="image">
                                </a>
                            <?php else : ?>
                                <img src="<?php echo htmlspecialchars($images->image_intro, ENT_COMPAT, 'UTF-8'); ?>"
                                     alt="<?php echo htmlspecialchars($images->image_intro_alt ?? '', ENT_COMPAT, 'UTF-8'); ?>" itemprop="image">
                            <?php endif; ?>
                        </div>
                    <?php endif; ?>

                    <h2 class="tracy-card__title item-tag-title" itemprop="name">
                        <?php if ($isLinkable) : ?>
                            <a href="<?php echo Route::_($item->link); ?>" itemprop="url"><?php echo $this->escape($item->core_title); ?></a>
                        <?php else : ?>
                            <?php echo $this->escape($item->core_title); ?>
                        <?php endif; ?>
                    </h2>

                    <?php echo $item->event->afterDisplayTitle; ?>

                    <?php if ($params->get('tag_list_show_item_description', 1)) : ?>
                        <?php echo $item->event->beforeDisplayContent; ?>
                        <div class="tracy-card__excerpt tag-body" itemprop="description">
                            <?php echo HTMLHelper::_('string.truncate', $item->core_body, $params->get('tag_list_item_maximum_characters')); ?>
                        </div>
                        <?php echo $item->event->afterDisplayContent; ?>
                    <?php endif; ?>
                </li>
            <?php endforeach; ?>
        </ul>
    <?php endif; ?>

    <input type="hidden" name="filter_order" value="">
    <input type="hidden" name="filter_order_Dir" value="">
    <input type="hidden" name="limitstart" value="">
    <input type="hidden" name="task" value="">
</form>
