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
// A seeded business overrides the demo wordmark through its reversible template-style params.
$businessName = (string) $doc->params->get('tracy_business_name', '');
if ($businessName !== '') { $siteName = $businessName; $logo = ''; $slogan = ''; }
// The site's identity lives in the "[Tracy] Site identity" module, and plg_system_tracyidentity
// replaces these tokens as the page leaves Joomla. The demo's wordmark SVG spells the demo's name, so
// the lockup falls back to the text title. Without the plugin the lines above stand, so an older
// archive or a site that switched the plugin off still shows the T4 settings.
if (\Joomla\CMS\Plugin\PluginHelper::isEnabled('system', 'tracyidentity')) {
    $siteName = '{site.name}';
    $slogan   = '{site.slogan}';
    $logo     = '';
}
$hasLink  = empty($displayData->params) || empty($displayData->params['nolink']);

if ($logo && version_compare(JVERSION, '4', 'ge')) {
    $logo = \T4\Helper\Metadata::cleanImageURL($logo)->url;
}

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
        <img class="logo-img" src="<?php echo Uri::root(true) . '/' . ltrim($logo, '/'); ?>"
             alt="<?php echo htmlspecialchars($siteName, ENT_QUOTES, 'UTF-8'); ?>">
    <?php else : ?>
        <span class="logo-title"><?php echo htmlspecialchars($siteName, ENT_QUOTES, 'UTF-8'); ?></span>
    <?php endif; ?>

    <?php if ($slogan) : ?>
        <span class="site-slogan"><?php echo htmlspecialchars($slogan, ENT_QUOTES, 'UTF-8'); ?></span>
    <?php endif; ?>

    <?php if ($hasLink) : ?></a><?php endif; ?>
</div>
