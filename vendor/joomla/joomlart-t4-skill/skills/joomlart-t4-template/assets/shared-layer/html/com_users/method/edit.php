<?php

/**
 * @package     Tracy
 * @subpackage  com_users.method
 *
 * Template override of the CORE view. Add or rename one authenticator. Card shell instead of
 * `card card-body` (which under this template's .card rule paid the 24px padding twice), stacked
 * fields instead of the col-sm-3/col-sm-9 grid, `btn-dark` help button → the quiet help link the
 * captive page uses, and the same JHELP fix (gotcha #63: JHELP exists only in the administrator
 * language pack, so on the site it rendered as the literal key). The setup table keeps its shape but
 * loses `table-striped`, whose zebra is a hardcoded rgba over white.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Joomla\Utilities\ArrayHelper;

/** @var \Joomla\Component\Users\Site\View\Method\HtmlView $this */

$cancelURL = Route::_('index.php?option=com_users&task=methods.display&user_id=' . $this->user->id);

if (!empty($this->returnURL)) {
    $cancelURL = $this->escape(base64_decode($this->returnURL));
}

$recordId   = (int) ($this->record->id ?? 0);
$method     = $this->record->method ?? $this->getModel()->getState('method');
$userId     = (int) ($this->user->id ?? 0);
$hideSubmit = !$this->renderOptions['show_submit'] && !$this->isEditExisting;

$attributes = array_merge(
    [
        'type'             => $this->renderOptions['input_type'],
        'name'             => 'code',
        'value'            => $this->escape($this->renderOptions['input_value']),
        'id'               => 'com-users-method-code',
        'class'            => 'form-control',
        'aria-describedby' => 'com-users-method-code-help',
    ],
    $this->renderOptions['input_attributes']
);

if (strpos($attributes['class'], 'form-control') === false) {
    $attributes['class'] .= ' form-control';
}
?>
<div class="tracy-auth tracy-auth--wide">
    <div class="com-users-method-edit tracy-auth-card">
        <?php if (!empty($this->title)) : ?>
            <header class="tracy-auth-head">
                <h1 id="com-users-method-edit-head" class="tracy-auth-title">
                    <?php echo Text::_($this->title); ?>
                </h1>
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
        <?php endif; ?>

        <form action="<?php echo Route::_(sprintf('index.php?task=method.save&id=%d&method=%s&user_id=%d', $recordId, $method, $userId)); ?>"
              method="post"
              id="com-users-method-edit"
              class="tracy-auth-form">
            <?php echo HTMLHelper::_('form.token'); ?>

            <?php if (!empty($this->returnURL)) : ?>
                <input type="hidden" name="returnurl" value="<?php echo $this->escape($this->returnURL); ?>">
            <?php endif; ?>

            <?php foreach ($this->renderOptions['hidden_data'] ?? [] as $key => $value) : ?>
                <input type="hidden" name="<?php echo $this->escape($key); ?>" value="<?php echo $this->escape($value); ?>">
            <?php endforeach; ?>

            <fieldset class="tracy-auth-fieldset">
                <div class="tracy-field control-group">
                    <div class="control-label">
                        <label for="com-users-method-edit-title">
                            <?php echo Text::_('COM_USERS_MFA_EDIT_FIELD_TITLE'); ?>
                        </label>
                    </div>
                    <div class="controls">
                        <input type="text"
                               class="form-control"
                               id="com-users-method-edit-title"
                               name="title"
                               value="<?php echo $this->escape($this->record->title); ?>"
                               aria-describedby="com-users-method-edit-help">
                        <p class="form-text" id="com-users-method-edit-help">
                            <?php echo $this->escape(Text::_('COM_USERS_MFA_EDIT_FIELD_TITLE_DESC')); ?>
                        </p>
                    </div>
                </div>

                <div class="tracy-auth-remember form-check">
                    <input class="form-check-input"
                           type="checkbox"
                           id="com-users-is-default-method"
                           name="default"
                           <?php echo $this->record->default ? 'checked' : ''; ?>>
                    <label class="form-check-label" for="com-users-is-default-method">
                        <?php echo Text::_('COM_USERS_MFA_EDIT_FIELD_DEFAULT'); ?>
                    </label>
                </div>
            </fieldset>

            <?php if (!empty($this->renderOptions['pre_message'])) : ?>
                <div class="com-users-method-edit-pre-message tracy-auth-lead">
                    <?php echo $this->renderOptions['pre_message']; ?>
                </div>
            <?php endif; ?>

            <?php if (!empty($this->renderOptions['tabular_data'])) : ?>
                <div class="com-users-method-edit-tabular-container">
                    <?php if (!empty($this->renderOptions['table_heading'])) : ?>
                        <h2 class="tracy-auth-legend">
                            <?php echo $this->renderOptions['table_heading']; ?>
                        </h2>
                    <?php endif; ?>
                    <table class="tracy-mfa-table">
                        <tbody>
                            <?php foreach ($this->renderOptions['tabular_data'] as $cell1 => $cell2) : ?>
                                <tr>
                                    <th scope="row"><?php echo $cell1; ?></th>
                                    <td><?php echo $cell2; ?></td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php endif; ?>

            <?php if ($this->renderOptions['field_type'] === 'custom') : ?>
                <?php echo $this->renderOptions['html']; ?>
            <?php endif; ?>

            <fieldset class="tracy-auth-fieldset<?php echo $this->renderOptions['input_type'] === 'hidden' ? ' d-none' : ''; ?>">
                <div class="tracy-field control-group">
                    <?php if ($this->renderOptions['label']) : ?>
                        <div class="control-label">
                            <label for="com-users-method-code"><?php echo $this->renderOptions['label']; ?></label>
                        </div>
                    <?php endif; ?>
                    <div class="controls">
                        <input <?php echo ArrayHelper::toString($attributes); ?>>
                        <p class="form-text" id="com-users-method-code-help">
                            <?php echo $this->escape($this->renderOptions['placeholder']); ?>
                        </p>
                    </div>
                </div>
            </fieldset>

            <div class="tracy-auth-actions">
                <button type="submit"
                        class="btn btn-primary tracy-auth-submit <?php echo $hideSubmit ? 'd-none' : ''; ?> <?php echo $this->renderOptions['submit_class']; ?>">
                    <span class="<?php echo $this->renderOptions['submit_icon']; ?>" aria-hidden="true"></span>
                    <?php echo Text::_($this->renderOptions['submit_text']); ?>
                </button>
                <a href="<?php echo $cancelURL; ?>" class="btn btn-secondary">
                    <?php echo Text::_('JCANCEL'); ?>
                </a>
            </div>

            <?php if (!empty($this->renderOptions['post_message'])) : ?>
                <div class="com-users-method-edit-post-message tracy-auth-lead">
                    <?php echo $this->renderOptions['post_message']; ?>
                </div>
            <?php endif; ?>
        </form>
    </div>
</div>
