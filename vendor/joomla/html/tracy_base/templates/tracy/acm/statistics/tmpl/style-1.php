<?php
/**
 * Tracy — ACM block `statistics`, style 1.
 *
 * A row of 3 or 4 figures: a display-face number over a small muted caption, sitting DIRECTLY on
 * the band. No card, no ring, no accent fill — DESIGN.md §7 "let product imagery carry visual
 * drama; keep chrome understated", and the design-spec accent budget (<=2 visible accent uses per
 * screen) spends nothing here: this block is supporting material, never the emphasis.
 *
 * Every value below is an admin field. Rows come from the `figures` fieldset (multiple="1"), so the
 * owner adds and removes figures in the module editor with no code.
 */

defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

$eyebrow = trim((string) $helper->get('eyebrow'));
$heading = trim((string) $helper->get('heading'));

// The admin picks 3 or 4; anything else falls back to the 4-across default.
$columns = (int) $helper->get('columns');

if ($columns !== 3) {
    $columns = 4;
}

$rows    = (int) $helper->getRows('figure-value');
$figures = [];

for ($i = 0; $i < $rows; $i++) {
    $value   = trim((string) $helper->get('figure-value', $i));
    $caption = trim((string) $helper->get('figure-caption', $i));

    if ($value === '' && $caption === '') {
        continue;
    }

    $figures[] = ['value' => $value, 'caption' => $caption];
}

// Empty repeatable data does not create public demo claims.
if (!$figures) return;


$blockId   = 'acm-statistics-' . (int) $module->id;
$headingId = $blockId . '-heading';
?>
<div class="ja-acm acm-statistics style-1 acm-statistics--cols-<?php echo $columns; ?>"
     id="<?php echo $blockId; ?>"
     <?php if ($heading !== '') : ?>aria-labelledby="<?php echo $headingId; ?>"<?php endif; ?>>
  <div class="container">
    <?php if ($eyebrow !== '' || $heading !== '') : ?>
      <div class="tracy-figures__head">
        <?php if ($eyebrow !== '') : ?>
          <p class="tracy-figures__eyebrow"><?php echo $eyebrow; ?></p>
        <?php endif; ?>
        <?php if ($heading !== '') : ?>
          <h2 class="tracy-figures__heading" id="<?php echo $headingId; ?>"><?php echo $heading; ?></h2>
        <?php endif; ?>
      </div>
    <?php endif; ?>

    <div class="tracy-figures">
      <?php foreach ($figures as $figure) : ?>
        <div class="tracy-figure">
          <?php if ($figure['value'] !== '') : ?>
            <span class="tracy-figure__value"><?php echo $figure['value']; ?></span>
          <?php endif; ?>
          <?php if ($figure['caption'] !== '') : ?>
            <span class="tracy-figure__caption"><?php echo $figure['caption']; ?></span>
          <?php endif; ?>
        </div>
      <?php endforeach; ?>
    </div>
  </div>
</div>
