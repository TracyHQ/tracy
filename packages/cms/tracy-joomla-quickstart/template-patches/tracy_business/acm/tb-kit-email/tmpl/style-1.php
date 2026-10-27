<?php
/**
 * Tracy Business — ACM `tb-kit-email`: the Email page body — TEMPLATES list (left) and one branded
 * Joomla system mail drawn inside an envelope frame (From / To / Subject, mark + wordmark,
 * greeting, paragraph, details table, signal button, footer). A reference for System → Mail
 * Templates (com_mails); every part here is a static sample, so the button is text, not a link.
 */
defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);
$esc = static fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$g = static fn (string $k) => trim((string) $helper->get($k));
$listT = $g('list-title');
$tpls = [];
for ($i = 0, $n = (int) $helper->getRows('tpl-title'); $i < $n; $i++) { $t = trim((string) $helper->get('tpl-title', $i)); if ($t !== '') $tpls[] = [$t, trim((string) $helper->get('tpl-desc', $i))]; }
$meta = [];
for ($i = 0, $n = (int) $helper->getRows('meta-key'); $i < $n; $i++) { $k = trim((string) $helper->get('meta-key', $i)); $v = trim((string) $helper->get('meta-value', $i)); if ($k !== '' || $v !== '') $meta[] = [$k, $v]; }
$from = $g('from'); $to = $g('to'); $subj = $g('subject'); // Fallbacks are identity tokens, replaced by plg_system_tracyidentity: the demo's name is not a default.
$brand = $g('brand') ?: '{site.name}'; $mark = $g('brand-mark') ?: '{site.monogram}';
$greet = $g('greeting'); $body = $g('body'); $metaT = $g('meta-title'); $bt = $g('btn-text'); $foot = $g('foot');
if (!$tpls && $subj === '' && $body === '') return;
$id = 'tb-kitemail-' . (int) $module->id;
?>
<section class="ja-acm acm-tb-kit-email tb-kitemail" id="<?php echo $id; ?>">
  <div class="tb-container tb-kitemail__grid">
    <?php if ($tpls) : ?>
      <nav class="tb-kitemail__list" aria-label="<?php echo $esc($listT ?: 'Templates'); ?>">
        <?php if ($listT !== '') : ?><h2 class="tb-kitside__title"><?php echo $esc($listT); ?></h2><?php endif; ?>
        <ul class="tb-kitemail__tpls">
          <?php foreach ($tpls as [$t, $d]) : ?><li class="tb-kitemail__tpl"><strong class="tb-kitemail__tpl-title"><?php echo $esc($t); ?></strong><?php if ($d !== '') : ?><span class="tb-kitemail__tpl-desc"><?php echo $esc($d); ?></span><?php endif; ?></li><?php endforeach; ?>
        </ul>
      </nav>
    <?php endif; ?>
    <div class="tb-kitemail__frame">
      <?php if ($from !== '' || $to !== '' || $subj !== '') : ?>
        <div class="tb-kitemail__head">
          <?php if ($from !== '') : ?><span class="tb-kitemail__from"><?php echo $esc($from); ?></span><?php endif; ?>
          <?php if ($to !== '') : ?><span class="tb-kitemail__to"><?php echo $esc($to); ?></span><?php endif; ?>
          <?php if ($subj !== '') : ?><span class="tb-kitemail__subject"><?php echo $esc($subj); ?></span><?php endif; ?>
        </div>
      <?php endif; ?>
      <div class="tb-kitemail__body">
        <p class="tb-kitemail__brand"><span class="tb-kitemail__mark" aria-hidden="true"><?php echo $esc($mark); ?></span><span class="tb-kitemail__wordmark"><?php echo $esc($brand); ?></span></p>
        <?php if ($greet !== '') : ?><p class="tb-kitemail__greet"><?php echo $esc($greet); ?></p><?php endif; ?>
        <?php if ($body !== '') : ?><p class="tb-kitemail__text"><?php echo $esc($body); ?></p><?php endif; ?>
        <?php if ($meta) : ?>
          <div class="tb-kitemail__meta">
            <?php if ($metaT !== '') : ?><p class="tb-kitemail__meta-title"><?php echo $esc($metaT); ?></p><?php endif; ?>
            <dl class="tb-kitemail__meta-list"><?php foreach ($meta as [$k, $v]) : ?><div class="tb-kitemail__meta-row"><dt><?php echo $esc($k); ?></dt><dd><?php echo $esc($v); ?></dd></div><?php endforeach; ?></dl>
          </div>
        <?php endif; ?>
        <?php if ($bt !== '') : ?><span class="tb-btn tb-btn--signal tb-kitemail__btn" role="presentation"><?php echo $esc($bt); ?></span><?php endif; ?>
      </div>
      <?php if ($foot !== '') : ?><p class="tb-kitemail__foot"><?php echo $esc($foot); ?></p><?php endif; ?>
    </div>
  </div>
</section>
