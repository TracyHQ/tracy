<?php
/**
 * Tracy — ACM block `tabs`, style 1.
 *
 * One subject, several faces: the reader picks which one to read. Built on the WAI-ARIA tabs
 * pattern — `role="tablist"`, roving `tabindex`, arrow keys — because a row of buttons that swaps
 * content is exactly what that pattern names, and reimplementing it loosely is how a component
 * becomes unreachable from the keyboard.
 *
 * What this block deliberately does NOT have, and why:
 *   - no tab "chrome". The selected tab is marked by a 2px rule underneath it and full ink; the
 *     others are `--muted`. design-spec §4 asks for contrast-led separation, not boxed tabs.
 *   - no animated panel transition. The panel is the answer to a click; sliding it in delays the
 *     answer.
 *
 * Without JavaScript every panel renders and is readable in order — the script hides the ones that
 * are not selected, so a failed script leaves a long page rather than an empty one.
 */

defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

if (!function_exists('tracy_tabs_media')) {
    function tracy_tabs_media($value)
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

$ground = (string) $helper->get('ground');

if (!in_array($ground, ['canvas', 'warm', 'gray'], true)) {
    $ground = 'canvas';
}

$rows = (int) $helper->getRows('tab');
$tabs = [];

for ($i = 0; $i < $rows; $i++) {
    $label = trim((string) $helper->get('tab-label', $i));
    $body  = trim((string) $helper->get('tab-body', $i));

    if ($label === '') {
        continue;
    }

    $tabs[] = [
        'label' => $label,
        'title' => trim((string) $helper->get('tab-title', $i)),
        'body'  => $body,
        'image' => tracy_tabs_media($helper->get('tab-image', $i)),
    ];
}

if (!$tabs) return;


$blockId   = 'acm-tabs-' . (int) $module->id;
$headingId = $blockId . '-heading';
?>
<div class="ja-acm acm-tabs style-1 acm-tabs--<?php echo $ground; ?>"
     id="<?php echo $blockId; ?>"
     <?php if ($heading !== '') : ?>aria-labelledby="<?php echo $headingId; ?>"<?php endif; ?>>
  <div class="container">

    <?php if ($eyebrow !== '' || $heading !== '') : ?>
      <div class="tracy-tabs__head">
        <?php if ($eyebrow !== '') : ?>
          <p class="tracy-tabs__eyebrow"><?php echo $eyebrow; ?></p>
        <?php endif; ?>
        <?php if ($heading !== '') : ?>
          <h2 class="tracy-tabs__heading" id="<?php echo $headingId; ?>"><?php echo $heading; ?></h2>
        <?php endif; ?>
      </div>
    <?php endif; ?>

    <div class="tracy-tabs__list" role="tablist" data-tracy-tabs
         <?php if ($heading !== '') : ?>aria-labelledby="<?php echo $headingId; ?>"<?php endif; ?>>
      <?php foreach ($tabs as $i => $tab) : ?>
        <button type="button"
                class="tracy-tabs__tab"
                role="tab"
                id="<?php echo $blockId; ?>-tab-<?php echo $i; ?>"
                aria-controls="<?php echo $blockId; ?>-panel-<?php echo $i; ?>"
                aria-selected="<?php echo $i === 0 ? 'true' : 'false'; ?>"
                tabindex="<?php echo $i === 0 ? '0' : '-1'; ?>">
          <?php echo $tab['label']; ?>
        </button>
      <?php endforeach; ?>
    </div>

    <?php foreach ($tabs as $i => $tab) : ?>
      <?php /*
        Every panel ships visible. The script hides the unselected ones on load, so a page whose
        JavaScript never arrives is long rather than blank.
      */ ?>
      <div class="tracy-tabs__panel"
           role="tabpanel"
           id="<?php echo $blockId; ?>-panel-<?php echo $i; ?>"
           aria-labelledby="<?php echo $blockId; ?>-tab-<?php echo $i; ?>"
           tabindex="0">
        <div class="tracy-tabs__panel-inner<?php echo $tab['image'] !== '' ? ' tracy-tabs__panel-inner--media' : ''; ?>">
          <div class="tracy-tabs__panel-text">
            <?php if ($tab['title'] !== '') : ?>
              <h3 class="tracy-tabs__title"><?php echo $tab['title']; ?></h3>
            <?php endif; ?>
            <?php if ($tab['body'] !== '') : ?>
              <div class="tracy-tabs__body"><?php echo $tab['body']; ?></div>
            <?php endif; ?>
          </div>
          <?php if ($tab['image'] !== '') : ?>
            <div class="tracy-tabs__media">
              <img src="<?php echo $tab['image']; ?>" alt="" loading="lazy" decoding="async" />
            </div>
          <?php endif; ?>
        </div>
      </div>
    <?php endforeach; ?>

  </div>
</div>

<script>
/*
 * The WAI-ARIA tabs pattern, in the smallest form that is still correct: one tab in the tab order,
 * arrows move between them, Home and End jump to the ends, and selection follows focus.
 * Guarded so a second tabs block on the page does not register the behaviour twice.
 */
(function () {
  if (window.tracyTabsReady) { return; }
  window.tracyTabsReady = true;

  var select = function (root, tabs, panels, index) {
    for (var i = 0; i < tabs.length; i++) {
      var on = i === index;
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[i].tabIndex = on ? 0 : -1;
      if (panels[i]) { panels[i].hidden = !on; }
    }
  };

  var wire = function (root) {
    var list = root.querySelector('[data-tracy-tabs]');
    if (!list || root.dataset.tracyTabsWired) { return; }
    root.dataset.tracyTabsWired = '1';

    var tabs = list.querySelectorAll('[role="tab"]');
    var panels = root.querySelectorAll('[role="tabpanel"]');
    if (!tabs.length) { return; }

    select(root, tabs, panels, 0);

    var move = function (index) {
      var next = (index + tabs.length) % tabs.length;
      select(root, tabs, panels, next);
      tabs[next].focus();
    };

    for (var i = 0; i < tabs.length; i++) {
      (function (index) {
        tabs[index].addEventListener('click', function () { select(root, tabs, panels, index); });
        tabs[index].addEventListener('keydown', function (event) {
          var key = event.key;
          if (key === 'ArrowRight' || key === 'ArrowDown') { event.preventDefault(); move(index + 1); }
          else if (key === 'ArrowLeft' || key === 'ArrowUp') { event.preventDefault(); move(index - 1); }
          else if (key === 'Home') { event.preventDefault(); move(0); }
          else if (key === 'End') { event.preventDefault(); move(tabs.length - 1); }
        });
      })(i);
    }
  };

  var start = function () {
    var list = document.querySelectorAll('.acm-tabs');
    for (var i = 0; i < list.length; i++) { wire(list[i]); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
</script>
