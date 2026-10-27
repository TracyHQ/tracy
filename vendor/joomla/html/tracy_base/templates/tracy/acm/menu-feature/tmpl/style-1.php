<?php
defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);
use Joomla\CMS\Router\Route;
use Joomla\CMS\Helper\MediaHelper;
$esc = static fn($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$title = trim((string) $helper->get('title'));
$link = trim((string) $helper->get('link'));
$image = MediaHelper::getCleanMediaFieldValue((string) $helper->get('image'));
if ($title === '' || $link === '') return;
?>
<a class="tracy-menu-feature" href="<?php echo $esc(Route::_($link)); ?>">
 <?php if ($image !== ''): ?><img class="tracy-menu-feature__image" src="<?php echo $esc($image); ?>" alt="<?php echo $esc($helper->get('image-alt')); ?>" width="640" height="400" loading="eager" decoding="async"><?php endif; ?>
 <span class="tracy-menu-feature__body">
  <?php if ($helper->get('eyebrow')): ?><span class="tracy-menu-feature__eyebrow"><?php echo $esc($helper->get('eyebrow')); ?></span><?php endif; ?>
  <span class="tracy-menu-feature__title"><?php echo $esc($title); ?></span>
  <?php if ($helper->get('description')): ?><span class="tracy-menu-feature__description"><?php echo $esc($helper->get('description')); ?></span><?php endif; ?>
  <span class="tracy-menu-feature__action"><?php echo $esc($helper->get('action')); ?> <span aria-hidden="true">↗</span></span>
 </span>
</a>
