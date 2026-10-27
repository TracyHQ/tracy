<?php

/**
 * Tracy — Smart Search form.
 *
 * The base override wraps the query box in a Bootstrap `.input-group`, which glues the button to the
 * field and forces the field's radius to zero on one side. The design wants the fixture's own
 * geometry instead: a standalone .field at --radius-sm with its label above, and the submit as a
 * separate capsule beside it. Advanced search keeps the collapse, moved below a hairline.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

/** @var \Joomla\Component\Finder\Site\View\Search\HtmlView $this */
if ($this->params->get('show_autosuggest', 1)) {
    $this->getDocument()->getWebAssetManager()->usePreset('awesomplete');
    $this->getDocument()->addScriptOptions(
        'finder-search',
        ['url' => Route::_('index.php?option=com_finder&task=suggestions.suggest&format=json&tmpl=component')]
    );

    // Awesomplete reads these three from the JS language payload; core declares them right here,
    // and dropping them when this form was re-laid out left the suggestion list with
    // aria-label="COM_FINDER_SEARCH_FORM_LIST_LABEL" — the raw key, read out by screen readers.
    Text::script('COM_FINDER_SEARCH_FORM_LIST_LABEL');
    Text::script('JLIB_JS_AJAX_ERROR_OTHER');
    Text::script('JLIB_JS_AJAX_ERROR_PARSE');
}

$showAdvanced = $this->params->get('show_advanced', 1);
?>
<form action="<?php echo Route::_($this->query->toUri()); ?>" method="get" class="js-finder-searchform">
    <?php echo $this->getFields(); ?>

    <fieldset class="com-finder__search word">
        <legend class="com-finder__search-legend visually-hidden">
            <?php echo Text::_('COM_FINDER_SEARCH_FORM_LEGEND'); ?>
        </legend>

        <div class="tracy-search__form">
            <div class="tracy-field tracy-search__field">
                <label for="q"><?php echo Text::_('COM_FINDER_SEARCH_TERMS'); ?></label>
                <input type="text" name="q" id="q" class="js-finder-search-query form-control" value="<?php echo $this->escape($this->query->input); ?>">
            </div>

            <button type="submit" class="btn btn-primary">
                <?php echo Text::_('JSEARCH_FILTER_SUBMIT'); ?>
            </button>

            <?php if ($showAdvanced) : ?>
                <?php HTMLHelper::_('bootstrap.collapse'); ?>
                <button
                    class="btn btn-secondary"
                    type="button"
                    data-bs-toggle="collapse"
                    data-bs-target="#advancedSearch"
                    aria-expanded="<?php echo $this->params->get('expand_advanced', 0) ? 'true' : 'false'; ?>">
                    <?php echo Text::_('COM_FINDER_ADVANCED_SEARCH_TOGGLE'); ?>
                </button>
            <?php endif; ?>
        </div>
    </fieldset>

    <?php if ($showAdvanced) : ?>
        <fieldset id="advancedSearch" class="com-finder__advanced js-finder-advanced tracy-search__advanced collapse<?php echo $this->params->get('expand_advanced', 0) ? ' show' : ''; ?>">
            <legend class="com-finder__search-advanced visually-hidden">
                <?php echo Text::_('COM_FINDER_SEARCH_ADVANCED_LEGEND'); ?>
            </legend>

            <?php if ($this->params->get('show_advanced_tips', 1)) : ?>
                <div class="com-finder__tips tracy-search__tips">
                    <?php echo Text::_('COM_FINDER_ADVANCED_TIPS_INTRO'); ?>
                    <?php echo Text::_('COM_FINDER_ADVANCED_TIPS_AND'); ?>
                    <?php echo Text::_('COM_FINDER_ADVANCED_TIPS_NOT'); ?>
                    <?php echo Text::_('COM_FINDER_ADVANCED_TIPS_OR'); ?>
                    <?php if ($this->params->get('tuplecount', 1) > 1) : ?>
                        <?php echo Text::_('COM_FINDER_ADVANCED_TIPS_PHRASE'); ?>
                    <?php endif; ?>
                    <?php echo Text::_('COM_FINDER_ADVANCED_TIPS_OUTRO'); ?>
                </div>
            <?php endif; ?>

            <div id="finder-filter-window" class="com-finder__filter">
                <?php echo HTMLHelper::_('filter.select', $this->query, $this->params); ?>
            </div>
        </fieldset>
    <?php endif; ?>
</form>
