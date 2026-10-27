<?php

/**
 * One card of the listing: name (title), kind (first tag, else category), image (intro image).
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Router\Route;
use Joomla\Component\Content\Site\Helper\RouteHelper;

/** @var Joomla\Component\Content\Site\View\Category\HtmlView $this */

$item   = $this->item;
$images = json_decode((string) ($item->images ?? '{}'));
$img    = !empty($images->image_intro) ? HTMLHelper::_('cleanImageURL', $images->image_intro)->url : '';
$link   = Route::_(RouteHelper::getArticleRoute($item->slug, $item->catid, $item->language));
$kind   = !empty($item->tags->itemTags[0]->title) ? $item->tags->itemTags[0]->title : (string) ($item->category_title ?? '');
$text   = HTMLHelper::_('string.truncate', strip_tags((string) $item->introtext), 160);
?>
<li class="tracy-grid__item tracy-card">
    <?php if ($img !== '') : ?>
        <a class="tracy-card__media" href="<?php echo $link; ?>" tabindex="-1" aria-hidden="true">
            <img src="<?php echo htmlspecialchars($img, ENT_QUOTES, 'UTF-8'); ?>"
                 alt="<?php echo htmlspecialchars((string) ($images->image_intro_alt ?? ''), ENT_QUOTES, 'UTF-8'); ?>"
                 loading="lazy">
        </a>
    <?php endif; ?>
    <div class="tracy-card__body">
        <?php if ($kind !== '') : ?>
            <p class="tracy-eyebrow"><?php echo $this->escape($kind); ?></p>
        <?php endif; ?>
        <h3 class="tracy-card__title"><a href="<?php echo $link; ?>"><?php echo $this->escape($item->title); ?></a></h3>
        <?php if ($text !== '') : ?>
            <p class="tracy-card__text"><?php echo $text; ?></p>
        <?php endif; ?>
    </div>
</li>
