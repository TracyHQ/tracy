<?php

/**
 * Tracy — brand mark, and the owner's logo as a light/dark pair.
 *
 * Two kinds of logo reach this element, and they need opposite treatment:
 *
 * - The template's OWN mark, an SVG on disk. Loaded through <img> an SVG is an independent document,
 *   so `currentColor` resolves to the UA default and the mark came out black-on-black the moment the
 *   page went dark. Inlined, it inherits `color` and follows the theme with no second file.
 * - The OWNER's logo (a PNG uploaded in the admin, or by Tracy's "Customize your site"). A bitmap
 *   cannot follow the theme, so it comes as a pair, the JA Nova pattern: `site_logo` inside
 *   `.d-light`, the "Logo Dark Image" `site_logo_dark` inside `.d-dark` (`site_logo_small` /
 *   `site_logo_dark_small` on phones); scss/_chrome.scss shows one of the two by the theme hook.
 *   With a logo but no dark counterpart, dark mode shows the site name as text instead of a logo
 *   drawn for a light background. No logo at all shows the site name in both modes.
 *
 * As soon as a dark logo is set, the pair is used even for an SVG: the owner said which picture
 * belongs on the dark ground. Never recolour or swap the logo from CSS (`filter`, `content: url()`):
 * it destroys the owner's logo, and Tracy cannot undo it.
 *
 * Everything else the base element does — the site-name fallback, the slogan, the home link, the
 * `nolink` param — is preserved, because those are the parts an owner configures.
 *
 * @package TRACY_APPLE
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
$small    = $settings ? $settings->get('site_logo_small') : '';
$smallDark = $settings ? $settings->get('site_logo_dark_small') : '';
$hasLink  = empty($displayData->params) || empty($displayData->params['nolink']);

// A media field stores `path#joomlaImage://…`; the URL is the part before the hash.
$clean = static function ($url) {
    return $url ? \T4\Helper\Metadata::cleanImageURL($url)->url : '';
};
$logo      = $clean($logo);
$logoDark  = $logo ? $clean($logoDark) : '';
$small     = $logo ? $clean($small) : '';
$smallDark = $small && $logoDark ? $clean($smallDark) : '';

$src = static function ($url) {
    return preg_match('#^(https?:)?//#i', $url) ? $url : Uri::root(true) . '/' . ltrim($url, '/');
};
$alt  = htmlspecialchars(strip_tags((string) $siteName), ENT_QUOTES, 'UTF-8');
$name = '<span class="logo-title site-name">' . $alt . '</span>';

$path   = $logo && !$logoDark ? JPATH_ROOT . '/' . ltrim($logo, '/') : '';
$isSvg  = $path && strtolower(pathinfo($path, PATHINFO_EXTENSION)) === 'svg' && is_file($path);
$markup = '';

if ($isSvg) {
    // Strip the XML prolog; an inline <svg> must not carry one.
    $markup = preg_replace('/<\?xml.*?\?>\s*/s', '', (string) file_get_contents($path));
}

// One picture (and its phone variant) for one ground.
$picture = static function ($main, $phone) use ($src, $alt) {
    $out = '';
    if ($phone) {
        $out .= '<img class="logo-img-sm d-block d-sm-none" src="' . $src($phone) . '" alt="' . $alt . '">';
    }
    $out .= '<img class="logo-img' . ($phone ? ' d-none d-sm-block' : '') . '" src="' . $src($main) . '" alt="' . $alt . '">';
    return $out;
};
?>
<div class="navbar-brand <?php echo $logo ? 'logo-image' : 'logo-text'; ?>">
    <?php if ($hasLink) : ?><a href="<?php echo Uri::root(); ?>" aria-label="<?php echo $alt; ?>"><?php endif; ?>

    <?php if ($markup) : ?>
        <span class="tracy-logo"><?php echo $markup; ?></span>
    <?php elseif ($logo) : ?>
        <span class="d-light"><?php echo $picture($logo, $small); ?></span>
        <span class="d-dark"><?php echo $logoDark ? $picture($logoDark, $smallDark ?: ($small ? $logoDark : '')) : $name; ?></span>
    <?php else : ?>
        <?php echo $name; ?>
    <?php endif; ?>

    <?php if ($slogan) : ?>
        <span class="site-slogan"><?php echo htmlspecialchars($slogan, ENT_QUOTES, 'UTF-8'); ?></span>
    <?php endif; ?>

    <?php if ($hasLink) : ?></a><?php endif; ?>
</div>
