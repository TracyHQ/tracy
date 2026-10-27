<?php
/**
 * Tracy — ACM block `marketing-samples`, style 1.
 *
 * The Marketing samples page used to be one article with a template layout override: every word on
 * it — the heading, the lead, each tab's title and blurb, the preview note — lived in code the site
 * owner cannot reach. That is the editability rule this block exists to satisfy. The page is now a
 * module the owner edits in Module Manager, one field per string.
 *
 * The artifact documents themselves stay build output. They are generated from the site content
 * contract and downloaded as standalone files; turning their several hundred slots into admin
 * fields would give the same sentence two owners and no way to say which one is current.
 *
 * The sample list is rendered into the markup, not fetched from `manifest.json`, so an edit made in
 * the admin is what the page shows. The manifest still names the files the viewer loads.
 */

defined('_JEXEC') or die;

use Joomla\CMS\Uri\Uri;

require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

$escape = fn($value) => htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');

$eyebrow = trim((string) $helper->get('eyebrow'));
$heading = trim((string) $helper->get('heading'));
$lead    = trim((string) $helper->get('lead'));
$note    = trim((string) $helper->get('note'));

$base = trim((string) $helper->get('base'));
$base = Uri::root(true) . '/' . ltrim($base === '' ? 'media/tracy-marketing/' : $base, '/');

$appearanceLabel = trim((string) $helper->get('appearance-label')) ?: 'Appearance';
$lightLabel      = trim((string) $helper->get('light-label')) ?: 'Light';
$darkLabel       = trim((string) $helper->get('dark-label')) ?: 'Dark';
$openLabel       = trim((string) $helper->get('open-label')) ?: 'Open full page';
$downloadLabel   = trim((string) $helper->get('download-label')) ?: 'Download HTML';

$samples = [];
for ($i = 0, $rows = (int) $helper->getRows('sample-key'); $i < $rows; $i++) {
    $key = preg_replace('/[^a-z0-9-]/', '', strtolower(trim((string) $helper->get('sample-key', $i))));
    if ($key === '') continue;
    $samples[] = [
        'key' => $key,
        'title' => trim((string) $helper->get('sample-title', $i)) ?: ucfirst($key),
        'description' => trim((string) $helper->get('sample-description', $i)),
    ];
}
// An empty repeatable would render a viewer with no document to show; say so instead of drawing a
// broken frame.
if (!$samples) return;

$default = $base . $samples[0]['key'] . '-light.html';

// ACM templates are included without a view object, so the document comes from the application.
$wa = Joomla\CMS\Factory::getApplication()->getDocument()->getWebAssetManager();
$wa->registerAndUseStyle('tracy.marketing', Uri::root() . 'media/tracy-marketing/samples.css');
$wa->registerAndUseScript('tracy.marketing', Uri::root() . 'media/tracy-marketing/samples.js', [], ['type' => 'module']);
?>
<div class="ja-acm acm-marketing-samples style-1">
  <section class="tracy-marketing" data-sample-base="<?php echo $escape($base); ?>">
    <?php /* Not a <header>: the template's typography and the design contract's coverage both
             exclude `header *` to skip the site chrome, and a page intro wrapped in <header> is
             swallowed by that exclusion — it renders unstyled and is measured by nothing. */ ?>
    <?php if ($eyebrow !== '' || $heading !== '' || $lead !== '') : ?>
      <div class="tracy-marketing__intro">
        <?php if ($eyebrow !== '') : ?><p class="tracy-marketing__eyebrow"><?php echo $escape($eyebrow); ?></p><?php endif; ?>
        <?php if ($heading !== '') : ?><h1><?php echo $escape($heading); ?></h1><?php endif; ?>
        <?php if ($lead !== '') : ?><p><?php echo $escape($lead); ?></p><?php endif; ?>
      </div>
    <?php endif; ?>

    <nav class="tracy-marketing__tabs" aria-label="<?php echo $escape($heading !== '' ? $heading : 'Marketing samples'); ?>">
      <?php foreach ($samples as $sample) : ?>
        <a href="#<?php echo $escape($sample['key']); ?>"
           data-sample="<?php echo $escape($sample['key']); ?>"
           data-sample-description="<?php echo $escape($sample['description']); ?>"><?php echo $escape($sample['title']); ?></a>
      <?php endforeach; ?>
    </nav>

    <div class="tracy-marketing__toolbar">
      <p data-sample-description><?php echo $escape($samples[0]['description']); ?></p>
      <div class="tracy-marketing__actions">
        <label><?php echo $escape($appearanceLabel); ?>
          <select data-sample-theme>
            <option value="light"><?php echo $escape($lightLabel); ?></option>
            <option value="dark"><?php echo $escape($darkLabel); ?></option>
          </select>
        </label>
        <a data-sample-open href="<?php echo $escape($default); ?>" target="_blank" rel="noopener"><?php echo $escape($openLabel); ?></a>
        <a data-sample-download href="<?php echo $escape($default); ?>" download><?php echo $escape($downloadLabel); ?></a>
      </div>
    </div>

    <iframe class="tracy-marketing__preview" src="<?php echo $escape($default); ?>"
            title="<?php echo $escape($samples[0]['title']); ?>"
            sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>

    <?php if ($note !== '') : ?><p class="tracy-marketing__note"><?php echo $escape($note); ?></p><?php endif; ?>

    <noscript>
      <p>Open a sample directly:</p>
      <?php foreach ($samples as $sample) : ?>
        <a href="<?php echo $escape($base . $sample['key'] . '-light.html'); ?>"><?php echo $escape($sample['title']); ?></a>
      <?php endforeach; ?>
    </noscript>
  </section>
</div>
