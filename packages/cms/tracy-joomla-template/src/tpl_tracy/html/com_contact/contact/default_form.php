<?php

/**
 * The contact form of com_contact, in Tracy's shapes. Joomla already owns the sending — the
 * component validates, checks the token, mails `email_to` and redirects with a message — so this
 * override changes only the markup: the fields the form declares (`contact_name`, `contact_email`,
 * `contact_subject`, `contact_message`, plus whatever a site adds) rendered as `tracy-field`, and
 * the submit as `tracy-btn`. That is why the section library's contact form carries the same field
 * names: the same look, and on Joomla the same names the component expects.
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

/** @var Joomla\Component\Contact\Site\View\Contact\HtmlView $this */

$wa = $this->getDocument()->getWebAssetManager();
$wa->useScript('keepalive')->useScript('form.validate');
?>
<form id="contact-form" class="tracy-form tracy-form--contact form-validate" action="<?php echo Route::_('index.php'); ?>" method="post">
    <?php foreach ($this->form->getFieldsets() as $fieldset) : ?>
        <?php if ($fieldset->name === 'captcha' && $this->captchaEnabled) : ?>
            <?php continue; ?>
        <?php endif; ?>
        <?php $fields = $this->form->getFieldset($fieldset->name); ?>
        <?php if (\count($fields)) : ?>
            <?php foreach ($fields as $field) : ?>
                <label class="tracy-field" for="<?php echo $field->id; ?>">
                    <?php if ($field->type !== 'Checkbox') : ?>
                        <span class="tracy-field__label"><?php echo $field->label ? strip_tags($field->label) : $field->name; ?></span>
                    <?php endif; ?>
                    <?php echo $field->input; ?>
                </label>
            <?php endforeach; ?>
        <?php endif; ?>
    <?php endforeach; ?>

    <?php if ($this->captchaEnabled) : ?>
        <div class="tracy-field"><?php echo $this->form->renderFieldset('captcha'); ?></div>
    <?php endif; ?>

    <button class="tracy-btn tracy-btn--primary validate" type="submit"><?php echo Text::_('COM_CONTACT_CONTACT_SEND'); ?></button>

    <input type="hidden" name="option" value="com_contact">
    <input type="hidden" name="task" value="contact.submit">
    <input type="hidden" name="return" value="<?php echo $this->return_page; ?>">
    <input type="hidden" name="id" value="<?php echo $this->item->slug; ?>">
    <?php echo HTMLHelper::_('form.token'); ?>
</form>
