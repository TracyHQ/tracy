<?php

/**
 * Tracy Business — the core Custom module layout (modules/mod_custom/tmpl/default.php, Joomla 6),
 * plus one thing: the footer brand. Each language's "[Tracy Business] Footer - Brand" module draws
 * the typographic lockup (div.tb-footbrand__lockup, tokens of plg_system_tracyidentity). When the
 * site has a logo, the footer, dark in both modes, shows the dark-background one instead: the
 * site profile's site_logo_dark ("Logo Dark Image"). With none, the lockup stays (Q7).
 *
 * @package northgate
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Uri\Uri;

$modId = 'mod-custom' . $module->id;

if ($params->get('backgroundimage')) {
    /** @var Joomla\CMS\WebAsset\WebAssetManager $wa */
    $wa = Factory::getApplication()->getDocument()->getWebAssetManager();
    $wa->addInlineStyle('
#' . $modId . '{background-image: url("' . Uri::root(true) . '/' . HTMLHelper::_('cleanImageURL', $params->get('backgroundimage'))->url . '");}
', ['name' => $modId]);
}

$content = $module->content;

if (str_contains((string) $content, 'tb-footbrand__lockup')) {
    $siteSettings = Factory::getApplication()->getDocument()->params->get('site-settings');
    $footLogo = $siteSettings && $siteSettings->get('site_logo') ? (string) $siteSettings->get('site_logo_dark') : '';

    if ($footLogo !== '') {
        $footLogo = HTMLHelper::_('cleanImageURL', $footLogo)->url;
        $content  = preg_replace(
            '#<div class="tb-footbrand__lockup">.*?</div>#s',
            '<a class="tb-footbrand__logo" href="' . Uri::root() . '"><img src="' . Uri::root(true) . '/'
                . htmlspecialchars(ltrim($footLogo, '/'), ENT_QUOTES, 'UTF-8') . '" alt="{site.name}"></a>',
            (string) $content,
            1
        );
    }
}

?>

<div id="<?php echo $modId; ?>" class="mod-custom custom">
    <?php echo $content; ?>
</div>
