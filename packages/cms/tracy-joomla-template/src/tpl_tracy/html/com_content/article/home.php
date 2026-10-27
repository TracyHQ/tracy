<?php

/**
 * Home: the `home` page kind — a hero drawn from the article's attribs (hero_* keys, written by
 * the seeder or the admin form declared in home.xml) and its full image, then the article body.
 * Chosen per article via attribs.article_layout = "tpl_tracy:home" or per menu item.
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Router\Route;

/** @var Joomla\Component\Content\Site\View\Article\HtmlView $this */

Factory::getApplication()->set('tracy.page', 'home');

$item   = $this->item;
$p      = $item->params;
$images = json_decode((string) ($item->images ?? '{}'));
$img    = !empty($images->image_fulltext) ? HTMLHelper::_('cleanImageURL', $images->image_fulltext)->url : '';

$eyebrow  = (string) $p->get('hero_eyebrow', '');
$headline = (string) $p->get('hero_headline', '') ?: $item->title;
$sub      = (string) $p->get('hero_sub', '') ?: trim(strip_tags((string) $item->introtext));
$cta      = (string) $p->get('hero_cta_label', '');
$ctaUrl   = (string) $p->get('hero_cta_url', '');
$cta2     = (string) $p->get('hero_cta2_label', '');
$cta2Url  = (string) $p->get('hero_cta2_url', '');
$body     = (string) $item->fulltext !== '' ? $item->fulltext : ($sub === trim(strip_tags((string) $item->introtext)) ? '' : $item->text);
?>
<section class="tracy-hero">
    <div class="tracy-hero__inner tracy-container">
        <div class="tracy-hero__copy">
            <?php if ($eyebrow !== '') : ?>
                <p class="tracy-eyebrow"><?php echo $this->escape($eyebrow); ?></p>
            <?php endif; ?>
            <h1 class="tracy-display"><?php echo $this->escape($headline); ?></h1>
            <?php if ($sub !== '') : ?>
                <p class="tracy-lead"><?php echo $this->escape($sub); ?></p>
            <?php endif; ?>
            <?php if ($cta !== '' || $cta2 !== '') : ?>
                <p class="tracy-actions">
                    <?php if ($cta !== '') : ?>
                        <a class="tracy-btn tracy-btn--primary" href="<?php echo Route::_($ctaUrl !== '' ? $ctaUrl : '#'); ?>"><?php echo $this->escape($cta); ?></a>
                    <?php endif; ?>
                    <?php if ($cta2 !== '') : ?>
                        <a class="tracy-btn tracy-btn--ghost" href="<?php echo Route::_($cta2Url !== '' ? $cta2Url : '#'); ?>"><?php echo $this->escape($cta2); ?></a>
                    <?php endif; ?>
                </p>
            <?php endif; ?>
        </div>
        <?php if ($img !== '') : ?>
            <figure class="tracy-hero__media">
                <img src="<?php echo htmlspecialchars($img, ENT_QUOTES, 'UTF-8'); ?>"
                     alt="<?php echo htmlspecialchars((string) ($images->image_fulltext_alt ?? ''), ENT_QUOTES, 'UTF-8'); ?>">
            </figure>
        <?php endif; ?>
    </div>
</section>

<?php if (trim($body) !== '') : ?>
    <?php // Full-bleed: the section library carries its own inner width, so bands can span the page. ?>
    <div class="tracy-home-body">
        <?php echo $body; ?>
    </div>
<?php endif; ?>
