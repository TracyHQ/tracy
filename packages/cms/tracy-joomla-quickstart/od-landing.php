<?php
/** A native Joomla Custom module, with the original OpenDesign styles isolated from the site shell. */
defined('_JEXEC') or die;
use Joomla\CMS\Factory;
use Joomla\CMS\Uri\Uri;
$wa = Factory::getApplication()->getDocument()->getWebAssetManager();
$wa->registerAndUseStyle('tracy.native-landing', Uri::root() . 'media/tracy-landing/native-landing.css?v=' . filemtime(JPATH_ROOT . '/media/tracy-landing/native-landing.css'));
if (str_starts_with($module->position, 'od-onepage-')) {
    $wa->registerAndUseStyle('tracy.company-onepage', Uri::root() . 'media/tracy-landing/company-onepage.css', [], [], ['tracy.native-landing']);

}
$wa->registerAndUseScript('tracy.company-onepage', Uri::root() . 'media/tracy-landing/company-onepage.js?v=' . filemtime(JPATH_ROOT . '/media/tracy-landing/company-onepage.js'), [], ['defer' => true]);
?>
<div class="tracy-native-landing" id="mod-custom-<?= (int)$module->id ?>">
  <?= $module->content ?>
</div>
