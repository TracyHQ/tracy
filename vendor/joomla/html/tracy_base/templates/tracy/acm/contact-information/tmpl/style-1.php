<?php
/** Shared editable contact information; an empty URL is never a pretend social account. */
defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);
$esc = fn($value) => htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
$email = trim((string) $helper->get('email'));
$validEmail = filter_var($email, FILTER_VALIDATE_EMAIL) && !preg_match('/[\r\n]/', $email);
$demoEmail = preg_match('/@(?:[^@]+\.)?(?:example|invalid|test)$/i', $email);
?>
<section class="ja-acm acm-contact-information style-1" aria-label="<?php echo $esc($helper->get('heading')); ?>">
  <div class="tracy-contact-info__details">
    <h2 class="tracy-contact-info__heading"><?php echo $esc($helper->get('heading')); ?></h2>
    <?php if ($email !== '') : ?>
    <p class="tracy-contact-info__label"><?php echo $esc($helper->get('email-label')); ?></p>
    <?php if ($validEmail && !$demoEmail) : ?>
      <a class="tracy-contact-info__email" href="mailto:<?php echo $esc($email); ?>"><?php echo $esc($email); ?></a>
    <?php else : ?>
      <span class="tracy-contact-info__email" aria-disabled="true"><?php echo $esc($email); ?></span>
    <?php endif; endif; ?>
    <?php if ($helper->get('notice')) : ?><p class="tracy-contact-info__notice"><?php echo $esc($helper->get('notice')); ?></p><?php endif; ?>
  </div>
</section>
