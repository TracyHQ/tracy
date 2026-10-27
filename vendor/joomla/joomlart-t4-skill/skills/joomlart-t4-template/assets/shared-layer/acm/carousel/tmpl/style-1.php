<?php
/**
 * Tracy — ACM block `carousel`, style 1.
 *
 * A row of cards that scrolls sideways. Built on CSS scroll-snap, not on a slider library: the
 * track is a real scroll container, so a trackpad, a touch screen, a scrollbar and the arrow keys
 * all work before a single line of JavaScript runs, and the block still reads correctly if the
 * script never loads.
 *
 * What this block deliberately does NOT have, and why:
 *   - no autoplay. Movement the reader did not ask for competes with the words next to it, and it
 *     is the single most common reason a carousel gets called a carousel disapprovingly. Every
 *     slide here waits.
 *   - no dot pagination. With a scroll container the scrollbar already answers "where am I"; dots
 *     restate it in a control too small to hit.
 *   - no shadow. design-spec §4 — containment is `--elev-ring`, a 1px ring. `--elev-raised` is for
 *     overlays, and a slide is not an overlay.
 *
 * The two arrows are progressive enhancement: markup ships them hidden, the script reveals them
 * only once it can measure a track that actually overflows.
 */

defined('_JEXEC') or die;

/*
 * An ACM tmpl can be included more than once in one request, so every helper is guarded — an
 * unguarded second include fatals with "Cannot redeclare". Names are block-local.
 */
if (!function_exists('tracy_carousel_media')) {
    /**
     * A media field arrives as `path#joomlaImage://...`; everything after the hash is metadata for
     * the editor, not part of the URL.
     */
    function tracy_carousel_media($value)
    {
        $value = trim((string) $value);

        if ($value === '') {
            return '';
        }

        $hash = strpos($value, '#');

        return $hash === false ? $value : substr($value, 0, $hash);
    }
}

$eyebrow = trim((string) $helper->get('eyebrow'));
$heading = trim((string) $helper->get('heading'));
$intro   = trim((string) $helper->get('intro'));

$ground = (string) $helper->get('ground');

if (!in_array($ground, ['canvas', 'warm', 'gray'], true)) {
    $ground = 'canvas';
}

// The admin picks how many slides sit in view at desktop width; narrow screens always show fewer.
$perView = (int) $helper->get('per-view');

if (!in_array($perView, [2, 3, 4], true)) {
    $perView = 3;
}

$rows   = (int) $helper->getRows('slide');
$slides = [];

for ($i = 0; $i < $rows; $i++) {
    $title = trim((string) $helper->get('slide-title', $i));
    $text  = trim((string) $helper->get('slide-text', $i));

    if ($title === '' && $text === '') {
        continue;
    }

    $slides[] = [
        'image'     => tracy_carousel_media($helper->get('slide-image', $i)),
        'kicker'    => trim((string) $helper->get('slide-kicker', $i)),
        'title'     => $title,
        'text'      => $text,
        'link'      => trim((string) $helper->get('slide-link', $i)),
        'link_text' => trim((string) $helper->get('slide-link-text', $i)),
    ];
}

/*
 * A freshly published module has no rows yet. Seed the shape — text only — so the section reads as
 * designed in the admin preview instead of collapsing to an empty band. No image paths are seeded:
 * a path to a file that does not exist ships a broken image to the buyer's first screen.
 */
if (!$slides) {
    $slides = [
        ['image' => '', 'kicker' => 'Foundations', 'title' => 'One token file',
         'text' => 'Fifty-six named values decide colour, type, spacing, corners and depth.',
         'link' => '', 'link_text' => ''],
        ['image' => '', 'kicker' => 'Layout', 'title' => 'Three column shapes',
         'text' => 'Full width, sidebar left and sidebar right, chosen per page from the menu.',
         'link' => '', 'link_text' => ''],
        ['image' => '', 'kicker' => 'Content', 'title' => 'Blocks, not pages',
         'text' => 'Every section on this site is a block an editor can move, copy or remove.',
         'link' => '', 'link_text' => ''],
        ['image' => '', 'kicker' => 'Dark', 'title' => 'A remap, not a rewrite',
         'text' => 'The same components read the same names; only the values change.',
         'link' => '', 'link_text' => ''],
    ];
}

$blockId   = 'acm-carousel-' . (int) $module->id;
$headingId = $blockId . '-heading';
$trackId   = $blockId . '-track';
?>
<div class="ja-acm acm-carousel style-1 acm-carousel--<?php echo $ground; ?> acm-carousel--per-<?php echo $perView; ?>"
     id="<?php echo $blockId; ?>"
     <?php if ($heading !== '') : ?>aria-labelledby="<?php echo $headingId; ?>"<?php endif; ?>>
  <div class="container">

    <?php if ($eyebrow !== '' || $heading !== '' || $intro !== '') : ?>
      <div class="tracy-carousel__head">
        <div class="tracy-carousel__head-text">
          <?php if ($eyebrow !== '') : ?>
            <p class="tracy-carousel__eyebrow"><?php echo $eyebrow; ?></p>
          <?php endif; ?>
          <?php if ($heading !== '') : ?>
            <h2 class="tracy-carousel__heading" id="<?php echo $headingId; ?>"><?php echo $heading; ?></h2>
          <?php endif; ?>
          <?php if ($intro !== '') : ?>
            <p class="tracy-carousel__intro"><?php echo $intro; ?></p>
          <?php endif; ?>
        </div>

        <?php /* Hidden until the script confirms the track overflows — see the note at the top. */ ?>
        <div class="tracy-carousel__nav" data-tracy-carousel-nav hidden>
          <button type="button" class="tracy-carousel__step" data-tracy-carousel-prev
                  aria-controls="<?php echo $trackId; ?>" aria-label="Previous slides">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.5"
                    stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button type="button" class="tracy-carousel__step" data-tracy-carousel-next
                  aria-controls="<?php echo $trackId; ?>" aria-label="Next slides">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5"
                    stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    <?php endif; ?>

    <?php /*
      `tabindex="0"` and a group role make the track reachable and operable from the keyboard:
      a scroll container is only keyboard-scrollable once it can hold focus.
    */ ?>
    <ul class="tracy-carousel__track"
        id="<?php echo $trackId; ?>"
        data-tracy-carousel-track
        tabindex="0"
        role="group"
        aria-label="<?php echo $heading !== '' ? htmlspecialchars($heading, ENT_QUOTES, 'UTF-8') : 'Slides'; ?>">
      <?php foreach ($slides as $slide) : ?>
        <li class="tracy-carousel__slide">
          <?php if ($slide['image'] !== '') : ?>
            <div class="tracy-carousel__media">
              <img src="<?php echo $slide['image']; ?>" alt="" loading="lazy" decoding="async" />
            </div>
          <?php endif; ?>

          <div class="tracy-carousel__body">
            <?php if ($slide['kicker'] !== '') : ?>
              <p class="tracy-carousel__kicker"><?php echo $slide['kicker']; ?></p>
            <?php endif; ?>
            <?php if ($slide['title'] !== '') : ?>
              <h3 class="tracy-carousel__title"><?php echo $slide['title']; ?></h3>
            <?php endif; ?>
            <?php if ($slide['text'] !== '') : ?>
              <p class="tracy-carousel__text"><?php echo $slide['text']; ?></p>
            <?php endif; ?>
            <?php if ($slide['link'] !== '' && $slide['link_text'] !== '') : ?>
              <a class="tracy-carousel__link" href="<?php echo $slide['link']; ?>">
                <?php echo $slide['link_text']; ?>
              </a>
            <?php endif; ?>
          </div>
        </li>
      <?php endforeach; ?>
    </ul>

  </div>
</div>

<script>
/*
 * Enhancement only. Everything above works without this: the track scrolls, snaps and takes the
 * arrow keys on its own. This adds the two step buttons and keeps them honest — hidden when there
 * is nothing to scroll, disabled at each end.
 *
 * Guarded so a second carousel on the same page does not register the behaviour twice.
 */
(function () {
  if (window.tracyCarouselReady) { return; }
  window.tracyCarouselReady = true;

  var step = function (track, direction) {
    var slide = track.querySelector('.tracy-carousel__slide');
    var by = slide ? slide.getBoundingClientRect().width + 24 : track.clientWidth * 0.8;
    track.scrollBy({ left: by * direction, behavior: 'smooth' });
  };

  var sync = function (root) {
    var track = root.querySelector('[data-tracy-carousel-track]');
    var nav = root.querySelector('[data-tracy-carousel-nav]');
    if (!track || !nav) { return; }

    var overflows = track.scrollWidth - track.clientWidth > 4;
    nav.hidden = !overflows;
    if (!overflows) { return; }

    var atStart = track.scrollLeft <= 2;
    var atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    var prev = nav.querySelector('[data-tracy-carousel-prev]');
    var next = nav.querySelector('[data-tracy-carousel-next]');
    if (prev) { prev.disabled = atStart; }
    if (next) { next.disabled = atEnd; }
  };

  var wire = function (root) {
    var track = root.querySelector('[data-tracy-carousel-track]');
    var nav = root.querySelector('[data-tracy-carousel-nav]');
    if (!track || !nav || root.dataset.tracyCarouselWired) { return; }
    root.dataset.tracyCarouselWired = '1';

    var prev = nav.querySelector('[data-tracy-carousel-prev]');
    var next = nav.querySelector('[data-tracy-carousel-next]');
    if (prev) { prev.addEventListener('click', function () { step(track, -1); }); }
    if (next) { next.addEventListener('click', function () { step(track, 1); }); }

    track.addEventListener('scroll', function () { sync(root); }, { passive: true });
    window.addEventListener('resize', function () { sync(root); });
    sync(root);
  };

  var start = function () {
    var list = document.querySelectorAll('.acm-carousel');
    for (var i = 0; i < list.length; i++) { wire(list[i]); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
</script>
