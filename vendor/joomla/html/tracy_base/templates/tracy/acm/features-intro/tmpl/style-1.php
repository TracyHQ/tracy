<?php
/**
 * Tracy — ACM block `features-intro`, style 1.
 *
 * Pixel target: the fixture's `#features` region (reference/index.html, data-od-id="features") —
 * an eyebrow, a section title, a muted lead, then `.features-grid` of cards where the FIRST card is
 * the spotlight (`.card-feature`) and the rest are plain cards.
 *
 * Everything on screen is an admin field. The cards come from the `cards` fieldset (multiple="1"),
 * so the owner adds, reorders and removes them in the module editor with no code.
 *
 * Two things the fixture does that this block deliberately does NOT copy, both because
 * design-spec.md overrides the fixture where they disagree:
 *   - the fixture's `.card-feature` carries `--elev-raised`. design-spec §4 reserves that shadow
 *     for OVERLAYS; containment here is the 1px ring (`--elev-ring`), per DESIGN.md §7
 *     "don't overuse shadows … in core UI chrome".
 *   - the fixture paints BOTH the section eyebrow and the spotlight card's "Featured" label in
 *     --accent. design-spec §2 caps a screen at two visible accent uses, and the home page already
 *     spends one on the hero CTA. The section eyebrow keeps the blue; the spotlight label steps
 *     down to --meta, so this block costs exactly one.
 */

defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

use Joomla\CMS\Helper\MediaHelper;

$eyebrow  = trim((string) $helper->get('eyebrow'));
$title    = trim((string) $helper->get('title'));
$lead     = trim((string) $helper->get('lead'));
$spotlight = trim((string) $helper->get('spotlight-label'));

$rows  = (int) $helper->getRows('card-title');
$cards = [];

for ($i = 0; $i < $rows; $i++) {
    $cardTitle = trim((string) $helper->get('card-title', $i));
    $cardText  = trim((string) $helper->get('card-text', $i));

    if ($cardTitle === '' && $cardText === '') {
        continue;
    }

    // A `media` field value carries Joomla's adapter suffix (`…svg#joomlaImage://local-images/…`).
    // getCleanMediaFieldValue strips it; rendering the raw value yields a 404 image.
    $icon = trim((string) $helper->get('card-icon', $i));

    $cards[] = [
        'icon'      => $icon !== '' ? MediaHelper::getCleanMediaFieldValue($icon) : '',
        'icon_alt'  => trim((string) $helper->get('card-icon-alt', $i)),
        'title'     => $cardTitle,
        'text'      => $cardText,
        'link_text' => trim((string) $helper->get('card-link-text', $i)),
        'link_url'  => trim((string) $helper->get('card-link-url', $i)),
    ];
}

// Empty repeatable data does not create public demo claims.
if (!$cards) return;


$blockId  = 'acm-features-intro-' . (int) $module->id;
$titleId  = $blockId . '-title';
$hasHead  = $eyebrow !== '' || $title !== '' || $lead !== '';
?>
<div class="ja-acm acm-features-intro style-1"
     id="<?php echo $blockId; ?>"
     <?php if ($title !== '') : ?>aria-labelledby="<?php echo $titleId; ?>"<?php endif; ?>>
  <div class="container">

    <?php if ($hasHead) : ?>
      <div class="tracy-features-intro__head">
        <?php if ($eyebrow !== '') : ?>
          <p class="tracy-features-intro__eyebrow"><?php echo $eyebrow; ?></p>
        <?php endif; ?>
        <?php if ($title !== '') : ?>
          <h2 class="tracy-features-intro__title" id="<?php echo $titleId; ?>"><?php echo $title; ?></h2>
        <?php endif; ?>
        <?php if ($lead !== '') : ?>
          <p class="tracy-features-intro__lead"><?php echo $lead; ?></p>
        <?php endif; ?>
      </div>
    <?php endif; ?>

    <div class="tracy-features-grid">
      <?php foreach ($cards as $index => $card) : ?>
        <?php
        // The FIRST card is the spotlight — it takes the wide 1.3fr track and the warm surface, the
        // fixture's "one .card-feature per band". Reordering the rows in the admin moves the
        // spotlight; there is no separate checkbox to keep in sync with the grid.
        $isFeature = $index === 0;
        ?>
        <article class="tracy-card tracy-features-intro__card<?php echo $isFeature ? ' tracy-features-intro__card--feature' : ''; ?>">
          <?php if ($isFeature && $spotlight !== '') : ?>
            <p class="tracy-features-intro__spotlight"><?php echo $spotlight; ?></p>
          <?php endif; ?>

          <?php if ($card['icon'] !== '') : ?>
            <span class="tracy-features-intro__icon">
              <img src="<?php echo htmlspecialchars($card['icon'], ENT_QUOTES, 'UTF-8'); ?>"
                   alt="<?php echo htmlspecialchars($card['icon_alt'], ENT_QUOTES, 'UTF-8'); ?>"
                   loading="lazy" decoding="async">
            </span>
          <?php endif; ?>

          <?php if ($card['title'] !== '') : ?>
            <h3 class="tracy-features-intro__card-title"><?php echo $card['title']; ?></h3>
          <?php endif; ?>

          <?php if ($card['text'] !== '') : ?>
            <p class="tracy-features-intro__card-text"><?php echo $card['text']; ?></p>
          <?php endif; ?>

          <?php if ($card['link_text'] !== '') : ?>
            <p class="tracy-features-intro__card-action">
              <a class="tracy-features-intro__card-link"
                 href="<?php echo htmlspecialchars($card['link_url'] !== '' ? $card['link_url'] : '#', ENT_QUOTES, 'UTF-8'); ?>">
                <?php echo htmlspecialchars($card['link_text'], ENT_QUOTES, 'UTF-8'); ?>
                <svg class="tracy-features-intro__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            </p>
          <?php endif; ?>
        </article>
      <?php endforeach; ?>
    </div>

  </div>
</div>
