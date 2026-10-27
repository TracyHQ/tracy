<?php

/**
 * Tracy — the all-tags page.
 *
 * Same parts as the T4 base override (heading, description image, description, items); the items
 * sub-template is what changes — design-spec §6 (tags.html) wants the tag cloud as capsule chips.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;

/** @var \Joomla\Component\Tags\Site\View\Tags\HtmlView $this */
$params           = $this->params;
$description      = $params->get('all_tags_description');
$descriptionImage = $params->get('all_tags_description_image');
?>
<div class="com-tags tag-category <?php echo $this->pageclass_sfx; ?>">

    <div class="tracy-view-head">
        <?php if ($params->get('show_page_heading')) : ?>
            <h1 class="tracy-view-head__title"><?php echo $this->escape($params->get('page_heading')); ?></h1>
        <?php endif; ?>

        <?php if ($params->get('all_tags_show_description_image') && !empty($descriptionImage)) : ?>
            <div class="tracy-card__media com-tags__image">
                <img src="<?php echo htmlspecialchars($descriptionImage, ENT_QUOTES, 'UTF-8'); ?>"
                     alt="<?php echo htmlspecialchars($params->get('all_tags_description_image_alt', ''), ENT_COMPAT, 'UTF-8'); ?>">
            </div>
        <?php endif; ?>

        <?php if (!empty($description)) : ?>
            <div class="tracy-view-head__lead com-tags__description">
                <?php echo HTMLHelper::_('content.prepare', $description, '', 'com_tags.tags'); ?>
            </div>
        <?php endif; ?>
    </div>

    <?php echo $this->loadTemplate('items'); ?>
</div>
