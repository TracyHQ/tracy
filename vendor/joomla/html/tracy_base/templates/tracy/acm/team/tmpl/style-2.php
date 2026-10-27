<?php
defined('_JEXEC') or die;
require_once dirname(__DIR__, 2) . '/data.php';
if (!($helper instanceof TracyAcmData)) $helper = new TracyAcmData($helper, (string) $module->params);
$escape = static fn($value) => htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
$heading = trim((string) $helper->get('heading'));
$categoryId = (int) $helper->get('source-category');
if (!$categoryId) return;
$app = Joomla\CMS\Factory::getApplication();
$model = $app->bootComponent('com_content')->getMVCFactory()->createModel('Articles', 'Site', ['ignore_request' => true]);
$model->setState('params', clone Joomla\CMS\Component\ComponentHelper::getParams('com_content'));
$model->setState('filter.category_id', [$categoryId]);
$model->setState('filter.published', 1);
$model->setState('filter.access', true);
$model->setState('filter.language', $app->getLanguageFilter());
// Read multi-select values directly: the legacy ACM getter assumes scalar text.
$moduleConfig = json_decode((string) $module->params, true) ?: [];
$teamConfig = json_decode($moduleConfig['jatools-config'] ?? '{}', true) ?: [];
$selectedValues = (array) ($teamConfig['team']['team[selected-members]'] ?? []);
$selected = [];
array_walk_recursive($selectedValues, static function ($value) use (&$selected) {
    foreach (explode(',', (string) $value) as $id) {
        if (ctype_digit(trim($id)) && (int) $id > 0) $selected[] = (int) $id;
    }
});
$selected = array_slice(array_values(array_unique($selected)), 0, 4);
if ($selected) {
    $model->setState('filter.article_id', $selected);
    $model->setState('filter.featured', 'show');
} else {
    $model->setState('filter.featured', 'only');
}
$model->setState('list.start', 0);
$model->setState('list.limit', 4);
$model->setState('list.ordering', 'a.ordering');
$model->setState('list.direction', 'ASC');
$members = $model->getItems();
$teamUrl = Joomla\CMS\Router\Route::_(Joomla\Component\Content\Site\Helper\RouteHelper::getCategoryRoute($categoryId));
?>
<div class="tracy-menu-team">
<?php if ($heading !== ''): ?><p class="tracy-menu-team__heading"><?php echo $escape($heading); ?></p><?php endif; ?>
<ul class="tracy-menu-team__people">
<?php foreach ($members as $member):
$parts = preg_split('/\s+—\s+/u', $member->title, 2);
$name = $parts[0]; $role = $parts[1] ?? '';
$images = json_decode($member->images, true) ?: [];
$portrait = Joomla\CMS\Helper\MediaHelper::getCleanMediaFieldValue($images['image_intro'] ?? '');
if ($portrait === '') $portrait = Joomla\CMS\Helper\MediaHelper::getCleanMediaFieldValue($images['image_fulltext'] ?? '');
$url = Joomla\CMS\Router\Route::_(Joomla\Component\Content\Site\Helper\RouteHelper::getArticleRoute($member->id . ':' . $member->alias, $member->catid, $member->language));
?>
<li><a class="tracy-menu-team__person" href="<?php echo $escape($url); ?>">
<?php if ($portrait !== ''): ?><img src="<?php echo $escape($portrait); ?>" alt="<?php echo $escape($name); ?>" width="400" height="400" decoding="async"><?php endif; ?>
<span class="tracy-menu-team__name"><?php echo $escape($name); ?></span>
<?php if ($role !== ''): ?><span class="tracy-menu-team__role"><?php echo $escape($role); ?></span><?php endif; ?>
</a></li>
<?php endforeach; ?>
</ul>
<a class="tracy-menu-team__all" href="<?php echo $escape($teamUrl); ?>"><?php echo Joomla\CMS\Language\Text::_('TPL_TRACY_BASE_TEAM_VIEW_ALL'); ?> <span aria-hidden="true">→</span></a>
</div>
