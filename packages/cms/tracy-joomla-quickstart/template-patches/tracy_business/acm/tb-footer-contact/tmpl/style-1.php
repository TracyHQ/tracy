<?php
/**
 * Tracy Business — ACM `tb-footer-contact`: the fourth footer column — phone, email, hours, a routed
 * CTA link and the social chips. A chip with no URL renders as plain text rather than a dead link.
 */
defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);
$esc   = static fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$phone = trim((string) $helper->get('phone')); $email = trim((string) $helper->get('email')); $hours = trim((string) $helper->get('hours'));
$ctaText = trim((string) $helper->get('cta-text')); $ctaLink = trim((string) $helper->get('cta-link'));
if ($ctaLink !== '' && !preg_match('~^(?:[a-z][a-z0-9+.-]*:|/|#)~i', $ctaLink)) $ctaLink = \Joomla\CMS\Router\Route::_($ctaLink);
// Fields may be identity tokens (`{contact.phone}`) that plg_system_tracyidentity replaces after this
// layout ran, so "empty" means an empty field OR a token with nothing behind it.
$identityClass = '\\Tracy\\Plugin\\System\\TracyIdentity\\Identity';
$identity = class_exists($identityClass) ? $identityClass::current() : null;
$blank = static fn (string $v): bool => $v === '' || ($identity !== null && $identityClass::isBlankToken($v, $identity));
$isToken = static fn (string $v): bool => (bool) preg_match('/^\{[a-zA-Z.]+\}$/', $v);
$social = [];
for ($i = 0, $n = (int) $helper->getRows('social-label'); $i < $n; $i++) {
    $l = trim((string) $helper->get('social-label', $i)); $u = trim((string) $helper->get('social-url', $i));
    if ($l === '' || ($isToken($u) && $blank($u))) continue;
    $social[] = [$l, $u];
}
?>
<ul class="tb-footlist">
  <?php if (!$blank($phone)) : ?><li><a href="tel:<?php echo $isToken($phone) ? '{contact.tel}' : $esc(preg_replace('/[^0-9+]/', '', $phone)); ?>"><?php echo $esc($phone); ?></a></li><?php endif; ?>
  <?php if (!$blank($email)) : ?><li><a href="mailto:<?php echo $esc($email); ?>"><?php echo $esc($email); ?></a></li><?php endif; ?>
  <?php if (!$blank($hours)) : ?><li><span><?php echo $esc($hours); ?></span></li><?php endif; ?>
  <?php if ($ctaText !== '' && $ctaLink !== '') : ?><li><a class="tb-footlink" href="<?php echo $esc($ctaLink); ?>"><?php echo $esc($ctaText); ?></a></li><?php endif; ?>
</ul>
<?php if ($social) : ?>
  <ul class="tb-social">
    <?php foreach ($social as [$l, $u]) : ?>
      <li><?php if ($u !== '') : ?><a href="<?php echo $esc($u); ?>" rel="noopener"><?php echo $esc($l); ?></a><?php else : ?><span><?php echo $esc($l); ?></span><?php endif; ?></li>
    <?php endforeach; ?>
  </ul>
<?php endif; ?>
