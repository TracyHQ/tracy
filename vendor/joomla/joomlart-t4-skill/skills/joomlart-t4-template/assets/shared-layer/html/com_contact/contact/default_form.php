<?php

/**
 * Tracy — com_contact mail form.
 *
 * Rebuilt from the T4 base override so the markup carries the fixture's #form vocabulary instead of
 * Bootstrap's .form-horizontal grid: one .tracy-field per row (label at --text-sm above an
 * 8px-radius control), the "required fields" line as help text at --text-sm/--meta, and a single
 * capsule .btn-primary in the action row. Field HTML still comes from $this->form, so validation,
 * plugin fieldsets and the captcha keep working.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

/** @var \Joomla\Component\Contact\Site\View\Contact\HtmlView $this */
$wa = $this->getDocument()->getWebAssetManager();
$wa->useScript('keepalive')->useScript('form.validate');

$showCopy = $this->params->get('show_email_copy');
?>
<?php if (isset($this->error)) : ?>
    <p class="tracy-field-note contact-error"><?php echo $this->error; ?></p>
<?php endif; ?>

<div class="com-contact__form contact-form">
    <form id="contact-form" action="<?php echo Route::_('index.php'); ?>" method="post" class="form-validate tracy-form tracy-form--wide">

        <?php foreach ($this->form->getFieldset('contact') as $field) : ?>
            <?php if ($field->hidden) : ?>
                <?php echo $field->input; ?>
                <?php continue; ?>
            <?php endif; ?>

            <?php if ($field->type === 'Spacer') : ?>
                <p class="tracy-field-note"><?php echo Text::_('COM_CONTACT_CONTACT_REQUIRED'); ?></p>
                <?php continue; ?>
            <?php endif; ?>

            <?php if ($field->fieldname === 'contact_email_copy') : ?>
                <?php continue; ?>
            <?php endif; ?>

            <div class="tracy-field contact-<?php echo $this->escape($field->fieldname); ?>">
                <?php echo $field->label; ?>
                <?php echo $field->input; ?>
            </div>
        <?php endforeach; ?>

        <?php // Fields any content/user plugin injected into its own fieldset. ?>
        <?php foreach ($this->form->getFieldsets() as $fieldset) : ?>
            <?php if ($fieldset->name === 'contact') : ?>
                <?php continue; ?>
            <?php endif; ?>
            <?php if ($fieldset->name === 'captcha' && !$this->captchaEnabled) : ?>
                <?php continue; ?>
            <?php endif; ?>
            <?php $fields = $this->form->getFieldset($fieldset->name); ?>
            <?php if (!count($fields)) : ?>
                <?php continue; ?>
            <?php endif; ?>

            <?php foreach ($fields as $field) : ?>
                <?php if ($field->hidden) : ?>
                    <?php echo $field->input; ?>
                <?php else : ?>
                    <div class="tracy-field">
                        <?php echo $field->label; ?>
                        <?php echo $field->input; ?>
                    </div>
                <?php endif; ?>
            <?php endforeach; ?>
        <?php endforeach; ?>

        <?php if ($showCopy) : ?>
            <div class="tracy-form-check email-copy">
                <?php echo $this->form->getInput('contact_email_copy'); ?>
                <?php echo $this->form->getLabel('contact_email_copy'); ?>
            </div>
        <?php endif; ?>

        <div class="tracy-form-actions">
            <button class="btn btn-primary validate" type="submit">
                <?php echo Text::_('COM_CONTACT_CONTACT_SEND'); ?>
            </button>
        </div>

        <input type="hidden" name="option" value="com_contact">
        <input type="hidden" name="task" value="contact.submit">
        <input type="hidden" name="return" value="<?php echo $this->escape($this->return_page ?? ''); ?>">
        <input type="hidden" name="id" value="<?php echo $this->escape($this->item->slug ?? ''); ?>">
        <?php echo HTMLHelper::_('form.token'); ?>
    </form>
</div>
