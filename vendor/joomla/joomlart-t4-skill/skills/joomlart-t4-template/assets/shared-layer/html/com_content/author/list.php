<?php
/**
 * Tracy — com_content / author / list (the AUTHOR INDEX view)
 *
 * Starts from plugins/system/t4/themes/base/html/com_content/author/list.php. The AJAX passthrough
 * and the T4 pagination layout are unchanged; list_items.php is inherited from the base, because
 * the card it renders is the shared `t4.content.author_info` block and the design's changes to it
 * (avatar at 50%, bio at --fg-2 — design-spec.md §6) are entirely CSS. Re-authoring it would be
 * exactly the duplication gotcha #10 warns about.
 *
 * One change of substance: the base wraps the list in its own `.container`. Inside a T4 layout the
 * component already sits in a container, so that second one re-applies the gutter and pulls the
 * grid narrower than every other page — visible as a step in the left margin when you move between
 * the author index and any other inner page. The wrapper stays (it is the block's own scope) but
 * the nested container does not.
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\Layout\LayoutHelper;

$app = Factory::getApplication();

// process for ajax pagination, just get items content and return to browser
if ($app->input->get('loadpage') !== null) {
    echo $this->loadTemplate('items');
    exit;
}
?>
<div class="author-page tracy-authorlist">
	<?php echo $this->loadTemplate('items'); ?>
</div>

<?php echo LayoutHelper::render('t4.content.pagination', ['params' => $this->params, 'pagination' => $this->AuhtorPagination, 'elem' => '.author-page .author-lists']); ?>
