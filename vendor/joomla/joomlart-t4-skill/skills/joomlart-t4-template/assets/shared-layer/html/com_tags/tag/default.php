<?php

/**
 * Tracy — com_tags single/multi tag listing.
 *
 * Structure follows the T4 base override (heading, tag description, items, pagination); what changes
 * is that the items sub-template now renders the blog's card grid (design-spec §6, tag.html row) and
 * the pagination uses the shared .tracy-pagination row.
 *
 * Gotcha #64: the base does `json_decode($this->item[0]->images)`, which emits a visible
 * "Passing null to parameter #1" deprecation on any tag saved without an image. Guarded with `?: '{}'`.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;

/** @var \Joomla\Component\Tags\Site\View\Tag\HtmlView $this */
$params      = $this->params;
$isSingleTag = count($this->item) === 1;
$headingTag  = $params->get('show_page_heading') ? 'h2' : 'h1';
?>
<div class="com-tags-tag tag-category <?php echo $this->pageclass_sfx; ?>">

    <div class="tracy-view-head">
        <?php if ($params->get('show_page_heading')) : ?>
            <h1 class="tracy-view-head__title"><?php echo $this->escape($params->get('page_heading')); ?></h1>
        <?php endif; ?>

        <?php if ($params->get('show_tag_title', 1)) : ?>
            <<?php echo $headingTag; ?> class="tracy-view-head__title">
                <?php echo HTMLHelper::_('content.prepare', $this->tags_title, '', 'com_tag.tag'); ?>
            </<?php echo $headingTag; ?>>
        <?php endif; ?>

        <?php // A per-tag image and description only make sense when exactly one tag is listed. ?>
        <?php if ($isSingleTag && ($params->get('tag_list_show_tag_image', 1) || $params->get('tag_list_show_tag_description', 1))) : ?>
            <?php $images = json_decode($this->item[0]->images ?: '{}'); ?>
            <?php if ($params->get('tag_list_show_tag_image', 1) == 1 && !empty($images->image_fulltext)) : ?>
                <div class="tracy-card__media com-tags-tag__image">
                    <img src="<?php echo htmlspecialchars($images->image_fulltext, ENT_COMPAT, 'UTF-8'); ?>"
                         alt="<?php echo htmlspecialchars($images->image_fulltext_alt ?? '', ENT_COMPAT, 'UTF-8'); ?>">
                </div>
            <?php endif; ?>
            <?php if ($params->get('tag_list_show_tag_description') == 1 && $this->item[0]->description) : ?>
                <div class="tracy-view-head__lead com-tags-tag__description category-desc">
                    <?php echo HTMLHelper::_('content.prepare', $this->item[0]->description, '', 'com_tags.tag'); ?>
                </div>
            <?php endif; ?>
        <?php endif; ?>

        <?php // Menu-level image/description, used when several tags share the page. ?>
        <?php if ($params->get('show_description_image', 1) == 1 && $params->get('tag_list_image')) : ?>
            <div class="tracy-card__media com-tags-tag__image">
                <img src="<?php echo htmlspecialchars($params->get('tag_list_image'), ENT_QUOTES, 'UTF-8'); ?>"
                     alt="<?php echo htmlspecialchars($params->get('tag_list_image_alt', ''), ENT_COMPAT, 'UTF-8'); ?>">
            </div>
        <?php endif; ?>
        <?php if ($params->get('tag_list_show_tag_description', 1) && $params->get('tag_list_description', '') > '') : ?>
            <div class="tracy-view-head__lead">
                <?php echo HTMLHelper::_('content.prepare', $params->get('tag_list_description'), '', 'com_tags.tag'); ?>
            </div>
        <?php endif; ?>
    </div>

    <?php echo $this->loadTemplate('items'); ?>

    <?php if (($params->def('show_pagination', 1) == 1 || $params->get('show_pagination') == 2) && $this->pagination->pagesTotal > 1) : ?>
        <div class="com-tags-tag__pagination tracy-pagination">
            <?php echo $this->pagination->getPagesLinks(); ?>
            <?php if ($params->def('show_pagination_results', 1)) : ?>
                <p class="tracy-pagination__counter"><?php echo $this->pagination->getPagesCounter(); ?></p>
            <?php endif; ?>
        </div>
    <?php endif; ?>
</div>
