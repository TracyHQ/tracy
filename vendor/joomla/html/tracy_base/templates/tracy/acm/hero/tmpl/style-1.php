<?php
/**
 * Tracy — ACM block `hero`, style 1: split masthead with the status aside.
 *
 * Matches the reference fixture's #hero region (reference/index.html, data-od-id="hero"): a
 * 1.3fr / 1fr grid aligned to its baseline, an accent eyebrow, the display headline, a lead capped
 * at 52ch, two capsule actions, and a ringed status card on the right.
 *
 * Accent budget — design-spec §2 allows at most TWO visible uses of the blue per screen, and this
 * block spends BOTH of them: the eyebrow and the primary capsule. The second action is therefore
 * the template's `.btn-secondary` (ink text inside a 1px ring), not a second blue, and the status
 * badge is a SEMANTIC colour (--success / --muted), which the budget does not count.
 *
 * Every string, link and state below is an admin field; the fallbacks only seed a freshly published
 * module so the section reads as designed instead of collapsing to an empty band.
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

$heroImage = explode('#', trim((string) $helper->get('hero-image')))[0];
if ($heroImage !== '' && !preg_match('~^(?:[a-z][a-z0-9+.-]*:|/)~i', $heroImage)) $heroImage = \Joomla\CMS\Uri\Uri::root(true) . '/' . $heroImage;
$heroAlt = trim((string) $helper->get('hero-image-alt'));
$asideLabel = trim((string) $helper->get('aside-label'));
$asideBadge = trim((string) $helper->get('aside-badge'));

// The admin picks the semantic tone of the badge; anything else falls back to the calm default.
$asideState = (string) $helper->get('aside-badge-state');

if ($asideState !== 'muted') {
    $asideState = 'success';
}

// The aside note lines are a repeatable fieldset, so the owner adds and removes lines with no code.
$notes = [];

for ($i = 0, $rows = (int) $helper->getRows('note'); $i < $rows; $i++) {
    $note = trim((string) $helper->get('note', $i));

    if ($note !== '') {
        $notes[] = $note;
    }
}







$blockId = 'acm-hero-' . (int) $module->id;
$titleId = $blockId . '-title';

// A link field left empty must still produce a focusable, non-broken control.
$btn1Link = $btn1Link !== '' ? $btn1Link : '#';
$btn2Link = $btn2Link !== '' ? $btn2Link : '#';

// The chevron-arrow suffix on a call-to-action link — DESIGN.md §4. A single-path glyph, not a
// complex visual, so it renders inline rather than becoming a media field (editability §4).
$arrow = '<svg class="tracy-hero__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    . ' stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    . '<path d="M5 12h14M13 6l6 6-6 6" /></svg>';
?>
<div class="ja-acm acm-hero style-1"
     id="<?php echo $blockId; ?>"
     <?php if ($title !== '') : ?>aria-labelledby="<?php echo $titleId; ?>"<?php endif; ?>>
  <div class="container">
    <div class="tracy-hero__grid">

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

      <?php if ($heroImage !== '') : ?>
        <figure class="tracy-hero__visual"><img src="<?php echo htmlspecialchars($heroImage, ENT_QUOTES); ?>" alt="<?php echo htmlspecialchars($heroAlt, ENT_QUOTES); ?>" width="1536" height="1024" fetchpriority="high" decoding="async"></figure>
      <?php elseif ($asideLabel !== '' || $asideBadge !== '' || $notes) : ?>
        <aside class="tracy-hero__meta"
               <?php if ($asideLabel !== '') : ?>aria-label="<?php echo htmlspecialchars($asideLabel, ENT_QUOTES, 'UTF-8'); ?>"<?php endif; ?>>
          <?php if ($asideLabel !== '' || $asideBadge !== '') : ?>
            <div class="tracy-hero__meta-row">
              <?php if ($asideLabel !== '') : ?>
                <span class="tracy-hero__meta-label"><?php echo htmlspecialchars($asideLabel, ENT_QUOTES, 'UTF-8'); ?></span>
              <?php endif; ?>
              <?php if ($asideBadge !== '') : ?>
                <span class="tracy-badge tracy-badge--<?php echo $asideState; ?>">
                  <span class="tracy-badge__dot" aria-hidden="true"></span>
                  <?php echo htmlspecialchars($asideBadge, ENT_QUOTES, 'UTF-8'); ?>
                </span>
              <?php endif; ?>
            </div>
          <?php endif; ?>

          <?php /* Note lines carry <time> and <kbd> marks, so they render as authored HTML. */ ?>
          <?php foreach ($notes as $note) : ?>
            <p class="tracy-hero__note"><?php echo $note; ?></p>
          <?php endforeach; ?>
        </aside>
      <?php endif; ?>

    </div>
  </div>
</div>
