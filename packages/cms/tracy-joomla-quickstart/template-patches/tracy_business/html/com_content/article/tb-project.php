<?php
/**
 * Tracy Business — Project page (com_content article, alternative layout `tb-project`).
 *
 * page-sections.md §4.5: ink hero (eyebrow = the `tb-type` field or the category, H1, lede = `tb-lede` or
 * the intro text, full image 3:2) → the six-cell fact strip (Client · Region · Area · Duration · Delivered ·
 * Role — only the fields the article has) → Scope of work (`tb-scope`, one row per line) + the article body,
 * beside the quote box (`tb-quote` / `tb-quote-by`) and the "Discuss a similar project" button to the Contact
 * page → the progress gallery (`tb-gallery` subform: image + caption) on paper-2 → Other projects (four
 * newest of the tree, same sector first, this one excluded). Every block is skipped when its data is empty.
 *
 * An article with no scope, body or quote (most of the demo projects) would leave the scope band holding
 * only the button: a 72px-padded empty paper band. The button then sits in the hero under the lede and the
 * band is skipped.
 *
 * The hero and gallery bands break out of the T4 main-body container (`.tb-proj-bleed`); breadcrumbs are
 * the module position, not this view.
 *
 * @package northgate
 */

defined('_JEXEC') or die;

use Joomla\CMS\Language\Text;
use Joomla\CMS\Layout\LayoutHelper;

require_once dirname(__DIR__) . '/category/tb-projects_fields.php';

$item    = $this->item;
$params  = $item->params;
$esc     = static fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$canEdit = $params->get('access-edit');
$F       = ng_project_fields($item);
$images  = json_decode((string) $item->images, true) ?: [];

$eyebrow = ng_pf($F, 'tb-type') !== '' ? ng_pf($F, 'tb-type') : (string) ($item->category_title ?? '');
$lede    = ng_pf($F, 'tb-lede') !== '' ? '<p>' . $esc(ng_pf($F, 'tb-lede')) . '</p>' : trim((string) $item->introtext);
$hero    = ng_article_image($item, 'image_fulltext');
$heroAlt = (string) ($images['image_fulltext_alt'] ?? $item->title);
$facts   = [];
foreach (['tb-client', 'tb-region', 'tb-area', 'tb-duration', 'tb-delivered', 'tb-role'] as $k) if (ng_pf($F, $k) !== '') $facts[$k] = ng_pf($F, $k);
$scope   = array_values(array_filter(array_map('trim', preg_split('/\r\n|\r|\n/', ng_pf($F, 'tb-scope'))), static fn ($l) => $l !== ''));
$body    = trim((string) $item->fulltext);
$quote   = ng_pf($F, 'tb-quote');
$quoteBy = ng_pf($F, 'tb-quote-by');
$ctaUrl  = ng_contact_url();
$gallery = ng_project_gallery($F);
$others  = ng_related_projects($item, 4);
$hasLeft = $scope || $body !== '';
$heroCta = !$hasLeft && $quote === '' && $ctaUrl !== '';
$hasRight = $quote !== '' || ($ctaUrl !== '' && !$heroCta);
?>
<article class="tb-proj" itemscope itemtype="https://schema.org/CreativeWork">
    <?php if ($canEdit) : ?>
        <div class="tb-page__edit"><?php echo LayoutHelper::render('joomla.content.icons', ['params' => $params, 'item' => $item, 'print' => false]); ?></div>
    <?php endif; ?>

    <header class="tb-proj-hero tb-proj-bleed">
        <div class="tb-container tb-proj-hero__inner">
            <div class="tb-proj-hero__copy">
                <?php if ($eyebrow !== '') : ?><p class="tb-eyebrow tb-proj-hero__eyebrow"><?php echo $esc($eyebrow); ?></p><?php endif; ?>
                <h1 class="tb-proj-hero__title" itemprop="headline"><?php echo $esc($item->title); ?></h1>
                <?php if ($lede !== '') : ?><div class="tb-proj-hero__lede" itemprop="description"><?php echo $lede; ?></div><?php endif; ?>
                <?php if ($heroCta) : ?><p class="tb-proj-hero__cta"><a class="tb-btn tb-btn--signal" href="<?php echo $esc($ctaUrl); ?>"><?php echo Text::_('TPL_TRACY_BUSINESS_PROJECT_CTA'); ?></a></p><?php endif; ?>
            </div>
            <?php if ($hero !== '') : ?>
                <figure class="tb-proj-hero__visual"><img src="<?php echo $esc($hero); ?>" alt="<?php echo $esc($heroAlt); ?>" width="1200" height="800" loading="eager" decoding="async" itemprop="image"></figure>
            <?php endif; ?>
        </div>
        <?php if ($facts) : ?>
            <div class="tb-proj-facts">
                <dl class="tb-container tb-proj-facts__grid">
                    <?php foreach ($facts as $k => $v) : ?>
                        <div class="tb-proj-facts__cell"><dt><?php echo $esc(ng_field_label($F, $k)); ?></dt><dd><?php echo $esc($v); ?></dd></div>
                    <?php endforeach; ?>
                </dl>
            </div>
        <?php endif; ?>
    </header>

    <?php if ($hasLeft || $hasRight) : ?>
        <section class="tb-proj-scope<?php echo $hasLeft && $hasRight ? '' : ' tb-proj-scope--single'; ?>">
            <div class="tb-container tb-proj-scope__inner">
                <?php if ($hasLeft) : ?>
                    <div class="tb-proj-scope__main">
                        <?php if ($scope) : ?>
                            <h2 class="tb-proj-scope__title"><?php echo Text::_('TPL_TRACY_BUSINESS_PROJECT_SCOPE'); ?></h2>
                            <ul class="tb-proj-scope__list">
                                <?php foreach ($scope as $line) : ?>
                                    <li class="tb-proj-scope__row"><span class="tb-proj-scope__arrow" aria-hidden="true">→</span><span><?php echo $esc($line); ?></span></li>
                                <?php endforeach; ?>
                            </ul>
                        <?php endif; ?>
                        <?php if ($body !== '') : ?><div class="tb-proj-body" itemprop="articleBody"><?php echo $body; ?></div><?php endif; ?>
                    </div>
                <?php endif; ?>
                <?php if ($hasRight) : ?>
                    <aside class="tb-proj-scope__side">
                        <?php if ($quote !== '') : ?>
                            <blockquote class="tb-proj-quote">
                                <p class="tb-proj-quote__text"><?php echo $esc($quote); ?></p>
                                <?php if ($quoteBy !== '') : ?><footer class="tb-proj-quote__by"><?php echo $esc($quoteBy); ?></footer><?php endif; ?>
                            </blockquote>
                        <?php endif; ?>
                        <?php if ($ctaUrl !== '' && !$heroCta) : ?><a class="tb-btn tb-btn--signal tb-proj-scope__cta" href="<?php echo $esc($ctaUrl); ?>"><?php echo Text::_('TPL_TRACY_BUSINESS_PROJECT_CTA'); ?></a><?php endif; ?>
                    </aside>
                <?php endif; ?>
            </div>
        </section>
    <?php endif; ?>

    <?php if ($gallery) : ?>
        <section class="tb-proj-gallery tb-proj-bleed" aria-labelledby="tb-proj-gallery-title">
            <div class="tb-container">
                <h2 class="tb-section__title tb-proj-gallery__title" id="tb-proj-gallery-title"><?php echo Text::_('TPL_TRACY_BUSINESS_PROJECT_GALLERY'); ?></h2>
                <div class="tb-proj-gallery__grid">
                    <?php foreach ($gallery as $g) : ?>
                        <figure class="tb-proj-gallery__item">
                            <div class="tb-proj-gallery__media"><img src="<?php echo $esc($g['src']); ?>" alt="<?php echo $esc($g['alt']); ?>" width="800" height="500" decoding="async"></div>
                            <?php if ($g['caption'] !== '') : ?><figcaption class="tb-proj-gallery__caption"><?php echo $esc($g['caption']); ?></figcaption><?php endif; ?>
                        </figure>
                    <?php endforeach; ?>
                </div>
            </div>
        </section>
    <?php endif; ?>

    <?php if ($others) : ?>
        <section class="tb-proj-other" aria-labelledby="tb-proj-other-title">
            <div class="tb-container">
                <h2 class="tb-section__title tb-proj-other__title" id="tb-proj-other-title"><?php echo Text::_('TPL_TRACY_BUSINESS_PROJECT_OTHER'); ?></h2>
                <div class="tb-proj-other__grid">
                    <?php foreach ($others as $o) : $url = ng_article_url($o); $img = ng_article_image($o, 'image_intro'); $of = ng_project_fields($o);
                        $lead = ng_pf($of, 'tb-area') !== '' ? ng_pf($of, 'tb-area') : ng_pf($of, 'tb-type'); ?>
                        <a class="tb-proj-other__card" href="<?php echo $esc($url); ?>">
                            <?php if ($img !== '') : ?><span class="tb-proj-other__media"><img src="<?php echo $esc($img); ?>" alt="" width="800" height="450" decoding="async"></span><?php endif; ?>
                            <span class="tb-proj-other__name"><?php echo $esc($o->title); ?></span>
                            <span class="tb-proj-other__meta"><?php echo $esc(($lead !== '' ? $lead . ' · ' : '') . ng_article_year($o)); ?></span>
                        </a>
                    <?php endforeach; ?>
                </div>
            </div>
        </section>
    <?php endif; ?>
</article>
