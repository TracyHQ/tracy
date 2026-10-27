<?php
/**
 * Tracy — ACM block `story-chapter`, shared renderer.
 *
 * THE SIGNATURE BLOCK OF THIS TEMPLATE (catalog.md §6.4). DESIGN.md §4 "Other Distinctive
 * Components" names it: "Environment Story Panels: narrative chapters that blend editorial
 * typography with cinematic product/environment visuals."
 *
 * Anatomy, fixed by design-spec.md §6 — four things and nothing else:
 *   1. one --text-2xl statement line at --tracking-display
 *   2. one full-bleed `media`-field image
 *   3. one muted supporting line
 *   4. one capsule link
 * Resist adding a fifth. The block's power is that a stack of them alternates band surfaces and
 * reads as chapters; every extra ornament costs that.
 *
 * WHY THIS FILE SITS AT THE BLOCK ROOT AND NOT IN tmpl/:
 * mod_ja_acm's admin field enumerates EVERY .php in `tmpl/` as a selectable style
 * (modules/mod_ja_acm/admin/fields/jaacm.php — `Folder::files($path . $type . '/tmpl', '.php')`).
 * A shared partial dropped in there would appear in the style picker as a broken third style. At
 * the block root it is invisible to that scan, and style-1/style-2 stay one `include` apart
 * instead of two copies that drift.
 *
 * Style 1 renders media RIGHT, style 2 renders media LEFT — so a stack alternates without the
 * owner touching CSS. The flip is `.tracy-chapter--flip` from scss/_base.scss.
 *
 * Inherited scope (mod_ja_acm.php includes the style file inside its own function-less scope):
 *   $helper  ModJAACMHelper   $module  the module row      $chapterFlip  bool, set by the caller
 */

defined('_JEXEC') or die;

use Joomla\CMS\Helper\MediaHelper;

// Set by style-1.php / style-2.php before the include. Default to the style-1 orientation so a
// direct include can never render an undefined layout.
$chapterFlip = isset($chapterFlip) ? (bool) $chapterFlip : false;
$chapterStyle = isset($chapterStyle) ? (int) $chapterStyle : 1;

$statement = trim((string) $helper->get('statement'));
$headingTag = $helper->get('heading-level') === 'h1' ? 'h1' : 'h2';
$support   = trim((string) $helper->get('support'));
$linkText  = trim((string) $helper->get('link-text'));
$linkUrl   = trim((string) $helper->get('link-url'));
$mediaAlt  = trim((string) $helper->get('media-alt'));

// The admin may spend one of the screen's two accent uses here deliberately; the DEFAULT does not.
// design-spec.md §2: at most two visible uses of the blue accent per screen, and the home page
// already spends one on the hero CTA and one on the features eyebrow.
$linkStyle = $helper->get('link-style') === 'primary' ? 'primary' : 'secondary';

// A `media` field value carries Joomla's adapter suffix (`…jpg#joomlaImage://local-images/…`).
// getCleanMediaFieldValue strips it; rendering the raw value yields a 404 image.
$mediaRaw = trim((string) $helper->get('media'));
$media    = $mediaRaw !== '' ? MediaHelper::getCleanMediaFieldValue($mediaRaw) : '';

// Intrinsic width/height on the <img> so the chapter reserves its box before the image decodes —
// without them a stack of chapters shifts the whole page as each one loads. Read from the file
// itself rather than asking the owner for numbers they do not have.
$mediaWidth = $mediaHeight = 0;

if ($media !== '') {
    $mediaPath = JPATH_ROOT . '/' . ltrim(urldecode(preg_replace('/[?#].*$/', '', $media)), '/');

    if (is_file($mediaPath)) {
        $size = @getimagesize($mediaPath);

        if (is_array($size)) {
            $mediaWidth  = (int) $size[0];
            $mediaHeight = (int) $size[1];
        }
    }
}

// A freshly published module has no values yet. Seed the SHAPE (not an image — a path to a file
// that does not exist renders a broken icon, which is worse than an honest one-column chapter) so
// the owner sees the design in the admin preview instead of an empty band.
if ($statement === '' && $support === '' && $media === '') {
    $statement = 'The interface engineered to disappear.';
    $support   = 'Fifty-six tokens carry the whole system: a pale-gray feature ladder over white, '
        . 'one Base Action Blue, and SF Pro at compressed tracking.';
    $linkText  = $linkText !== '' ? $linkText : 'Read the chapter';
    $linkUrl   = $linkUrl !== '' ? $linkUrl : '#';
}

$blockId     = 'acm-story-chapter-' . (int) $module->id;
$statementId = $blockId . '-statement';
$hasMedia    = $media !== '';
?>
<div class="ja-acm acm-story-chapter style-<?php echo $chapterStyle; ?><?php echo $hasMedia ? '' : ' acm-story-chapter--no-media'; ?>"
     id="<?php echo $blockId; ?>"
     <?php if ($statement !== '') : ?>aria-labelledby="<?php echo $statementId; ?>"<?php endif; ?>>
  <div class="container">
    <div class="tracy-chapter<?php echo $chapterFlip ? ' tracy-chapter--flip' : ''; ?>">

      <div class="tracy-chapter__text">
        <?php if ($statement !== '') : ?>
          <<?php echo $headingTag; ?> class="tracy-chapter__statement" id="<?php echo $statementId; ?>"><?php echo $statement; ?></<?php echo $headingTag; ?>>
        <?php endif; ?>

        <?php if ($support !== '') : ?>
          <p class="tracy-chapter__support"><?php echo $support; ?></p>
        <?php endif; ?>

        <?php if ($linkText !== '') : ?>
          <p class="tracy-chapter__action">
            <a class="tracy-btn tracy-btn--<?php echo $linkStyle; ?> tracy-chapter__link"
               href="<?php echo htmlspecialchars($linkUrl !== '' ? $linkUrl : '#', ENT_QUOTES, 'UTF-8'); ?>">
              <?php echo htmlspecialchars($linkText, ENT_QUOTES, 'UTF-8'); ?>
              <svg class="tracy-chapter__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </p>
        <?php endif; ?>
      </div>

      <?php if ($hasMedia) : ?>
        <figure class="tracy-chapter__media">
          <img src="<?php echo htmlspecialchars($media, ENT_QUOTES, 'UTF-8'); ?>"
               alt="<?php echo htmlspecialchars($mediaAlt, ENT_QUOTES, 'UTF-8'); ?>"
               <?php if ($mediaWidth && $mediaHeight) : ?>width="<?php echo $mediaWidth; ?>" height="<?php echo $mediaHeight; ?>"<?php endif; ?>
               loading="lazy" decoding="async">
        </figure>
      <?php endif; ?>

    </div>
  </div>
</div>
