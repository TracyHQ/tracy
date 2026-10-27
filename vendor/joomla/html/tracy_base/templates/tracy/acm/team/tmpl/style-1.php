<?php
/**
 * Tracy — ACM block `team`, style 1.
 *
 * A calm grid of member rows: circular portrait (DESIGN.md §5 "50%: circular media and selection
 * controls"), name, role, an OPTIONAL one-line bio and an OPTIONAL link.
 *
 * What this block deliberately does NOT have, and why:
 *   - no card shadow, no hover lift. design-spec §4 — containment is var(--elev-ring), a 1px ring;
 *     --elev-raised is reserved for overlays.
 *   - no accent. design-spec §2 caps a screen at two visible accent uses and this block is
 *     supporting material, so the eyebrow is --meta and the member link is --fg with an underline
 *     on hover, not the blue link tone. Both would otherwise spend budget the page owes its hero.
 *   - no social-icon row. Icons per member are a second vocabulary the owner cannot edit; one
 *     labelled link per member is editable and enough.
 *
 * The link LABEL is a single section-level field, not a per-row one: the same word ("Profile")
 * reads as a column in a grid, and asking the owner to retype it on every member is how the grid
 * ends up with five different words for the same action.
 *
 * Every string, image and count below is an admin field. Rows come from the `members` fieldset
 * (multiple="1"), so the owner adds and removes people in the module editor with no code.
 */

defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

use Joomla\CMS\Helper\MediaHelper;

/*
 * An ACM tmpl can be included more than once in one request (two team modules, or the same module
 * rendered into two positions), so every helper is guarded — an unguarded second include fatals
 * with "Cannot redeclare". Names are block-local so a future edit here can never silently lose to
 * an identically named helper in another block that happened to render first.
 */
if (!function_exists('tracy_team_media')) {
    /**
     * Resolve a `media` field value to a plain, renderable path.
     * The picker stores "images/x.jpg#joomlaImage://local-images/x.jpg?width=…"; the adapter
     * fragment must come off before the value reaches src.
     */
    function tracy_team_media($value)
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

if (!function_exists('tracy_team_size')) {
    /**
     * Intrinsic pixel size of a local image, for the width/height attributes that stop the grid
     * reflowing while portraits load. Returns [null, null] for a remote or missing file rather
     * than guessing — a wrong intrinsic ratio is worse than none.
     */
    function tracy_team_size($src)
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

if (!function_exists('tracy_team_initials')) {
    /**
     * The media-less fallback. An empty portrait slot would punch a hole in the grid, so the circle
     * still draws and carries the person's initials — no image request, no broken-image glyph.
     */
    function tracy_team_initials($name)
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

$eyebrow   = trim((string) $helper->get('eyebrow'));
$heading   = trim((string) $helper->get('heading'));
$linkLabel = trim((string) $helper->get('link-label'));

// The admin picks 3 or 4; anything else falls back to the 4-across default.
$columns = (int) $helper->get('columns');

if ($columns !== 3) {
    $columns = 4;
}

$rows    = (int) $helper->getRows('member-name');
$members = [];

for ($i = 0; $i < $rows; $i++) {
    $name = trim((string) $helper->get('member-name', $i));
    $role = trim((string) $helper->get('member-role', $i));

    if ($name === '' && $role === '') {
        continue;
    }

    $members[] = [
        'name'     => $name,
        'role'     => $role,
        'bio'      => trim((string) $helper->get('member-bio', $i)),
        'link'     => trim((string) $helper->get('member-link', $i)),
        'portrait' => tracy_team_media($helper->get('member-portrait', $i)),
    ];
}

/* Empty repeatable data does not create public demo claims. */
if (!$members) return;


$blockId   = 'acm-team-' . (int) $module->id;
$headingId = $blockId . '-heading';
?>
<div class="ja-acm acm-team style-1 acm-team--cols-<?php echo $columns; ?>"
     id="<?php echo $blockId; ?>"
     <?php if ($heading !== '') : ?>aria-labelledby="<?php echo $headingId; ?>"<?php endif; ?>>
  <div class="container">
    <?php if ($eyebrow !== '' || $heading !== '') : ?>
      <div class="tracy-team__head">
        <?php if ($eyebrow !== '') : ?>
          <p class="tracy-team__eyebrow"><?php echo $eyebrow; ?></p>
        <?php endif; ?>
        <?php if ($heading !== '') : ?>
          <h2 class="tracy-team__heading" id="<?php echo $headingId; ?>"><?php echo $heading; ?></h2>
        <?php endif; ?>
      </div>
    <?php endif; ?>

    <ul class="tracy-team">
      <?php foreach ($members as $member) :
          $alt = htmlspecialchars(strip_tags($member['name']), ENT_QUOTES, 'UTF-8');
          list($portraitW, $portraitH) = tracy_team_size($member['portrait']);
      ?>
        <li class="tracy-member">
          <?php if ($member['portrait'] !== '') : ?>
            <img class="tracy-member__portrait"
                 src="<?php echo htmlspecialchars($member['portrait'], ENT_QUOTES, 'UTF-8'); ?>"
                 alt="<?php echo $alt; ?>"
                 loading="lazy"
                 decoding="async"
                 <?php if ($portraitW && $portraitH) : ?>width="<?php echo $portraitW; ?>" height="<?php echo $portraitH; ?>"<?php endif; ?> />
          <?php elseif ($member['name'] !== '') : ?>
            <span class="tracy-member__portrait tracy-member__portrait--initials" aria-hidden="true"><?php
                echo htmlspecialchars(tracy_team_initials($member['name']), ENT_QUOTES, 'UTF-8');
            ?></span>
          <?php endif; ?>

          <?php if ($member['name'] !== '') : ?>
            <h3 class="tracy-member__name"><?php echo $member['name']; ?></h3>
          <?php endif; ?>

          <?php if ($member['role'] !== '') : ?>
            <p class="tracy-member__role"><?php echo $member['role']; ?></p>
          <?php endif; ?>

          <?php if ($member['bio'] !== '') : ?>
            <p class="tracy-member__bio"><?php echo $member['bio']; ?></p>
          <?php endif; ?>

          <?php if ($member['link'] !== '' && $linkLabel !== '') : ?>
            <a class="tracy-member__link" href="<?php echo htmlspecialchars($member['link'], ENT_QUOTES, 'UTF-8'); ?>">
              <?php echo $linkLabel; ?>
              <?php if ($alt !== '') : ?><span class="tracy-member__link-who"> — <?php echo $alt; ?></span><?php endif; ?>
            </a>
          <?php endif; ?>
        </li>
      <?php endforeach; ?>
    </ul>
  </div>
</div>
