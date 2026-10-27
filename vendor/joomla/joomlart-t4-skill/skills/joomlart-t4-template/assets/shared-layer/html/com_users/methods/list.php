<?php

/**
 * @package     Tracy
 * @subpackage  com_users.methods
 *
 * Template override of the CORE layout. The list of configured authenticators. Logic is untouched —
 * the same records, the same capability checks, the same routes. What changes is the paint: the core
 * layout coloured an active method's header `bg-secondary text-white` and its logo tile `bg-light`,
 * used `badge bg-info` for the default tag and `border-secondary` for the card edge. That is five
 * Bootstrap palette entries this design does not own, and three of them stay light on a black page.
 * They become one --surface panel with a --border-soft hairline per record and the default marker as
 * a --surface-warm badge; the active method is marked by an accent left edge, not by a filled bar.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Joomla\CMS\Uri\Uri;
use Joomla\Component\Users\Administrator\Helper\Mfa as MfaHelper;

/** @var \Joomla\Component\Users\Site\View\Methods\HtmlView $this */

$model = $this->getModel();

$this->getDocument()->getWebAssetManager()->useScript('com_users.two-factor-list');

HTMLHelper::_('bootstrap.tooltip', '.hasTooltip');

$canAddEdit     = MfaHelper::canAddEditMethod($this->user);
$canDelete      = MfaHelper::canDeleteMethod($this->user);
$returnFragment = $this->returnURL ? '&returnurl=' . $this->escape(urlencode($this->returnURL)) : '';
?>
<div id="com-users-methods-list-container" class="tracy-mfa-methods">
    <?php foreach ($this->methods as $methodName => $method) : ?>
        <?php
        $isActive    = (bool) count($method['active']);
        $methodClass = 'com-users-methods-list-method-name-' . htmlentities($method['name'])
            . ($this->defaultMethod == $methodName ? ' com-users-methods-list-method-default' : '');
        ?>
        <section class="com-users-methods-list-method tracy-mfa-method<?php echo $isActive ? ' is-active' : ''; ?> <?php echo $methodClass; ?>">
            <header class="com-users-methods-list-method-header tracy-mfa-method-head">
                <span class="com-users-methods-list-method-image tracy-mfa-method-mark">
                    <img src="<?php echo Uri::root() . $method['image']; ?>"
                         alt="<?php echo $this->escape($method['display']); ?>">
                </span>
                <h3 class="com-users-methods-list-method-title tracy-mfa-method-title">
                    <?php echo $method['display']; ?>
                </h3>
                <?php if ($this->defaultMethod == $methodName) : ?>
                    <span id="com-users-methods-list-method-default-tag" class="tracy-badge">
                        <?php echo Text::_('COM_USERS_MFA_LIST_DEFAULTTAG'); ?>
                    </span>
                <?php endif; ?>
            </header>

            <div class="com-users-methods-list-method-records-container tracy-mfa-method-body">
                <p class="com-users-methods-list-method-info tracy-mfa-method-info">
                    <?php echo $method['shortinfo']; ?>
                </p>

                <?php if ($isActive) : ?>
                    <div class="com-users-methods-list-method-records tracy-mfa-records">
                        <?php foreach ($method['active'] as $record) : ?>
                            <div class="com-users-methods-list-method-record tracy-mfa-record">
                                <div class="com-users-methods-list-method-record-info tracy-mfa-record-info">
                                    <?php if ($methodName === 'backupcodes' && $canAddEdit) : ?>
                                        <p class="tracy-notice tracy-notice--inline">
                                            <?php echo Text::sprintf(
                                                'COM_USERS_MFA_BACKUPCODES_PRINT_PROMPT_HEAD',
                                                Route::_('index.php?option=com_users&task=method.edit&id=' . (int) $record->id . $returnFragment . '&user_id=' . $this->user->id),
                                                'tracy-mfa-record-link'
                                            ); ?>
                                        </p>
                                    <?php else : ?>
                                        <h4 class="com-users-methods-list-method-record-title-container tracy-mfa-record-title">
                                            <?php if ($record->default) : ?>
                                                <span id="com-users-methods-list-method-default-badge-small"
                                                      class="tracy-mfa-record-star hasTooltip"
                                                      title="<?php echo $this->escape(Text::_('COM_USERS_MFA_LIST_DEFAULTTAG')); ?>">
                                                    <span class="icon icon-star" aria-hidden="true"></span>
                                                    <span class="visually-hidden"><?php echo $this->escape(Text::_('COM_USERS_MFA_LIST_DEFAULTTAG')); ?></span>
                                                </span>
                                            <?php endif; ?>
                                            <span class="com-users-methods-list-method-record-title">
                                                <?php echo $this->escape($record->title); ?>
                                            </span>
                                        </h4>
                                    <?php endif; ?>

                                    <p class="com-users-methods-list-method-record-lastused tracy-mfa-record-meta">
                                        <span class="com-users-methods-list-method-record-createdon">
                                            <?php echo Text::sprintf('COM_USERS_MFA_LBL_CREATEDON', $model->formatRelative($record->created_on)); ?>
                                        </span>
                                        <span class="com-users-methods-list-method-record-lastused-date">
                                            <?php echo Text::sprintf('COM_USERS_MFA_LBL_LASTUSED', $model->formatRelative($record->last_used)); ?>
                                        </span>
                                    </p>
                                </div>

                                <?php if ($methodName !== 'backupcodes' && ($canAddEdit || $canDelete)) : ?>
                                    <div class="com-users-methods-list-method-record-actions tracy-mfa-record-actions">
                                        <?php if ($canAddEdit) : ?>
                                            <a class="com-users-methods-list-method-record-edit btn btn-secondary hasTooltip"
                                               href="<?php echo Route::_('index.php?option=com_users&task=method.edit&id=' . (int) $record->id . $returnFragment . '&user_id=' . $this->user->id); ?>"
                                               title="<?php echo $this->escape(Text::_('JACTION_EDIT') . ' ' . $record->title); ?>">
                                                <span class="icon icon-pencil" aria-hidden="true"></span>
                                                <span class="visually-hidden"><?php echo $this->escape(Text::_('JACTION_EDIT') . ' ' . $record->title); ?></span>
                                            </a>
                                        <?php endif; ?>

                                        <?php if ($method['canDisable'] && $canDelete) : ?>
                                            <a class="com-users-methods-list-method-record-delete btn btn-danger hasTooltip"
                                               href="<?php echo Route::_('index.php?option=com_users&task=method.delete&id=' . (int) $record->id . $returnFragment . '&user_id=' . $this->user->id . '&' . Factory::getApplication()->getFormToken() . '=1'); ?>"
                                               title="<?php echo $this->escape(Text::_('JACTION_DELETE') . ' ' . $record->title); ?>">
                                                <span class="icon icon-trash" aria-hidden="true"></span>
                                                <span class="visually-hidden"><?php echo $this->escape(Text::_('JACTION_DELETE') . ' ' . $record->title); ?></span>
                                            </a>
                                        <?php endif; ?>
                                    </div>
                                <?php endif; ?>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>

                <?php if ($canAddEdit && (empty($method['active']) || $method['allowMultiple'])) : ?>
                    <div class="com-users-methods-list-method-addnew-container tracy-mfa-method-add">
                        <a href="<?php echo Route::_('index.php?option=com_users&task=method.add&method=' . $this->escape(urlencode($method['name'])) . $returnFragment . '&user_id=' . $this->user->id); ?>"
                           class="com-users-methods-list-method-addnew btn btn-secondary">
                            <span class="icon-plus-2" aria-hidden="true"></span>
                            <?php echo Text::sprintf('COM_USERS_MFA_ADD_AUTHENTICATOR_OF_TYPE', $method['display']); ?>
                        </a>
                    </div>
                <?php endif; ?>
            </div>
        </section>
    <?php endforeach; ?>
</div>
