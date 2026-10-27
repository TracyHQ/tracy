<?php
/**
 * Tracy — ACM block `timeline`, style 1.
 *
 * An ordered list of moments: a year (or a stage name) in the left column, the entry beside it, a
 * hairline running between them. This is the one block in the set where the numbering is not
 * decoration — order carries the meaning, so it is an `<ol>`.
 *
 * What this block deliberately does NOT have, and why:
 *   - no alternating left/right zig-zag. It doubles the reading path for no gain and collapses to
 *     a single column on a phone anyway, so the desktop layout teaches a shape the phone denies.
 *   - no icons in the markers. design-spec §7 "restrained iconography"; the marker is a 9px dot on
 *     the rule, which is enough to say "a point in a sequence".
 */

defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

$eyebrow = trim((string) $helper->get('eyebrow'));
$heading = trim((string) $helper->get('heading'));
$headingTag = $helper->get('heading-level') === 'h1' ? 'h1' : 'h2';
$intro   = trim((string) $helper->get('intro'));

$ground = (string) $helper->get('ground');

if (!in_array($ground, ['canvas', 'warm', 'gray'], true)) {
    $ground = 'canvas';
}

$rows    = (int) $helper->getRows('entry');
$entries = [];

for ($i = 0; $i < $rows; $i++) {
    $title = trim((string) $helper->get('entry-title', $i));
    $text  = trim((string) $helper->get('entry-text', $i));

    if ($title === '' && $text === '') {
        continue;
    }

    $entries[] = [
        'marker' => trim((string) $helper->get('entry-marker', $i)),
        'title'  => $title,
        'text'   => $text,
    ];
}

if (!$entries) return;


$blockId   = 'acm-timeline-' . (int) $module->id;
$headingId = $blockId . '-heading';
?>
<div class="ja-acm acm-timeline style-1 acm-timeline--<?php echo $ground; ?>"
     id="<?php echo $blockId; ?>"
     <?php if ($heading !== '') : ?>aria-labelledby="<?php echo $headingId; ?>"<?php endif; ?>>
  <div class="container">

    <?php if ($eyebrow !== '' || $heading !== '' || $intro !== '') : ?>
      <div class="tracy-timeline__head">
        <?php if ($eyebrow !== '') : ?>
          <p class="tracy-timeline__eyebrow"><?php echo $eyebrow; ?></p>
        <?php endif; ?>
        <?php if ($heading !== '') : ?>
          <<?php echo $headingTag; ?> class="tracy-timeline__heading" id="<?php echo $headingId; ?>"><?php echo $heading; ?></<?php echo $headingTag; ?>>
        <?php endif; ?>
        <?php if ($intro !== '') : ?>
          <p class="tracy-timeline__intro"><?php echo $intro; ?></p>
        <?php endif; ?>
      </div>
    <?php endif; ?>

    <ol class="tracy-timeline__list">
      <?php foreach ($entries as $entry) : ?>
        <li class="tracy-timeline__entry">
          <?php if ($entry['marker'] !== '') : ?>
            <p class="tracy-timeline__marker"><?php echo $entry['marker']; ?></p>
          <?php endif; ?>
          <div class="tracy-timeline__body">
            <?php if ($entry['title'] !== '') : ?>
              <h3 class="tracy-timeline__title"><?php echo $entry['title']; ?></h3>
            <?php endif; ?>
            <?php if ($entry['text'] !== '') : ?>
              <p class="tracy-timeline__text"><?php echo $entry['text']; ?></p>
            <?php endif; ?>
          </div>
        </li>
      <?php endforeach; ?>
    </ol>

  </div>
</div>
