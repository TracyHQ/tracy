<?php

/**
 * Tracy — brand mark.
 *
 * The T4 base element renders the logo as an <img>, which is right for a bitmap and wrong for this
 * mark: an SVG loaded through <img> is an independent document, so `currentColor` resolves to the
 * UA default rather than the page's foreground. The mark came out black-on-black the moment the
 * page went dark. Inlining the file keeps it a wordmark that inherits `color`, so it follows the
 * theme with no second asset and no filter trick.
 *
 * Everything else the base element does — the site-name fallback, the slogan, the home link, the
 * `nolink` param — is preserved, because those are the parts an owner configures.
 *
 * A bitmap logo (a customer's PNG) cannot follow the theme, so it comes as a pair: site_logo in
 * .d-light, the dark-mode "Logo Dark Image" site_logo_dark in .d-dark (css/site-repairs.css swaps
 * them, JA Nova pattern). With no dark logo, dark mode shows the site name as text.
 *
 * @package tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\Uri\Uri;

$doc      = $displayData->doc;
$settings = $doc->params->get('site-settings');
$siteName = $settings ? $settings->get('site_name', Factory::getApplication()->get('sitename'))
                      : Factory::getApplication()->get('sitename');
$slogan   = $settings ? $settings->get('site_slogan', '') : '';
$logo     = $settings ? $settings->get('site_logo') : '';
$logoDark = $settings ? $settings->get('site_logo_dark') : '';
$hasLink  = empty($displayData->params) || empty($displayData->params['nolink']);

if ($logo && version_compare(JVERSION, '4', 'ge')) {
    $logo = \T4\Helper\Metadata::cleanImageURL($logo)->url;
}
$logoDark = $logo && $logoDark ? \T4\Helper\Metadata::cleanImageURL($logoDark)->url : '';

$path   = $logo ? JPATH_ROOT . '/' . ltrim($logo, '/') : '';
$isSvg  = $path && strtolower(pathinfo($path, PATHINFO_EXTENSION)) === 'svg' && is_file($path);
$markup = '';

if ($isSvg) {
    // Strip the XML prolog; an inline <svg> must not carry one.
    $markup = preg_replace('/<\?xml.*?\?>\s*/s', '', (string) file_get_contents($path));
}
?>
<div class="navbar-brand <?php echo $logo ? 'logo-image' : 'logo-text'; ?>">
    <?php if ($hasLink) : ?><a href="<?php echo Uri::root(); ?>" aria-label="<?php echo htmlspecialchars($siteName, ENT_QUOTES, 'UTF-8'); ?>"><?php endif; ?>

    <?php if ($markup) : ?>
        <span class="tracy-logo"><?php echo $markup; ?></span>
    <?php elseif ($logo) : ?>
        <span class="d-light"><img class="logo-img" src="<?php echo Uri::root(true) . '/' . ltrim($logo, '/'); ?>"
             alt="<?php echo htmlspecialchars($siteName, ENT_QUOTES, 'UTF-8'); ?>"></span>
        <span class="d-dark">
            <?php if ($logoDark) : ?>
                <img class="logo-img" src="<?php echo Uri::root(true) . '/' . ltrim($logoDark, '/'); ?>"
                     alt="<?php echo htmlspecialchars($siteName, ENT_QUOTES, 'UTF-8'); ?>">
            <?php else : ?>
                <span class="logo-title"><?php echo htmlspecialchars($siteName, ENT_QUOTES, 'UTF-8'); ?></span>
            <?php endif; ?>
        </span>
    <?php else : ?>
        <span class="logo-title"><?php echo htmlspecialchars($siteName, ENT_QUOTES, 'UTF-8'); ?></span>
    <?php endif; ?>

    <?php if ($slogan) : ?>
        <span class="site-slogan"><?php echo htmlspecialchars($slogan, ENT_QUOTES, 'UTF-8'); ?></span>
    <?php endif; ?>

    <?php if ($hasLink) : ?></a><?php endif; ?>
</div>
