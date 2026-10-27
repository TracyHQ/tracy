<?php

/**
 * @package     Tracy
 * @subpackage  com_users.registration
 *
 * Template override of the T4 base view. The same card shell as login (design-spec §6 register row),
 * one step wider because the sign-up form carries several fieldsets. The base's red JCANCEL button
 * becomes a quiet secondary: a cancel link is not a destructive action, and a red fill would spend an
 * accent the page has not earned (DESIGN.md §7).
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

/** @var \Joomla\Component\Users\Site\View\Registration\HtmlView $this */

HTMLHelper::_('behavior.keepalive');
HTMLHelper::_('behavior.formvalidator');
?>
<div class="tracy-auth tracy-auth--wide">
    <div class="com-users-registration tracy-auth-card">
        <?php if ($this->params->get('show_page_heading')) : ?>
            <header class="tracy-auth-head">
                <h1 class="tracy-auth-title">
                    <?php echo $this->escape($this->params->get('page_heading')); ?>
                </h1>
            </header>
        <?php endif; ?>

        <form id="member-registration"
              action="<?php echo Route::_('index.php?option=com_users&task=registration.register'); ?>"
              method="post"
              class="com-users-registration__form tracy-auth-form form-validate"
              enctype="multipart/form-data">
            <?php foreach ($this->form->getFieldsets() as $fieldset) : ?>
                <?php if ($fieldset->name === 'captcha' && $this->captchaEnabled) : ?>
                    <?php continue; ?>
                <?php endif; ?>
                <?php $fields = $this->form->getFieldset($fieldset->name); ?>
                <?php if (count($fields)) : ?>
                    <fieldset class="tracy-auth-fieldset">
                        <?php if (isset($fieldset->label) && ($legend = trim(Text::_($fieldset->label))) !== '') : ?>
                            <legend class="tracy-auth-legend"><?php echo $legend; ?></legend>
                        <?php endif; ?>
                        <?php echo $this->form->renderFieldset($fieldset->name, ['class' => 'tracy-field']); ?>
                    </fieldset>
                <?php endif; ?>
            <?php endforeach; ?>

            <?php if ($this->captchaEnabled) : ?>
                <fieldset class="tracy-auth-fieldset">
                    <?php echo $this->form->renderFieldset('captcha', ['class' => 'tracy-field']); ?>
                </fieldset>
            <?php endif; ?>

            <div class="tracy-auth-actions">
                <button type="submit" class="com-users-registration__register btn btn-primary validate tracy-auth-submit">
                    <?php echo Text::_('JREGISTER'); ?>
                </button>
                <a class="com-users-registration__cancel btn btn-secondary"
                   href="<?php echo Route::_(''); ?>"
                   title="<?php echo $this->escape(Text::_('JCANCEL')); ?>">
                    <?php echo Text::_('JCANCEL'); ?>
                </a>
                <input type="hidden" name="option" value="com_users">
                <input type="hidden" name="task" value="registration.register">
            </div>

            <?php echo $this->form->renderControlFields(); ?>
        </form>
    </div>
</div>
