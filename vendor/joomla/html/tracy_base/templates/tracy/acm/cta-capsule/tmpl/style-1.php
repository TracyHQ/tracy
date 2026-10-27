<?php
/**
 * Tracy — ACM block `cta-capsule`, style 1.
 *
 * The template's closing call to action, and the one place the 980px silhouette is used at panel
 * scale: DESIGN.md §5 lists "56px / 100px / 980px: capsules, large pills, and signature elongated
 * CTA forms", so a wide, short stadium shell IS the named form rather than a decoration.
 *
 * Anatomy (design-spec §6 — authored from the fixture's component vocabulary, since the fixture
 * ships no CTA region): one statement line at the h2 tier, one muted support line, one primary
 * capsule action, and an optional secondary text link.
 *
 * Accent budget: ONE visible blue — the capsule. The panel earns its emphasis from a SURFACE
 * change (--surface inside a --bg band, contained by the 1px ring), which is what design-spec §2
 * asks for in place of a second colour, and the secondary link stays ink.
 *
 * Every string and link is an admin field; the fallbacks only seed a freshly published module.
 */

defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

$statement = trim((string) $helper->get('statement'));
$support   = trim((string) $helper->get('support'));

$btnText = trim((string) $helper->get('btn-text'));
$btnLink = trim((string) $helper->get('btn-link'));

$linkText = trim((string) $helper->get('link-text'));
$linkUrl  = trim((string) $helper->get('link-url'));





$blockId     = 'acm-cta-capsule-' . (int) $module->id;
$statementId = $blockId . '-statement';

// A link field left empty must still produce a focusable, non-broken control.
$btnLink = $btnLink !== '' ? $btnLink : '#';
$linkUrl = $linkUrl !== '' ? $linkUrl : '#';
?>
<div class="ja-acm acm-cta-capsule style-1"
     id="<?php echo $blockId; ?>"
     <?php if ($statement !== '') : ?>aria-labelledby="<?php echo $statementId; ?>"<?php endif; ?>>
  <div class="container">
    <div class="tracy-cta">

      <div class="tracy-cta__copy">
        <?php if ($statement !== '') : ?>
          <p class="tracy-cta__statement" id="<?php echo $statementId; ?>"><?php echo htmlspecialchars($statement, ENT_QUOTES, 'UTF-8'); ?></p>
        <?php endif; ?>

        <?php /* The support line is deliberately rich: the owner may emphasise a phrase inside it. */ ?>
        <?php if ($support !== '') : ?>
          <p class="tracy-cta__support"><?php echo $support; ?></p>
        <?php endif; ?>
      </div>

      <?php if ($btnText !== '' && $btnLink !== '#' || $linkText !== '' && $linkUrl !== '#') : ?>
        <div class="tracy-cta__actions">
          <?php if ($btnText !== '' && $btnLink !== '#') : ?>
            <a class="btn btn-primary tracy-cta__btn" href="<?php echo htmlspecialchars($btnLink, ENT_QUOTES, 'UTF-8'); ?>">
              <?php echo htmlspecialchars($btnText, ENT_QUOTES, 'UTF-8'); ?>
            </a>
          <?php endif; ?>
          <?php if ($linkText !== '' && $linkUrl !== '#') : ?>
            <a class="tracy-cta__link" href="<?php echo htmlspecialchars($linkUrl, ENT_QUOTES, 'UTF-8'); ?>">
              <?php echo htmlspecialchars($linkText, ENT_QUOTES, 'UTF-8'); ?>
            </a>
          <?php endif; ?>
        </div>
      <?php endif; ?>

    </div>
  </div>
</div>
