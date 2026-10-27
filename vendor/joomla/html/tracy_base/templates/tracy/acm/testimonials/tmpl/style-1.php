<?php
/**
 * Tracy — ACM block `testimonials`, style 1.
 *
 * Quiet quote rows: the quote at --text-lg, the attribution name and role at --text-sm on --meta,
 * and an OPTIONAL circular avatar (DESIGN.md §5 "50%: circular media and selection controls").
 *
 * What this block deliberately does NOT have, and why:
 *   - no quotation-mark ornament. DESIGN.md §7 "keep chrome understated"; a giant glyph is
 *     decoration competing with the sentence it decorates.
 *   - no card shadow. design-spec §4 — containment is var(--elev-ring), a 1px ring; --elev-raised
 *     is reserved for overlays.
 *   - no accent. design-spec §2 caps a screen at two visible accent uses, and this block is
 *     supporting material, so it spends none of them: the eyebrow is --meta, not --accent.
 *
 * Every string, image and count below is an admin field. Rows come from the `quotes` fieldset
 * (multiple="1"), so the owner adds and removes testimonials in the module editor with no code.
 */

defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

use Joomla\CMS\Helper\MediaHelper;

/*
 * An ACM tmpl can be included more than once in one request (two testimonials modules, or the same
 * module rendered into two positions), so every helper is guarded — an unguarded second include
 * fatals with "Cannot redeclare". Names are block-local so a future edit here can never silently
 * lose to an identically named helper in another block that happened to render first.
 */
if (!function_exists('tracy_tm_media')) {
    /**
     * Resolve a `media` field value to a plain, renderable path.
     * The picker stores "images/x.jpg#joomlaImage://local-images/x.jpg?width=…"; the adapter
     * fragment must come off before the value reaches src.
     */
    function tracy_tm_media($value)
    {
        $value = trim((string) $value);

        if ($value === '') {
            return '';
        }

        if (class_exists('Joomla\\CMS\\Helper\\MediaHelper')) {
            $clean = MediaHelper::getCleanMediaFieldValue($value);

            return $clean !== '' ? $clean : $value;
        }

        return $value;
    }
}

if (!function_exists('tracy_tm_size')) {
    /**
     * Intrinsic pixel size of a local image, for the width/height attributes that stop the row
     * reflowing while the avatar loads. Returns [null, null] for a remote or missing file rather
     * than guessing — a wrong intrinsic ratio is worse than none.
     */
    function tracy_tm_size($src)
    {
        if ($src === '' || preg_match('#^(?:[a-z][a-z0-9+.-]*:)?//#i', $src)) {
            return [null, null];
        }

        $relative = ltrim((string) parse_url($src, PHP_URL_PATH), '/');
        $path     = JPATH_ROOT . '/' . rawurldecode($relative);

        if ($relative === '' || !is_file($path)) {
            return [null, null];
        }

        $info = @getimagesize($path);

        return $info ? [(int) $info[0], (int) $info[1]] : [null, null];
    }
}

if (!function_exists('tracy_tm_initials')) {
    /**
     * The media-less fallback. An empty avatar slot would leave a hole in the row, so the ring
     * still draws and carries the person's initials — no image request, no broken-image glyph.
     */
    function tracy_tm_initials($name)
    {
        $initials = '';

        foreach (preg_split('/\s+/', trim(strip_tags((string) $name))) as $word) {
            if ($word !== '') {
                $initials .= mb_substr($word, 0, 1);
            }
        }

        return mb_strtoupper(mb_substr($initials, 0, 2));
    }
}

$eyebrow = trim((string) $helper->get('eyebrow'));
$heading = trim((string) $helper->get('heading'));

// The admin picks 2 or 3; anything else falls back to the 3-across default.
$columns = (int) $helper->get('columns');

if ($columns !== 2) {
    $columns = 3;
}

$rows   = (int) $helper->getRows('quote');
$quotes = [];

for ($i = 0; $i < $rows; $i++) {
    $quote = trim((string) $helper->get('quote', $i));
    $name  = trim((string) $helper->get('quote-name', $i));
    $role  = trim((string) $helper->get('quote-role', $i));

    if ($quote === '' && $name === '') {
        continue;
    }

    $quotes[] = [
        'quote'  => $quote,
        'name'   => $name,
        'role'   => $role,
        'avatar' => tracy_tm_media($helper->get('quote-avatar', $i)),
    ];
}

/* Empty repeatable data does not create public demo claims. */
if (!$quotes) return;


$blockId   = 'acm-testimonials-' . (int) $module->id;
$headingId = $blockId . '-heading';
?>
<div class="ja-acm acm-testimonials style-1 acm-testimonials--cols-<?php echo $columns; ?>"
     id="<?php echo $blockId; ?>"
     <?php if ($heading !== '') : ?>aria-labelledby="<?php echo $headingId; ?>"<?php endif; ?>>
  <div class="container">
    <?php if ($eyebrow !== '' || $heading !== '') : ?>
      <div class="tracy-quotes__head">
        <?php if ($eyebrow !== '') : ?>
          <p class="tracy-quotes__eyebrow"><?php echo $eyebrow; ?></p>
        <?php endif; ?>
        <?php if ($heading !== '') : ?>
          <h2 class="tracy-quotes__heading" id="<?php echo $headingId; ?>"><?php echo $heading; ?></h2>
        <?php endif; ?>
      </div>
    <?php endif; ?>

    <div class="tracy-quotes">
      <?php foreach ($quotes as $item) :
          $alt = htmlspecialchars(strip_tags($item['name']), ENT_QUOTES, 'UTF-8');
          list($avatarW, $avatarH) = tracy_tm_size($item['avatar']);
      ?>
        <figure class="tracy-quote">
          <?php if ($item['quote'] !== '') : ?>
            <blockquote class="tracy-quote__text"><?php echo $item['quote']; ?></blockquote>
          <?php endif; ?>

          <?php if ($item['name'] !== '' || $item['role'] !== '') : ?>
            <figcaption class="tracy-quote__author">
              <?php if ($item['avatar'] !== '') : ?>
                <img class="tracy-quote__avatar"
                     src="<?php echo htmlspecialchars($item['avatar'], ENT_QUOTES, 'UTF-8'); ?>"
                     alt="<?php echo $alt; ?>"
                     loading="lazy"
                     decoding="async"
                     <?php if ($avatarW && $avatarH) : ?>width="<?php echo $avatarW; ?>" height="<?php echo $avatarH; ?>"<?php endif; ?> />
              <?php elseif ($item['name'] !== '') : ?>
                <span class="tracy-quote__avatar tracy-quote__avatar--initials" aria-hidden="true"><?php
                    echo htmlspecialchars(tracy_tm_initials($item['name']), ENT_QUOTES, 'UTF-8');
                ?></span>
              <?php endif; ?>

              <span class="tracy-quote__who">
                <?php if ($item['name'] !== '') : ?>
                  <span class="tracy-quote__name"><?php echo $item['name']; ?></span>
                <?php endif; ?>
                <?php if ($item['role'] !== '') : ?>
                  <span class="tracy-quote__role"><?php echo $item['role']; ?></span>
                <?php endif; ?>
              </span>
            </figcaption>
          <?php endif; ?>
        </figure>
      <?php endforeach; ?>
    </div>
  </div>
</div>
