<?php
/**
 * Tracy — ACM block `clients`, style 1.
 *
 * A quiet row of partner marks: muted by default, full opacity on hover. Optional eyebrow above.
 * Zero accent uses — this block is supporting material, and the design-spec caps a screen at two
 * visible accent uses that a hero and a CTA have better claim on.
 *
 * Every mark is a `media` field the owner swaps in the admin, never a hand-drawn SVG
 * (editability-standards §4). The <img> carries its intrinsic width/height from getimagesize() so
 * the row does not reflow while logos load, and carries no border and no box-shadow.
 */

defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

use Joomla\CMS\Helper\MediaHelper;

if (!function_exists('tracy_acm_media_src')) {
    /**
     * Strip the `#joomlaImage://...` adapter suffix a Joomla 4/5 media field appends.
     */
    function tracy_acm_media_src($value)
    {
        $value = trim((string) $value);

        if ($value === '') {
            return '';
        }

        if (class_exists('Joomla\\CMS\\Helper\\MediaHelper')) {
            $clean = MediaHelper::getCleanMediaFieldValue($value);

            if ($clean) {
                return $clean;
            }
        }

        return explode('#', $value, 2)[0];
    }
}

if (!function_exists('tracy_acm_media_size')) {
    /**
     * Intrinsic [width, height] of a site-relative image, or [0, 0] when it cannot be measured
     * (external URL, missing file). Callers omit the attributes rather than guess.
     */
    function tracy_acm_media_size($src)
    {
        if ($src === '' || preg_match('#^(https?:)?//#i', $src) || strpos($src, 'data:') === 0) {
            return [0, 0];
        }

        $path = JPATH_SITE . '/' . ltrim(explode('?', $src, 2)[0], '/');

        if (!is_file($path)) {
            return [0, 0];
        }

        $size = @getimagesize($path);

        if (!$size) {
            return [0, 0];
        }

        return [(int) $size[0], (int) $size[1]];
    }
}

$eyebrow = trim((string) $helper->get('eyebrow'));

$rows  = (int) $helper->getRows('mark-name');
$marks = [];

for ($i = 0; $i < $rows; $i++) {
    $name  = trim((string) $helper->get('mark-name', $i));
    $image = tracy_acm_media_src($helper->get('mark-image', $i));
    $link  = trim((string) $helper->get('mark-link', $i));

    if ($name === '' && $image === '') {
        continue;
    }

    $marks[] = ['name' => $name, 'image' => $image, 'link' => $link];
}

// Empty repeatable data does not create public demo claims.
if (!$marks) return;


$blockId = 'acm-clients-' . (int) $module->id;
?>
<div class="ja-acm acm-clients style-1" id="<?php echo $blockId; ?>">
  <div class="container">
    <?php if ($eyebrow !== '') : ?>
      <p class="tracy-clients__eyebrow"><?php echo $eyebrow; ?></p>
    <?php endif; ?>

    <div class="tracy-clients">
      <?php foreach ($marks as $mark) : ?>
        <?php
        $alt = htmlspecialchars(strip_tags($mark['name']), ENT_QUOTES, 'UTF-8');

        if ($mark['image'] !== '') {
            list($width, $height) = tracy_acm_media_size($mark['image']);

            $inner = '<img class="' . ($alt !== '' ? 'tracy-clients__light-image' : '') . '" src="' . htmlspecialchars($mark['image'], ENT_QUOTES, 'UTF-8') . '"'
                . ' alt="' . $alt . '"'
                . ($width && $height ? ' width="' . $width . '" height="' . $height . '"' : '')
                . ' loading="lazy" decoding="async" />'
                . '<span class="tracy-clients__wordmark tracy-clients__dark-name">' . $alt . '</span>';
        } else {
            $inner = '<span class="tracy-clients__wordmark">' . $mark['name'] . '</span>';
        }

        if ($mark['link'] !== '') {
            echo '<a class="tracy-clients__mark" href="' . htmlspecialchars($mark['link'], ENT_QUOTES, 'UTF-8') . '">'
                . $inner . '</a>';
        } else {
            echo '<span class="tracy-clients__mark">' . $inner . '</span>';
        }
        ?>
      <?php endforeach; ?>
    </div>
  </div>
</div>
