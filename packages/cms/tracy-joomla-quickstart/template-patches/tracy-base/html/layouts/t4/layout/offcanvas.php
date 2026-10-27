<?php
/**
 * Tracy — off-canvas layout, overridden for ONE reason: the brand mark.
 *
 * T4's base draws the drawer's logo with `<img src="…svg">`, and it does NOT go through the `logo`
 * element — so the inline-SVG override that fixes the header never reaches the drawer. An SVG loaded
 * through <img> is an independent document: `currentColor` inside it resolves to the UA default,
 * black. Measured in dark: the site name rendered black on the drawer's #0e0e0e ground while the
 * identical mark in the header measured #f8f8f8.
 *
 * A CSS filter can make it legible and costs the accent its colour. Inlining costs nothing and is
 * the same repair the header already uses, so both places behave alike.
 *
 * Everything else is the base file unchanged.
 */

use Joomla\CMS\Factory;
use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Uri\Uri;

$doc = $displayData->doc;
$paramsTpl = $doc->params;
$conf = Factory::getConfig();
//if(empty($paramsTpl->get('t4-navigation'))) $paramsTpl->set('t4-navigation','default');
//$params = json_decode(\T4\Helper\Path::getFileContent('etc/navigation/'.$paramsTpl->get('t4-navigation').'.json'));
//if(empty($params)) return;
//if (!$params->navigation_oc_enabled) return;
$navigation_settings = $paramsTpl->get('navigation-settings');
$site_settings = $paramsTpl->get('site-settings');
if (!$navigation_settings->get('oc_enabled')) return;
$offcanvas_title = Text::_('T4_OFF_CANVAS_TITLE');
$site_name = $site_settings->get('site_name', $conf->get('sitename'));
$site_slogan = $site_settings->get('site_slogan', '');
$logo = $site_settings->get('site_logo');
// The bitmap pair: site_logo in .d-light, site_logo_dark (or the name) in .d-dark, like the header.
$logo_dark = $site_settings->get('site_logo_dark');
$logo_small = $site_settings->get('site_logo_small');
$logo_cls = $logo ? 'logo-image' : 'logo-text';
$logo_sm_cls = '';
if ($logo_small) {
    $logo_cls .= ' logo-control';
    $logo_sm_cls = ' d-none d-sm-block';
  if(version_compare(JVERSION, '4.0', 'ge')){
    $logo_small = HTMLHelper::cleanImageURL($logo_small)->url;
  }
}
if($logo && version_compare(JVERSION, '4.0', 'ge')){
  $logo = HTMLHelper::cleanImageURL($logo)->url;
}
$logo_dark = $logo && $logo_dark ? HTMLHelper::cleanImageURL($logo_dark)->url : '';
$oc_effect = $navigation_settings->get('oc_effect', "left");

$oc_pos_name = $navigation_settings->get('oc_pos_name', 'offcanvas');
$oc_pos_style = $navigation_settings->get('oc_pos_style', 'xhtml');
$oc_rightside = filter_var($navigation_settings->get('oc_rightside'), FILTER_VALIDATE_BOOLEAN);
$oc_menu_effect = $navigation_settings->get('oc_menu_effect', 'def');
// add css & js
$doc->addStylesheet(T4\Helper\Path::findInTheme('vendors/js-offcanvas/_css/js-offcanvas.css', true));
$doc->addScript(T4\Helper\Path::findInTheme('vendors/js-offcanvas/_js/js-offcanvas.pkgd.js', true));
$doc->addScript(T4\Helper\Path::findInTheme('vendors/bodyscrolllock/bodyScrollLock.min.js', true));
$doc->addScript(T4\Helper\Path::findInTheme('js/offcanvas.js', true));
$oc_rightside = $navigation_settings->get('oc_rightside', '');
if($oc_rightside){
      $oc_effect = str_replace("left", 'right', $oc_effect);
  }
switch ($oc_effect) {
	case 'left':
	case 'right':
		$options = '{"modifiers":"'.$oc_effect.',overlay"}';
		break;
	
	default:
		$options = '{"modifiers":"'.str_replace("-",",",$oc_effect).'"}';
		break;
}

$hasLink = !empty($displayData->params) && !empty($displayData->params['nolink']) ? false : true;
?>
<div class="t4-offcanvas" data-offcanvas-options='<?php echo $options; ?>' id="off-canvas-<?php echo $oc_effect;?>" role="complementary" style="display:none;">
	<div class="t4-off-canvas-header">
	 	<?php if ($hasLink): ?>
	  <a href="<?php echo Uri::base(); ?>" title="<?php echo strip_tags($site_name); ?>">
	  <?php endif; ?>
	    <?php if ($logo_small) : ?>
	      <?php
          $smallPath = realpath(JPATH_ROOT . '/' . ltrim(parse_url($logo_small, PHP_URL_PATH) ?: $logo_small, '/'));
          $smallSvg = $smallPath && str_starts_with($smallPath, JPATH_ROOT . '/')
              && strtolower(pathinfo($smallPath, PATHINFO_EXTENSION)) === 'svg'
              ? preg_replace('/<\?xml.*?\?>\s*/s', '', file_get_contents($smallPath)) : '';
          ?>
          <?php if ($smallSvg) : ?>
            <span class="logo-img-sm d-block d-sm-none" role="img" aria-label="<?php echo htmlspecialchars(strip_tags($site_name), ENT_QUOTES); ?>"><?php echo $smallSvg; ?></span>
          <?php else : ?>
            <img class="logo-img-sm d-block d-sm-none" src="<?php echo $logo_small; ?>" alt="<?php echo strip_tags($site_name); ?>">
          <?php endif; ?>
	    <?php endif; ?>
	  	
	    <?php if ($logo) : ?>
	      <?php
	      /* Inline when it is an SVG on disk, so `currentColor` inherits; otherwise the base <img>. */
	      $t4OcPath = $logo ? JPATH_ROOT . '/' . ltrim(parse_url($logo, PHP_URL_PATH) ?: $logo, '/') : '';
	      $t4OcSvg  = $t4OcPath && strtolower(pathinfo($t4OcPath, PATHINFO_EXTENSION)) === 'svg' && is_file($t4OcPath)
	          ? preg_replace('/<\?xml.*?\?>\s*/s', '', (string) file_get_contents($t4OcPath))
	          : '';
	      ?>
	      <?php if ($t4OcSvg) : ?>
	        <span class="logo-img<?php echo $logo_sm_cls; ?>" role="img" aria-label="<?php echo strip_tags($site_name); ?>"><?php echo $t4OcSvg; ?></span>
	      <?php else : ?>
	        <span class="d-light"><img class="logo-img<?php echo $logo_sm_cls; ?>" src="<?php echo $logo; ?>" alt="<?php echo strip_tags($site_name); ?>"></span>
	        <span class="d-dark"><?php if ($logo_dark) : ?><img class="logo-img<?php echo $logo_sm_cls; ?>" src="<?php echo $logo_dark; ?>" alt="<?php echo strip_tags($site_name); ?>"><?php else : ?><span class="site-name"><?php echo $site_name; ?></span><?php endif; ?></span>
	      <?php endif; ?>
	    <?php else : ?>
	     	<?php echo $offcanvas_title; ?>
	    <?php endif; ?>

	  <?php if ($hasLink): ?>
	  </a>
	  <?php endif; ?>
		<button type="button" class="close js-offcanvas-close" data-dismiss="modal" aria-label="<?php echo htmlspecialchars(Text::_('TPL_TRACY_CLOSE_MENU'), ENT_QUOTES, 'UTF-8'); ?>">×</button>
	</div>

	<div class="t4-off-canvas-body menu-item-<?php echo $oc_menu_effect;?>" data-effect="<?php echo $oc_menu_effect;?>">
		<jdoc:include type="modules" name="<?php echo $oc_pos_name ?>" style="<?php echo $oc_pos_style ?>" />
	</div>

	<?php if($doc->countModules('offcanvas-footer')): ?>
		<div class="t4-off-canvas-footer">
			<jdoc:include type="modules" name="offcanvas-footer" style="<?php echo $oc_pos_style ?>" />
		</div>
	<?php endif; ?>
</div>