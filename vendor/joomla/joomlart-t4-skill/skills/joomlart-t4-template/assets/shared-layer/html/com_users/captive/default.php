<?php

/**
 * @package     Tracy
 * @subpackage  com_users.captive
 *
 * Template override of the CORE view. The one-time-code gate a user meets straight after a correct
 * password, so it is the same auth card as the login form it follows — the core version was a
 * `card card-body` with a `form-horizontal` grid, which put the code box at a different width from
 * the password box it replaces. Also: the core help affordance calls Text::_('JHELP'), and JHELP is
 * only defined in the ADMINISTRATOR language pack — on the site it printed the literal string JHELP
 * (gotcha #63). It is a plain word here.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Joomla\Utilities\ArrayHelper;

/**
 * @var \Joomla\Component\Users\Site\View\Captive\HtmlView $this
 */

$this->getDocument()->getWebAssetManager()->useScript('com_users.two-factor-focus');

$attributes = array_merge(
    [
        'type'         => $this->renderOptions['input_type'],
        'name'         => 'code',
        'value'        => '',
        'placeholder'  => $this->renderOptions['placeholder'] ?? null,
        'id'           => 'users-mfa-code',
        'class'        => 'form-control',
        'autocomplete' => $this->renderOptions['autocomplete'] ?? 'one-time-code',
    ],
    $this->renderOptions['input_attributes']
);

if (strpos($attributes['class'], 'form-control') === false) {
    $attributes['class'] .= ' form-control';
}
?>
<div class="tracy-auth">
    <div class="users-mfa-captive tracy-auth-card">
        <header class="tracy-auth-head">
            <h1 id="users-mfa-title" class="tracy-auth-title">
                <?php if (!empty($this->title)) : ?>
                    <?php echo $this->title; ?>
                <?php elseif (!$this->allowEntryBatching) : ?>
                    <?php echo $this->escape($this->record->title); ?>
                <?php else : ?>
                    <?php echo $this->escape($this->getModel()->translateMethodName($this->record->method)); ?>
                <?php endif; ?>
            </h1>

            <?php if (!empty($this->title)) : ?>
                <p class="tracy-auth-sub">
                    <?php if (!$this->allowEntryBatching) : ?>
                        <?php echo $this->escape($this->record->title); ?>
                    <?php else : ?>
                        <?php echo $this->escape($this->getModel()->translateMethodName($this->record->method)); ?>
                    <?php endif; ?>
                </p>
            <?php endif; ?>

            <?php if (!empty($this->renderOptions['help_url'])) : ?>
                <a class="tracy-auth-help"
                   href="<?php echo $this->renderOptions['help_url']; ?>"
                   target="_blank"
                   rel="noopener noreferrer">
                    <span class="icon icon-question-sign" aria-hidden="true"></span>
                    <span class="visually-hidden">Help</span>
                </a>
            <?php endif; ?>
        </header>

        <?php if ($this->renderOptions['pre_message']) : ?>
            <div class="users-mfa-captive-pre-message tracy-auth-lead">
                <?php echo $this->renderOptions['pre_message']; ?>
            </div>
        <?php endif; ?>

        <form action="<?php echo Route::_('index.php?task=captive.validate&record_id=' . ((int) $this->record->id)); ?>"
              method="post"
              id="users-mfa-captive-form"
              class="tracy-auth-form">
            <?php echo HTMLHelper::_('form.token'); ?>

            <fieldset class="tracy-auth-fieldset">
                <?php if ($this->renderOptions['field_type'] === 'custom') : ?>
                    <?php echo $this->renderOptions['html']; ?>
                <?php endif; ?>

                <div id="users-mfa-captive-form-method-fields" class="tracy-field control-group">
                    <?php if ($this->renderOptions['label']) : ?>
                        <div class="control-label">
                            <label for="users-mfa-code"><?php echo $this->renderOptions['label']; ?></label>
                        </div>
                    <?php endif; ?>
                    <div class="controls">
                        <input <?php echo ArrayHelper::toString($attributes); ?>>
                    </div>
                </div>

                <div id="users-mfa-captive-form-standard-buttons" class="tracy-auth-actions">
                    <button class="btn btn-primary tracy-auth-submit <?php echo $this->renderOptions['submit_class']; ?>"
                            id="users-mfa-captive-button-submit"
                            <?php echo $this->renderOptions['hide_submit'] ? 'hidden' : ''; ?>
                            type="submit">
                        <span class="<?php echo $this->renderOptions['submit_icon']; ?>" aria-hidden="true"></span>
                        <?php echo Text::_($this->renderOptions['submit_text']); ?>
                    </button>
                </div>
            </fieldset>
        </form>

        <?php if ($this->renderOptions['post_message']) : ?>
            <div class="users-mfa-captive-post-message tracy-auth-lead">
                <?php echo $this->renderOptions['post_message']; ?>
            </div>
        <?php endif; ?>
    </div>

    <nav class="tracy-auth-links">
        <?php if (count($this->records) > 1) : ?>
            <a id="users-mfa-captive-form-choose-another"
               href="<?php echo Route::_('index.php?option=com_users&view=captive&task=select'); ?>">
                <?php echo Text::_('COM_USERS_MFA_USE_DIFFERENT_METHOD'); ?>
            </a>
        <?php endif; ?>
        <a id="users-mfa-captive-button-logout"
           href="<?php echo Route::_('index.php?option=com_users&task=user.logout&' . Factory::getApplication()->getFormToken() . '=1'); ?>">
            <?php echo Text::_('COM_USERS_MFA_LOGOUT'); ?>
        </a>
    </nav>
</div>
