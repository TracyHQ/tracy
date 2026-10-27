<?php
/**
 * Tracy — ACM block `site-notice`, style 1.
 *
 * A demo site has to say it is one, on every page a visitor can reach — the content contract makes
 * that a condition of compiling any surface, not a courtesy. One footer line, assigned to all
 * pages, is the only placement that survives a new page being added later.
 *
 * The class is the audit's anchor: site pages carry no build-time field markers, so the observation
 * reads them through a selector map, and `.tracy-site-notice` is the selector.
 */

defined('_JEXEC') or die;

require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);

$notice = trim((string) $helper->get('notice'));
if ($notice === '') return;
?>
<div class="ja-acm acm-site-notice style-1">
  <p class="tracy-site-notice"><?php echo htmlspecialchars($notice, ENT_QUOTES, 'UTF-8'); ?></p>
</div>
