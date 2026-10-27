<?php
defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);
$esc = fn($value) => htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
$icons = [
  'linkedin'=>'<path d="M6.5 8.5H3.2V19h3.3V8.5ZM4.8 3A1.9 1.9 0 1 0 4.8 6.8 1.9 1.9 0 0 0 4.8 3ZM19.5 13c0-3.2-1.7-4.7-4-4.7a3.5 3.5 0 0 0-3.2 1.8V8.5H9V19h3.3v-5.2c0-1.4.3-2.8 2.1-2.8s1.8 1.7 1.8 2.9V19h3.3v-6Z"/>',
  'instagram'=>'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" class="fill"/>',
  'facebook'=>'<path d="M14 8h3V4.5c-.5-.1-2.2-.2-4-.2-3 0-5 1.8-5 5.2V12H5v4h3v8h4v-8h3.2l.8-4h-4V9.9c0-1.2.3-1.9 2-1.9Z"/>',
  'tiktok'=>'<path d="M15 3c.4 2.3 1.7 3.8 4 4.2v3.2a8 8 0 0 1-4-1.2v6.1a6 6 0 1 1-5.2-6v3.3a2.8 2.8 0 1 0 2 2.7V3h3.2Z"/>',
  'youtube'=>'<path d="M21.5 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.5.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .5 4.8 2.8 2.8 0 0 0 2 2c1.7.5 7.5.5 7.5.5s5.8 0 7.5-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.5-4.8ZM10 15.2V8.8l5.5 3.2-5.5 3.2Z"/>',
];
?>
<div class="ja-acm acm-social-links style-1">
  <h3 class="tracy-footlinks__title"><?php echo $esc($helper->get('heading')); ?></h3>
  <ul class="tracy-social-links">
  <?php for ($i=0;$i<$helper->getRows('platform');$i++): $platform=strtolower(trim((string)$helper->get('platform',$i))); $url=trim((string)$helper->get('social-url',$i)); if (!isset($icons[$platform])) continue; ?>
    <li><a href="<?php echo $esc($url); ?>" rel="noopener noreferrer" aria-label="<?php echo $esc(ucfirst($platform).' demo account'); ?>"><svg class="tracy-social-links__icon tracy-social-links__icon--<?php echo $esc($platform); ?>" viewBox="0 0 24 24" aria-hidden="true"><?php echo $icons[$platform]; ?></svg><span><?php echo $esc($helper->get('handle')); ?></span></a></li>
  <?php endfor; ?>
  </ul>
</div>
