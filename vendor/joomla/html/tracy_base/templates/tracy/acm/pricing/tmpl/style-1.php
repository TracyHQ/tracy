<?php
/**
 * Tracy — ACM block `pricing`, style 1.
 *
 * Three tiers as ringed cards on a band whose surface the admin picks. Containment is the 1px ring
 * (--elev-ring), never a shadow: DESIGN.md §6 keeps depth at "Level 1 — subtle border containment"
 * for utility cards, and design-spec §4 reserves --elev-raised for overlays.
 *
 * THE ACCENT BUDGET IS ENFORCED HERE, NOT ONLY IN CSS. design-spec §2: one blue family, at most two
 * visible uses per screen; the pricing page also carries a cta-capsule, so this block spends exactly
 * ONE — the recommended tier's capsule button. Everything else in the block is neutral: the other
 * two actions are the ringed counterpart, the eyebrow is --meta (an eyebrow is a label, not an
 * action, and DESIGN.md §7 says "reserve blue accents for genuine action and navigation semantics"),
 * and the recommended tier is marked by a SURFACE CHANGE plus a stronger neutral ring, because
 * design-spec §2 says a section needing emphasis changes surface rather than adding a second colour.
 * If the admin flags more than one tier as recommended, only the first is honoured — the budget
 * cannot be overspent from the module editor.
 *
 * Every text, price, feature line, label and link below is an admin field.
 */

defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

use Joomla\CMS\Router\Route;

$eyebrow = trim((string) $helper->get('eyebrow'));
$heading = trim((string) $helper->get('heading'));
$intro   = trim((string) $helper->get('intro'));
$headingTag = $helper->get('heading-level') === 'h1' ? 'h1' : 'h2';

// Band surface — the chapter ladder of design-spec §6: instances alternate bg / surface-warm /
// surface so a stack of sections separates by contrast instead of by a rule.
$surface = (string) $helper->get('surface');

if (!in_array($surface, ['canvas', 'warm', 'gray'], true)) {
    $surface = 'gray';
}

$rows  = (int) $helper->getRows('tier-name');
$tiers = [];

for ($i = 0; $i < $rows; $i++) {
    $name = trim((string) $helper->get('tier-name', $i));

    if ($name === '') {
        continue;
    }

    $tiers[] = [
        'name'        => $name,
        'summary'     => trim((string) $helper->get('tier-summary', $i)),
        'price'       => trim((string) $helper->get('tier-price', $i)),
        'period'      => trim((string) $helper->get('tier-period', $i)),
        'features'    => (string) $helper->get('tier-features', $i),
        'label'       => trim((string) $helper->get('tier-action-label', $i)),
        'link'        => trim((string) $helper->get('tier-action-link', $i)),
        'recommended' => ((string) $helper->get('tier-recommended', $i) === '1'),
        'badge'       => trim((string) $helper->get('tier-badge', $i)),
    ];
}

// Empty repeatable data does not create public demo claims.
if (!$tiers) return;


// Spend the accent once: the first flagged tier keeps it, any later flag is demoted.
$accentSpent = false;

foreach ($tiers as $index => $tier) {
    if ($tier['recommended'] && !$accentSpent) {
        $accentSpent = true;

        continue;
    }

    $tiers[$index]['recommended'] = false;
}

$blockId   = 'acm-pricing-' . (int) $module->id;
$headingId = $blockId . '-heading';

// A check glyph, not a decorative image: drawn in currentColor so the token remap in darkmode.css
// carries it into dark with no second asset (editability-standards §4 keeps simple glyphs as code).
$check = '<svg class="tracy-plan__check" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 10.5 8 14.5 16 5.5"/></svg>';
?>
<div class="ja-acm acm-pricing style-1 acm-pricing--<?php echo $surface; ?>"
     id="<?php echo $blockId; ?>"
     <?php if ($heading !== '') : ?>aria-labelledby="<?php echo $headingId; ?>"<?php endif; ?>>
  <div class="container">
    <?php if ($eyebrow !== '' || $heading !== '' || $intro !== '') : ?>
      <div class="tracy-pricing__head">
        <?php if ($eyebrow !== '') : ?>
          <p class="tracy-pricing__eyebrow"><?php echo $eyebrow; ?></p>
        <?php endif; ?>
        <?php if ($heading !== '') : ?>
          <<?php echo $headingTag; ?> class="tracy-pricing__heading" id="<?php echo $headingId; ?>"><?php echo $heading; ?></<?php echo $headingTag; ?>>
        <?php endif; ?>
        <?php if ($intro !== '') : ?>
          <p class="tracy-pricing__intro"><?php echo $intro; ?></p>
        <?php endif; ?>
      </div>
    <?php endif; ?>

    <div class="tracy-pricing__grid">
      <?php foreach ($tiers as $tierIndex => $tier) :
          $features = array_values(array_filter(array_map('trim', preg_split('/\r\n|\r|\n/', $tier['features']))));
          $link     = $tier['link'] !== '' ? $tier['link'] : '#';

          // Internal targets are routed so they survive a menu move; anything else is passed through.
          if (strpos($link, 'index.php') === 0) {
              $link = Route::_($link);
          }

          $planId = $blockId . '-tier-' . $tierIndex;
      ?>
        <article class="tracy-plan<?php echo $tier['recommended'] ? ' tracy-plan--recommended' : ''; ?>"
                 aria-labelledby="<?php echo $planId; ?>">
          <?php if ($tier['recommended'] && $tier['badge'] !== '') : ?>
            <p class="tracy-plan__badge"><?php echo htmlspecialchars($tier['badge'], ENT_COMPAT, 'UTF-8'); ?></p>
          <?php endif; ?>

          <h3 class="tracy-plan__name" id="<?php echo $planId; ?>"><?php echo htmlspecialchars($tier['name'], ENT_COMPAT, 'UTF-8'); ?></h3>

          <?php if ($tier['summary'] !== '') : ?>
            <p class="tracy-plan__summary"><?php echo htmlspecialchars($tier['summary'], ENT_COMPAT, 'UTF-8'); ?></p>
          <?php endif; ?>

          <?php if ($tier['price'] !== '' || $tier['period'] !== '') : ?>
            <p class="tracy-plan__price">
              <?php if ($tier['price'] !== '') : ?>
                <span class="tracy-plan__amount"><?php echo htmlspecialchars($tier['price'], ENT_COMPAT, 'UTF-8'); ?></span>
              <?php endif; ?>
              <?php if ($tier['period'] !== '') : ?>
                <span class="tracy-plan__period"><?php echo htmlspecialchars($tier['period'], ENT_COMPAT, 'UTF-8'); ?></span>
              <?php endif; ?>
            </p>
          <?php endif; ?>

          <?php if ($tier['label'] !== '') : ?>
            <a class="tracy-plan__action <?php echo $tier['recommended'] ? 'tracy-plan__action--accent' : 'tracy-plan__action--ring'; ?>"
               href="<?php echo htmlspecialchars($link, ENT_COMPAT, 'UTF-8'); ?>"><?php echo htmlspecialchars($tier['label'], ENT_COMPAT, 'UTF-8'); ?></a>
          <?php endif; ?>

          <?php if ($features) : ?>
            <ul class="tracy-plan__features">
              <?php foreach ($features as $feature) : ?>
                <li><?php echo $check; ?><span><?php echo htmlspecialchars($feature, ENT_COMPAT, 'UTF-8'); ?></span></li>
              <?php endforeach; ?>
            </ul>
          <?php endif; ?>
        </article>
      <?php endforeach; ?>
    </div>
  </div>
</div>
