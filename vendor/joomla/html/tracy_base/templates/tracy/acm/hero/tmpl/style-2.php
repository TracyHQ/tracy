<?php
/**
 * Tracy — ACM block `hero`, style 2: centered, no status aside.
 *
 * The home-2 variant (design-spec §6). Same field names as style 1 on purpose: switching a
 * published module between the two styles keeps the copy the owner already typed.
 *
 * Without the aside, the headline gets the whole 1024px core, so it steps up to the display tier
 * --text-4xl (design-spec §3, "hero display line, home only") capped at 18ch — the same treatment
 * scss/_base.scss gives .tracy-hero--centered. Style 1 stays at --text-3xl because its
 * headline column is only ~1.3fr of the grid, exactly as the reference fixture renders it.
 *
 * Accent budget: the eyebrow and the primary capsule, and nothing else — see style-1.php.
 */

defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

$eyebrow = trim((string) $helper->get('eyebrow'));
$title   = trim((string) $helper->get('title'));
$lead    = trim((string) $helper->get('lead'));

$btn1Text = trim((string) $helper->get('btn-1-text'));
$btn1Link = trim((string) $helper->get('btn-1-link'));
$btn2Text = trim((string) $helper->get('btn-2-text'));
$btn2Link = trim((string) $helper->get('btn-2-link'));





$blockId = 'acm-hero-' . (int) $module->id;
$titleId = $blockId . '-title';

$btn1Link = $btn1Link !== '' ? $btn1Link : '#';
$btn2Link = $btn2Link !== '' ? $btn2Link : '#';

$arrow = '<svg class="tracy-hero__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    . ' stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    . '<path d="M5 12h14M13 6l6 6-6 6" /></svg>';
?>
<div class="ja-acm acm-hero style-2"
     id="<?php echo $blockId; ?>"
     <?php if ($title !== '') : ?>aria-labelledby="<?php echo $titleId; ?>"<?php endif; ?>>
  <div class="container">
    <div class="tracy-hero__copy">
      <?php if ($eyebrow !== '') : ?>
        <p class="tracy-hero__eyebrow"><?php echo htmlspecialchars($eyebrow, ENT_QUOTES, 'UTF-8'); ?></p>
      <?php endif; ?>

      <?php if ($title !== '') : ?>
        <h1 class="tracy-hero__title" id="<?php echo $titleId; ?>"><?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?></h1>
      <?php endif; ?>

      <?php /* The lead is deliberately rich: the owner may emphasise a phrase inside it. */ ?>
      <?php if ($lead !== '') : ?>
        <p class="tracy-hero__lead"><?php echo $lead; ?></p>
      <?php endif; ?>

      <?php if ($btn1Text !== '' && $btn1Link !== '#' || $btn2Text !== '' && $btn2Link !== '#') : ?>
        <div class="tracy-hero__actions">
          <?php if ($btn1Text !== '' && $btn1Link !== '#') : ?>
            <a class="btn btn-primary" href="<?php echo htmlspecialchars($btn1Link, ENT_QUOTES, 'UTF-8'); ?>">
              <?php echo htmlspecialchars($btn1Text, ENT_QUOTES, 'UTF-8'); ?><?php echo $arrow; ?>
            </a>
          <?php endif; ?>
          <?php if ($btn2Text !== '' && $btn2Link !== '#') : ?>
            <a class="btn btn-secondary" href="<?php echo htmlspecialchars($btn2Link, ENT_QUOTES, 'UTF-8'); ?>">
              <?php echo htmlspecialchars($btn2Text, ENT_QUOTES, 'UTF-8'); ?>
            </a>
          <?php endif; ?>
        </div>
      <?php endif; ?>
    </div>
  </div>
</div>
