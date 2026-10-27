<?php
/**
 * Tracy Business — ACM `tb-sys-social`: bordered box, eyebrow + intro, 2×3 grid of platform cards.
 * A card is an <a> only when a real link is stored; otherwise it is a plain block — no dead links.
 */
defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);
$esc = static fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$title = trim((string) $helper->get('title')); $intro = trim((string) $helper->get('intro'));
// A URL may be an identity token (`{social.tiktok}`) that plg_system_tracyidentity replaces after
// this layout ran; a card whose token has no value behind it is left out rather than shown empty.
$identityClass = '\\Tracy\\Plugin\\System\\TracyIdentity\\Identity';
$identity = class_exists($identityClass) ? $identityClass::current() : null;
$rows = [];
for ($i = 0, $n = (int) $helper->getRows('name'); $i < $n; $i++) {
    $name = trim((string) $helper->get('name', $i)); if ($name === '') continue;
    $u = trim((string) $helper->get('url', $i));
    if ($identity !== null && $identityClass::isBlankToken($u, $identity)) continue;
    $isToken = (bool) preg_match('/^\{[a-zA-Z.]+\}$/', $u);
    if ($u !== '' && !$isToken && !preg_match('~^[a-z][a-z0-9+.-]*:~i', $u)) $u = 'https://' . $u;
    $rows[] = [$name, trim((string) $helper->get('handle', $i)), trim((string) $helper->get('desc', $i)), trim((string) $helper->get('url-text', $i)), $u];
}
if (!$rows) return;
?>
<div class="ja-acm acm-tb-sys-social tb-sysbox tb-social-cards">
  <?php if ($title !== '') : ?><p class="tb-sysbox__eyebrow"><?php echo $esc($title); ?></p><?php endif; ?>
  <?php if ($intro !== '') : ?><p class="tb-social-cards__intro"><?php echo $esc($intro); ?></p><?php endif; ?>
  <div class="tb-social-cards__grid">
    <?php foreach ($rows as [$name, $handle, $desc, $urlText, $u]) : ?>
      <?php $tag = $u !== '' ? 'a' : 'div'; ?>
      <<?php echo $tag; ?> class="tb-social-card"<?php if ($u !== '') : ?> href="<?php echo $esc($u); ?>" rel="noopener"<?php endif; ?>>
        <span class="tb-social-card__head"><span class="tb-social-card__name"><?php echo $esc($name); ?></span><?php if ($u !== '') : ?><span class="tb-social-card__arrow" aria-hidden="true">↗</span><?php endif; ?></span>
        <?php if ($handle !== '') : ?><span class="tb-social-card__handle"><?php echo $esc($handle); ?></span><?php endif; ?>
        <?php if ($desc !== '') : ?><span class="tb-social-card__desc"><?php echo $esc($desc); ?></span><?php endif; ?>
        <?php if ($urlText !== '') : ?><span class="tb-social-card__url"><?php echo $esc($urlText); ?></span><?php endif; ?>
      </<?php echo $tag; ?>>
    <?php endforeach; ?>
  </div>
</div>
