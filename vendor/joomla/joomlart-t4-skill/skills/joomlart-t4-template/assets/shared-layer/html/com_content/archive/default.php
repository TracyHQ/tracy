<?php
/**
 * Tracy — com_content / archive / default
 *
 * Starts from the T4 base archive/default.php. The base renders the year/month filter as a
 * Bootstrap `form-inline` strip with a `btn btn-primary` submit and `mr-2 me-2` spacing —
 * a toolbar. design-spec.md §6 (archive.html) asks for "Year/month filter bar as capsule chips
 * (--radius-pill at the small end, 56px)", so each control becomes a chip in a
 * .tracy-chips bar and the geometry is set once, in scss/_overrides-content.scss.
 *
 * Fixes carried through:
 *   - The base leaves `sr-only` on the labels. That is the Bootstrap 4 name; BS5 — which this
 *     template declares — renames it `visually-hidden`, so under BS5 those labels are VISIBLE
 *     text sitting in the middle of the filter bar. Both classes are emitted so the markup is
 *     correct on either build.
 *   - `style="vertical-align: top;"` is an inline literal; the chip bar aligns its own items.
 *   - The month/year/limit fields come out of com_content's own form object, so their markup is
 *     not ours to restyle at source — each is wrapped in its own chip element instead, which is
 *     what gives the CSS something token-driven to bind to.
 */

defined('_JEXEC') or die;

use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

?>
<div class="com-content-archive archive tracy-archive">
	<?php if ($this->params->get('show_page_heading')) : ?>
		<div class="page-header tracy-archive__pagehead">
			<h1><?php echo $this->escape($this->params->get('page_heading')); ?></h1>
		</div>
	<?php endif; ?>

	<form id="adminForm" action="<?php echo Route::_('index.php'); ?>" method="post" class="com-content-archive__form tracy-archive__form">
		<fieldset class="com-content-archive__filters filters tracy-chips tracy-chips--filters">
			<legend class="sr-only visually-hidden"><?php echo Text::_('COM_CONTENT_TITLE_FILTER_LABEL'); ?></legend>

			<?php if ($this->params->get('filter_field') !== 'hide') : ?>
				<div class="tracy-chip tracy-chip--field">
					<label class="filter-search-lbl sr-only visually-hidden" for="filter-search"><?php echo Text::_('COM_CONTENT_TITLE_FILTER_LABEL'); ?></label>
					<input type="text" name="filter-search" id="filter-search"
						value="<?php echo $this->escape($this->filter); ?>"
						onchange="document.getElementById('adminForm').submit();"
						placeholder="<?php echo Text::_('COM_CONTENT_TITLE_FILTER_LABEL'); ?>">
				</div>
			<?php endif; ?>

			<div class="tracy-chip tracy-chip--field"><?php echo $this->form->monthField; ?></div>
			<div class="tracy-chip tracy-chip--field"><?php echo $this->form->yearField; ?></div>
			<div class="tracy-chip tracy-chip--field"><?php echo $this->form->limitField; ?></div>

			<button type="submit" class="btn btn-primary tracy-chip tracy-chip--submit"><?php echo Text::_('JGLOBAL_FILTER_BUTTON'); ?></button>

			<input type="hidden" name="view" value="archive">
			<input type="hidden" name="option" value="com_content">
			<input type="hidden" name="limitstart" value="0">
		</fieldset>
	</form>

	<?php echo $this->loadTemplate('items'); ?>
</div>
