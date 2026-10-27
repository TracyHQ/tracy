<?php

/**
 * Article: the `article` page kind of the content contract — title, meta, image, lead, body.
 * Content plugins still fire through $this->item->event.
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;

/** @var Joomla\Component\Content\Site\View\Article\HtmlView $this */

Factory::getApplication()->set('tracy.page', 'article');

$item   = $this->item;
$images = json_decode((string) ($item->images ?? '{}'));
$img    = !empty($images->image_fulltext) ? HTMLHelper::_('cleanImageURL', $images->image_fulltext)->url : '';
$author = $item->created_by_alias ?: ($item->author ?? '');
$date   = HTMLHelper::_('date', $item->publish_up ?: $item->created, Text::_('DATE_FORMAT_LC3'));
?>
<article class="tracy-article tracy-container">
    <header class="tracy-article__head">
        <h1 class="tracy-article__title"><?php echo $this->escape($item->title); ?></h1>
        <p class="tracy-meta">
            <time datetime="<?php echo HTMLHelper::_('date', $item->publish_up ?: $item->created, 'c'); ?>"><?php echo $date; ?></time>
            <?php if ($author !== '') : ?>
                <span class="tracy-meta__sep" aria-hidden="true">·</span>
                <span class="tracy-meta__author"><?php echo $this->escape($author); ?></span>
            <?php endif; ?>
        </p>
        <?php echo $item->event->afterDisplayTitle; ?>
    </header>

    <?php if ($img !== '') : ?>
        <figure class="tracy-article__media">
            <img src="<?php echo htmlspecialchars($img, ENT_QUOTES, 'UTF-8'); ?>"
                 alt="<?php echo htmlspecialchars((string) ($images->image_fulltext_alt ?? ''), ENT_QUOTES, 'UTF-8'); ?>">
            <?php if (!empty($images->image_fulltext_caption)) : ?>
                <figcaption><?php echo $this->escape($images->image_fulltext_caption); ?></figcaption>
            <?php endif; ?>
        </figure>
    <?php endif; ?>

    <?php echo $item->event->beforeDisplayContent; ?>
    <div class="tracy-article__body tracy-prose">
        <?php echo $item->text; ?>
    </div>
    <?php echo $item->event->afterDisplayContent; ?>
</article>
