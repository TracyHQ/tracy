<?php

/**
 * Tracy override for one item of mod_articles_category.
 *
 * Core wraps every optional field in its own `<span>` and leaves them as siblings of the title,
 * so date, author and category run on as one unpunctuated line. Here the title is the row and
 * everything else is a meta line beneath it — which is also why the separators can be a border
 * on the row rather than a glyph in front of it.
 *
 * @package     Tracy
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Layout\LayoutHelper;

?>
<?php foreach ($items as $item) : ?>
<li class="tracy-article-list__item">
    <?php if ($params->get('link_titles') == 1) : ?>
        <?php echo HTMLHelper::_(
            'link',
            htmlspecialchars($item->link, ENT_COMPAT, 'UTF-8', false),
            htmlspecialchars($item->title, ENT_COMPAT, 'UTF-8', false),
            ['class' => 'tracy-article-list__title ' . $item->active]
        ); ?>
    <?php else : ?>
        <span class="tracy-article-list__title"><?php echo htmlspecialchars($item->title, ENT_COMPAT, 'UTF-8'); ?></span>
    <?php endif; ?>

    <?php
    // One meta line, assembled first so the separators only appear between fields that exist.
    $meta = [];

    if ($item->displayDate) {
        $meta[] = '<span class="tracy-article-list__date">'
            . htmlspecialchars($item->displayDate, ENT_COMPAT, 'UTF-8') . '</span>';
    }

    if ($params->get('show_author') && $item->displayAuthorName) {
        $meta[] = '<span class="tracy-article-list__author">'
            . htmlspecialchars($item->displayAuthorName, ENT_COMPAT, 'UTF-8') . '</span>';
    }

    if ($item->displayCategoryTitle) {
        $meta[] = '<span class="tracy-article-list__category">'
            . htmlspecialchars($item->displayCategoryTitle, ENT_COMPAT, 'UTF-8') . '</span>';
    }

    if ($item->displayHits) {
        $meta[] = '<span class="tracy-article-list__hits">'
            . htmlspecialchars($item->displayHits, ENT_COMPAT, 'UTF-8') . '</span>';
    }
    ?>
    <?php if ($meta) : ?>
        <p class="tracy-article-list__meta"><?php echo implode('<span aria-hidden="true"> · </span>', $meta); ?></p>
    <?php endif; ?>

    <?php if ($params->get('show_tags', 0) && $item->tags->itemTags) : ?>
        <div class="tracy-article-list__tags">
            <?php echo LayoutHelper::render('joomla.content.tags', $item->tags->itemTags); ?>
        </div>
    <?php endif; ?>

    <?php if ($params->get('show_introtext')) : ?>
        <p class="tracy-article-list__introtext"><?php echo $item->displayIntrotext; ?></p>
    <?php endif; ?>

    <?php if ($params->get('show_readmore')) : ?>
        <p class="tracy-article-list__readmore">
            <a class="tracy-article-list__readmore-link <?php echo $item->active; ?>" href="<?php echo $item->link; ?>">
                <?php if (!$item->params->get('access-view')) : ?>
                    <?php echo Text::_('MOD_ARTICLES_CATEGORY_REGISTER_TO_READ_MORE'); ?>
                <?php elseif ($item->alternative_readmore) : ?>
                    <?php echo $item->alternative_readmore; ?>
                <?php elseif ($params->get('show_readmore_title', 0)) : ?>
                    <?php echo Text::_('MOD_ARTICLES_CATEGORY_READ_MORE'); ?>
                    <?php echo HTMLHelper::_('string.truncate', $item->title, $params->get('readmore_limit'), true, false); ?>
                <?php else : ?>
                    <?php echo Text::_('MOD_ARTICLES_CATEGORY_READ_MORE_TITLE'); ?>
                <?php endif; ?>
            </a>
        </p>
    <?php endif; ?>
</li>
<?php endforeach; ?>
