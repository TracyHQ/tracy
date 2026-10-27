<?php
/**
 * Tracy Business — ACM `tb-sys-styleguide`: the installer's reference page, seven sections.
 * §1 draws THIS template's real module positions (templateDetails.xml), not the design's generic
 * names, because the map exists to be typed into the Module Manager. It scrolls sideways on a
 * phone instead of widening the page (the one overflow the source design had). §5 uses Joomla's
 * own <joomla-alert> markup so the site's real system messages pick up the same styling.
 */
defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);
$esc = static fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
// a hex of the template's own palette is drawn through the role it plays, so a site wearing a design
// system shows the system's colour in its place; with no system the role is unset and the hex shows
$swatchFill = static function (string $hx): string {
    $role = ['#14171A' => '--ds-c-ink', '#F5F3EE' => '--ds-c-bg', '#EDEAE2' => '--ds-c-surface', '#DCD7CC' => '--ds-c-border', '#14483A' => '--ds-c-accent', '#DA5A2A' => '--ds-c-accent-hover'][strtoupper($hx)] ?? null;
    return $role ? 'var(' . $role . ', ' . $hx . ')' : $hx;
};
$media = static function (string $value): string {
    $value = explode('#', trim($value))[0];
    if ($value === '') return '';
    return preg_match('~^(?:[a-z][a-z0-9+.-]*:|/)~i', $value) ? $value : \Joomla\CMS\Uri\Uri::root(true) . '/' . $value;
};
$g = static fn (string $k) => trim((string) $helper->get($k));
$rows = static function (string $key, array $fields) use ($helper): array {
    $out = [];
    for ($i = 0, $n = (int) $helper->getRows($key); $i < $n; $i++) { $r = []; foreach ($fields as $f) $r[$f] = trim((string) $helper->get($f, $i)); if (implode('', $r) !== '') $out[] = $r; }
    return $out;
};
$type = $rows('type-label', ['type-label', 'type-sample', 'type-kind']);
$colours = $rows('colour-name', ['colour-name', 'colour-hex']);
$thead = array_column($rows('th', ['th']), 'th');
$trows = $rows('td-a', ['td-a', 'td-b', 'td-c', 'td-d']);
$frames = $rows('frame-caption', ['frame-image', 'frame-caption', 'frame-kind']);
$uid = 'tb-guide-' . (int) $module->id;
$section = static function (string $title) use ($esc): string { return $title !== '' ? '<h2 class="tb-guide__h">' . $esc($title) . '</h2>' : ''; };
?>
<div class="ja-acm acm-tb-sys-styleguide tb-guide" id="<?php echo $uid; ?>">

  <section class="tb-guide__sec">
    <?php echo $section($g('s1')); ?>
    <div class="tb-guide__mapwrap"><div class="tb-guide__map" role="img" aria-label="<?php echo $esc(\Joomla\CMS\Language\Text::_('TPL_TRACY_BUSINESS_GUIDE_POSITIONS_ARIA')); ?>">
      <div class="tb-guide__row tb-guide__row--2"><div class="tb-pos tb-pos--ink">topbar-l</div><div class="tb-pos tb-pos--ink"><?php echo $esc(\Joomla\CMS\Language\Text::_('TPL_TRACY_BUSINESS_GUIDE_POS_TOPBAR_R')); ?></div></div>
      <div class="tb-guide__row tb-guide__row--121"><div class="tb-pos">logo</div><div class="tb-pos">menu</div><div class="tb-pos"><?php echo $esc(\Joomla\CMS\Language\Text::_('TPL_TRACY_BUSINESS_GUIDE_POS_SEARCH_CTA')); ?></div></div>
      <div class="tb-pos tb-pos--signal tb-pos--tall">banner</div>
      <div class="tb-guide__row tb-guide__row--4"><div class="tb-pos">top-a</div><div class="tb-pos">top-b</div><div class="tb-pos">top-c</div><div class="tb-pos">top-d</div></div>
      <div class="tb-guide__row tb-guide__row--main"><div class="tb-pos tb-pos--center">sidebar-l</div><div class="tb-pos tb-pos--forest tb-pos--center"><?php echo $esc(\Joomla\CMS\Language\Text::_('TPL_TRACY_BUSINESS_GUIDE_POS_COMPONENT')); ?></div><div class="tb-pos tb-pos--center">sidebar-r</div></div>
      <div class="tb-guide__row tb-guide__row--3"><div class="tb-pos">bottom-a</div><div class="tb-pos">bottom-b</div><div class="tb-pos">bottom-c</div></div>
      <div class="tb-guide__row tb-guide__row--4"><div class="tb-pos tb-pos--ink2">footer-a</div><div class="tb-pos tb-pos--ink2">footer-b</div><div class="tb-pos tb-pos--ink2">footer-c</div><div class="tb-pos tb-pos--ink2">footer-d</div></div>
      <div class="tb-pos tb-pos--ink tb-pos--meta"><?php echo $esc(\Joomla\CMS\Language\Text::_('TPL_TRACY_BUSINESS_GUIDE_POS_COPYRIGHT')); ?></div>
    </div></div>
  </section>

  <?php if ($type) : ?>
  <section class="tb-guide__sec">
    <?php echo $section($g('s2')); ?>
    <dl class="tb-guide__type">
      <?php foreach ($type as $r) : ?>
        <dt><?php echo $esc($r['type-label']); ?></dt>
        <dd class="tb-guide__type-sample tb-guide__type-sample--<?php echo $esc($r['type-kind'] ?: 'body'); ?>"><?php echo $esc($r['type-sample']); ?></dd>
      <?php endforeach; ?>
    </dl>
  </section>
  <?php endif; ?>

  <?php if ($colours) : ?>
  <section class="tb-guide__sec">
    <?php echo $section($g('s3')); ?>
    <ul class="tb-guide__colours">
      <?php foreach ($colours as $r) : ?>
        <?php $hex = preg_match('/^#[0-9a-f]{3,8}$/i', $r['colour-hex']) ? $r['colour-hex'] : ''; ?>
        <li><span class="tb-guide__swatch" style="<?php echo $hex !== '' ? 'background:' . $esc($swatchFill($hex)) : ''; ?>"></span><strong><?php echo $esc($r['colour-name']); ?></strong><span class="tb-guide__meta"><?php echo $esc($r['colour-hex']); ?></span></li>
      <?php endforeach; ?>
    </ul>
  </section>
  <?php endif; ?>

  <section class="tb-guide__sec">
    <?php echo $section($g('s4')); ?>
    <div class="tb-guide__forms">
      <div class="tb-guide__buttons">
        <?php if ($g('btn1') !== '') : ?><span class="tb-btn tb-btn--signal"><?php echo $esc($g('btn1')); ?></span><?php endif; ?>
        <?php if ($g('btn2') !== '') : ?><span class="tb-btn tb-btn--forest"><?php echo $esc($g('btn2')); ?></span><?php endif; ?>
        <?php if ($g('btn3') !== '') : ?><span class="tb-btn tb-btn--outline"><?php echo $esc($g('btn3')); ?></span><?php endif; ?>
        <?php if ($g('btn4') !== '') : ?><span class="tb-textlink"><?php echo $esc($g('btn4')); ?></span><?php endif; ?>
        <?php if ($g('btn5') !== '') : ?><span class="tb-btn tb-btn--disabled" aria-disabled="true"><?php echo $esc($g('btn5')); ?></span><?php endif; ?>
      </div>
      <div class="tb-guide__inputs" aria-label="Form field states">
        <span class="tb-field tb-field--sample"><?php echo $esc($g('inp1')); ?></span>
        <span class="tb-field tb-field--sample is-focus"><?php echo $esc($g('inp2')); ?></span>
        <div>
          <span class="tb-field tb-field--sample is-error"><?php echo $esc($g('inp3')); ?></span>
          <?php if ($g('err') !== '') : ?><span class="tb-field__error"><?php echo $esc($g('err')); ?></span><?php endif; ?>
        </div>
        <span class="tb-field tb-field--sample tb-field--area"><?php echo $esc($g('inp4')); ?></span>
      </div>
    </div>
  </section>

  <section class="tb-guide__sec">
    <?php echo $section($g('s5')); ?>
    <div class="tb-guide__alerts">
      <?php foreach (['info' => 'msg1', 'success' => 'msg2', 'warning' => 'msg3', 'danger' => 'msg4'] as $kind => $key) : ?>
        <?php if ($g($key) !== '') : ?><joomla-alert type="<?php echo $kind; ?>" role="alert" class="joomla-alert--show"><div class="alert-wrapper"><div class="alert-message"><?php echo $esc($g($key)); ?></div></div></joomla-alert><?php endif; ?>
      <?php endforeach; ?>
    </div>
  </section>

  <?php if ($thead || $trows) : ?>
  <section class="tb-guide__sec">
    <?php echo $section($g('s6')); ?>
    <div class="tb-table-wrap"><table class="tb-table">
      <?php if ($thead) : ?><thead><tr><?php foreach ($thead as $h) : ?><th scope="col"><?php echo $esc($h); ?></th><?php endforeach; ?></tr></thead><?php endif; ?>
      <tbody><?php foreach ($trows as $r) : ?><tr><th scope="row"><?php echo $esc($r['td-a']); ?></th><td><?php echo $esc($r['td-b']); ?></td><td><?php echo $esc($r['td-c']); ?></td><td><?php echo $esc($r['td-d']); ?></td></tr><?php endforeach; ?></tbody>
    </table></div>
  </section>
  <?php endif; ?>

  <?php if ($frames) : ?>
  <section class="tb-guide__sec">
    <?php echo $section($g('s7')); ?>
    <div class="tb-guide__frames">
      <?php foreach ($frames as $r) : ?>
        <?php $src = $media($r['frame-image']); ?>
        <figure class="tb-frame tb-frame--<?php echo $esc($r['frame-kind'] ?: 'cover'); ?>">
          <span class="tb-frame__box"><?php if ($src !== '') : ?><img src="<?php echo $esc($src); ?>" alt="" loading="lazy" decoding="async"><?php endif; ?></span>
          <figcaption class="tb-guide__meta"><?php echo $esc($r['frame-caption']); ?></figcaption>
        </figure>
      <?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>
</div>
