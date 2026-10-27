<?php

/**
 * @package     Tracy
 * @subpackage  com_users.reset
 *
 * Template override. Step 3 of 3 — set the new password. Same `well` removal as confirm.php, and the
 * fieldset label is rendered as a legend here because this step really does head a group of fields.
 * The base emitted only a raw form token; renderControlFields() is the J4+ call and also carries the
 * return field, so the step survives a redirect.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

/** @var \Joomla\Component\Users\Site\View\Reset\HtmlView $this */

HTMLHelper::_('behavior.keepalive');
HTMLHelper::_('behavior.formvalidator');
?>
<div class="tracy-auth">
    <div class="com-users-reset-complete tracy-auth-card <?php echo $this->pageclass_sfx; ?>">
        <?php if ($this->params->get('show_page_heading')) : ?>
            <header class="tracy-auth-head">
                <h1 class="tracy-auth-title">
                    <?php echo $this->escape($this->params->get('page_heading')); ?>
                </h1>
            </header>
        <?php endif; ?>

        <form action="<?php echo Route::_('index.php?option=com_users&task=reset.complete'); ?>"
              method="post"
              class="com-users-reset__form tracy-auth-form form-validate">
            <?php foreach ($this->form->getFieldsets() as $fieldset) : ?>
                <fieldset class="tracy-auth-fieldset">
                    <?php if (isset($fieldset->label) && ($legend = trim(Text::_($fieldset->label))) !== '') : ?>
                        <legend class="tracy-auth-legend"><?php echo $legend; ?></legend>
                    <?php endif; ?>
                    <?php echo $this->form->renderFieldset($fieldset->name, ['class' => 'tracy-field']); ?>
                </fieldset>
            <?php endforeach; ?>

            <div class="tracy-auth-actions">
                <button type="submit" class="btn btn-primary validate tracy-auth-submit">
                    <?php echo Text::_('JSUBMIT'); ?>
                </button>
            </div>

            <?php echo $this->form->renderControlFields(); ?>
        </form>
    </div>
</div>
