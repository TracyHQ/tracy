<?php

/**
 * Tracy Business — brand lockup.
 *
 * The design's mark is a typographic lockup, not a bitmap: a filled square carrying a short
 * monogram, the site name beside it, and an uppercase descriptor underneath. All three parts are
 * owner-editable through Template -> Settings -> Logo (site name, monogram, slogan), and an
 * uploaded logo image still wins when one is set, so the template does not force the lockup on a
 * customer who has a real logo file.
 *
 * The base T4 element renders only an <img>; an inline SVG is kept inline so `currentColor`
 * resolves against the page, which is what makes the mark survive the dark theme. A bitmap logo
 * cannot, so it comes as a pair: site_logo in .d-light, the dark-mode "Logo Dark Image"
 * site_logo_dark in .d-dark (JA Nova pattern); with no dark logo the lockup shows in dark mode (Q7).
 *
 * @package northgate
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\Uri\Uri;

$doc      = $displayData->doc;
$settings = $doc->params->get('site-settings');
$siteName = $settings ? $settings->get('site_name', Factory::getApplication()->get('sitename'))
                      : Factory::getApplication()->get('sitename');
$siteName = $siteName !== '' ? $siteName : Factory::getApplication()->get('sitename');
// The slogan may be a language key (TPL_TRACY_BUSINESS_TAGLINE) so it follows the site language; Text::_() returns plain text untouched.
$slogan   = $settings ? \Joomla\CMS\Language\Text::_((string) $settings->get('site_slogan', '')) : '';
$monogram = $settings ? trim((string) $settings->get('site_monogram', '')) : '';
$logo     = $settings ? $settings->get('site_logo') : '';
$logoDark = $settings ? $settings->get('site_logo_dark') : '';
$hasLink  = empty($displayData->params) || empty($displayData->params['nolink']);

if ($monogram === '') {
    // Initials of the first two words, so an owner who never opens the field still gets a mark.
    $words    = preg_split('/\s+/u', trim((string) $siteName), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $monogram = '';

    foreach (array_slice($words, 0, 2) as $word) {
        $monogram .= mb_strtoupper(mb_substr($word, 0, 1));
    }

    $monogram = $monogram !== '' ? $monogram : mb_strtoupper(mb_substr((string) $siteName, 0, 2));
}

// The site's identity lives in the "[Tracy] Site identity" module, and plg_system_tracyidentity
// replaces these tokens as the page leaves Joomla. Without the plugin the lines above stand, so an
// older archive or a site that switched the plugin off still shows the T4 settings.
if (\Joomla\CMS\Plugin\PluginHelper::isEnabled('system', 'tracyidentity')) {
    $siteName = '{site.name}';
    $slogan   = '{site.slogan}';
    $monogram = '{site.monogram}';
}

if ($logo && version_compare(JVERSION, '4', 'ge')) {
    $logo = \T4\Helper\Metadata::cleanImageURL($logo)->url;
}
$logoDark = $logo && $logoDark ? \T4\Helper\Metadata::cleanImageURL($logoDark)->url : '';

$path   = $logo ? JPATH_ROOT . '/' . ltrim($logo, '/') : '';
$isSvg  = $path && strtolower(pathinfo($path, PATHINFO_EXTENSION)) === 'svg' && is_file($path);
$markup = $isSvg ? preg_replace('/<\?xml.*?\?>\s*/s', '', (string) file_get_contents($path)) : '';
$esc    = static fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
?>
<div class="navbar-brand tb-brand <?php echo $logo ? 'logo-image' : 'logo-text'; ?>">
    <?php if ($hasLink) : ?><a class="tb-brand__link" href="<?php echo Uri::root(); ?>" aria-label="<?php echo $esc($siteName); ?>"><?php endif; ?>

    <?php if ($markup) : ?>
        <span class="tb-brand__logo"><?php echo $markup; ?></span>
    <?php elseif ($logo) : ?>
        <span class="d-light"><img class="tb-brand__logo logo-img" src="<?php echo Uri::root(true) . '/' . ltrim($logo, '/'); ?>"
             alt="<?php echo $esc($siteName); ?>"></span>
        <span class="d-dark">
            <?php if ($logoDark) : ?>
                <img class="tb-brand__logo logo-img" src="<?php echo Uri::root(true) . '/' . ltrim($logoDark, '/'); ?>"
                     alt="<?php echo $esc($siteName); ?>">
            <?php else : ?>
                <span class="tb-brand__mark" aria-hidden="true"><?php echo $esc($monogram); ?></span>
                <span class="tb-brand__words"><span class="tb-brand__name"><?php echo $esc($siteName); ?></span></span>
            <?php endif; ?>
        </span>
    <?php else : ?>
        <span class="tb-brand__mark" aria-hidden="true"><?php echo $esc($monogram); ?></span>
        <span class="tb-brand__words">
            <span class="tb-brand__name"><?php echo $esc($siteName); ?></span>
            <?php if ($slogan) : ?><span class="tb-brand__sub"><?php echo $esc($slogan); ?></span><?php endif; ?>
        </span>
    <?php endif; ?>

    <?php if ($logo && $slogan) : ?>
        <span class="tb-brand__sub site-slogan"><?php echo $esc($slogan); ?></span>
    <?php endif; ?>

    <?php if ($hasLink) : ?></a><?php endif; ?>
</div>
