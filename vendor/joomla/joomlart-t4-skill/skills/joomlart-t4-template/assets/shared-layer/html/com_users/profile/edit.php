<?php

/**
 * @package     Tracy
 * @subpackage  com_users.profile
 *
 * Template override of the T4 base view. Same form vocabulary as the fixture's #form region
 * (design-spec §6 profile-edit row): fields stack, label over control, 8px radius, help text at
 * --text-sm/--meta. Three substantive changes against the base:
 *   1. the Joomla 3 / pre-4.2 branches are gone — the inline jQuery twoFactorMethodChange() shim, the
 *      chosen.js call and the OTEP fieldset only ever ran on Joomla 3, and this template targets
 *      Joomla 6. What is left is the one live path: $this->mfaConfigurationUI;
 *   2. `form-horizontal` + `col-sm-3`/`col-sm-9` become the stacked field, so the edit form and the
 *      login form are the same component;
 *   3. the red JCANCEL button becomes a secondary — cancelling is not destruction.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

/** @var \Joomla\Component\Users\Site\View\Profile\HtmlView $this */

Factory::getApplication()->getLanguage()->load('plg_user_profile', JPATH_ADMINISTRATOR);

$this->document->getWebAssetManager()
    ->useScript('keepalive')
    ->useScript('form.validate');
?>
<div class="tracy-auth tracy-auth--wide">
    <div class="com-users-profile__edit tracy-auth-card">
        <?php if ($this->params->get('show_page_heading')) : ?>
            <header class="tracy-auth-head">
                <h1 class="tracy-auth-title">
                    <?php echo $this->escape($this->params->get('page_heading')); ?>
                </h1>
            </header>
        <?php endif; ?>

        <form id="member-profile"
              action="<?php echo Route::_('index.php?option=com_users&task=profile.save'); ?>"
              method="post"
              class="com-users-profile__edit-form tracy-auth-form form-validate"
              enctype="multipart/form-data">
            <?php foreach ($this->form->getFieldsets() as $group => $fieldset) : ?>
                <?php $fields = $this->form->getFieldset($group); ?>
                <?php if (count($fields)) : ?>
                    <fieldset class="tracy-auth-fieldset">
                        <?php if (isset($fieldset->label) && ($legend = trim(Text::_($fieldset->label))) !== '') : ?>
                            <legend class="tracy-auth-legend"><?php echo $legend; ?></legend>
                        <?php endif; ?>
                        <?php if (isset($fieldset->description) && trim($fieldset->description)) : ?>
                            <p class="tracy-auth-lead"><?php echo $this->escape(Text::_($fieldset->description)); ?></p>
                        <?php endif; ?>

                        <?php foreach ($fields as $field) : ?>
                            <?php if ($field->hidden) : ?>
                                <?php echo $field->input; ?>
                            <?php else : ?>
                                <div class="tracy-field control-group">
                                    <div class="control-label"><?php echo $field->label; ?></div>
                                    <div class="controls"><?php echo $field->input; ?></div>
                                </div>
                            <?php endif; ?>
                        <?php endforeach; ?>
                    </fieldset>
                <?php endif; ?>
            <?php endforeach; ?>

            <?php if (!empty($this->mfaConfigurationUI)) : ?>
                <fieldset class="com-users-profile__multifactor tracy-auth-fieldset tracy-mfa">
                    <legend class="tracy-auth-legend">
                        <?php echo Text::_('COM_USERS_PROFILE_MULTIFACTOR_AUTH'); ?>
                    </legend>
                    <?php echo $this->mfaConfigurationUI; ?>
                </fieldset>
            <?php endif; ?>

            <div class="tracy-auth-actions">
                <button type="submit" class="btn btn-primary validate tracy-auth-submit">
                    <?php echo Text::_('JSAVE'); ?>
                </button>
                <a class="btn btn-secondary"
                   href="<?php echo Route::_('index.php?option=com_users&view=profile'); ?>"
                   title="<?php echo $this->escape(Text::_('JCANCEL')); ?>">
                    <?php echo Text::_('JCANCEL'); ?>
                </a>
                <input type="hidden" name="option" value="com_users">
                <input type="hidden" name="task" value="profile.save">
            </div>

            <?php echo $this->form->renderControlFields(); ?>
        </form>
    </div>
</div>
