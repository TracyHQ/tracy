<?php
/**
 * Tracy — ACM block `accordion`, style 1.
 *
 * An FAQ list built on native <details>/<summary>. NO JavaScript: the browser owns the open/closed
 * state, so the block works with scripts blocked, inside the admin preview, and on a printed page —
 * and there is nothing to break when T4 reorders its bundles. The disclosure marker is drawn here
 * rather than left to the UA triangle, so it follows the tokens like everything else.
 *
 * Rows are separated by --border-soft hairlines and nothing else (design-spec §6, faq.html): no
 * card, no ring, no shadow, no radius. This is the one place in the template where separation is
 * rule-led rather than surface-led, because a list of questions IS a single surface.
 *
 * The accent budget (design-spec §2) spends ZERO on chrome here: the eyebrow is --meta, the question
 * ink is --fg and the marker is --meta. The pages that carry this block (faq, pricing,
 * service-detail, home-2) all pair it with a cta-capsule, and that CTA is where the blue belongs.
 * An inline link the owner writes into an answer still renders blue — that is body-copy navigation,
 * which DESIGN.md §7 names as exactly what the accent is for.
 *
 * Every question and answer is an admin field; the answer runs through content.prepare so editor
 * plugins and inline links behave as they do in an article.
 */

defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

use Joomla\CMS\HTML\HTMLHelper;

$eyebrow = trim((string) $helper->get('eyebrow'));
$heading = trim((string) $helper->get('heading'));
$intro   = trim((string) $helper->get('intro'));

$surface = (string) $helper->get('surface');

if (!in_array($surface, ['canvas', 'warm', 'gray'], true)) {
    $surface = 'canvas';
}

$firstOpen = ((string) $helper->get('first-open') !== '0');

// The `name` attribute makes a group of <details> mutually exclusive with no script. Browsers that
// do not know it simply allow several open at once, which is a fine fallback rather than a break.
$exclusive = ((string) $helper->get('one-at-a-time') !== '0');

$rows    = (int) $helper->getRows('entry-question');
$entries = [];

for ($i = 0; $i < $rows; $i++) {
    $question = trim((string) $helper->get('entry-question', $i));

    if ($question === '') {
        continue;
    }

    $entries[] = [
        'question' => $question,
        'answer'   => (string) $helper->get('entry-answer', $i),
    ];
}

// Empty repeatable data does not create public demo claims.
if (!$entries) return;


$blockId   = 'acm-accordion-' . (int) $module->id;
$headingId = $blockId . '-heading';
?>
<div class="ja-acm acm-accordion style-1 acm-accordion--<?php echo $surface; ?>"
     id="<?php echo $blockId; ?>"
     <?php if ($heading !== '') : ?>aria-labelledby="<?php echo $headingId; ?>"<?php endif; ?>>
  <div class="container">
    <?php if ($eyebrow !== '' || $heading !== '' || $intro !== '') : ?>
      <div class="tracy-faq__head">
        <?php if ($eyebrow !== '') : ?>
          <p class="tracy-faq__eyebrow"><?php echo $eyebrow; ?></p>
        <?php endif; ?>
        <?php if ($heading !== '') : ?>
          <h2 class="tracy-faq__heading" id="<?php echo $headingId; ?>"><?php echo $heading; ?></h2>
        <?php endif; ?>
        <?php if ($intro !== '') : ?>
          <p class="tracy-faq__intro"><?php echo $intro; ?></p>
        <?php endif; ?>
      </div>
    <?php endif; ?>

    <div class="tracy-faq__list">
      <?php foreach ($entries as $entryIndex => $entry) :
          $answerId = $blockId . '-answer-' . $entryIndex;
          $isOpen   = ($firstOpen && $entryIndex === 0);
      ?>
        <details class="tracy-faq__item"
                 <?php if ($exclusive) : ?>name="<?php echo $blockId; ?>"<?php endif; ?>
                 <?php if ($isOpen) : ?>open<?php endif; ?>>
          <summary class="tracy-faq__question">
            <span class="tracy-faq__question-text"><?php echo htmlspecialchars($entry['question'], ENT_COMPAT, 'UTF-8'); ?></span>
            <span class="tracy-faq__marker" aria-hidden="true"></span>
          </summary>
          <div class="tracy-faq__answer" id="<?php echo $answerId; ?>">
            <?php echo HTMLHelper::_('content.prepare', $entry['answer']); ?>
          </div>
        </details>
      <?php endforeach; ?>
    </div>
  </div>
</div>
