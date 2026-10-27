<?php

/**
 * @package     Tracy
 * @subpackage  com_users.captive
 *
 * Template override of the CORE view. "Use a different authenticator". Each row in the core layout
 * was `border-top border-dark bg-light` — a light slab with a near-black hairline, which inverts
 * wrongly in dark and matches nothing in light either. Rows are now hairline-separated entries in one
 * --surface panel. Editability rule 5 applies: the whole row is one <a>, so every child inside it
 * (title, method name) carries its own colour and none of them inherit the link blue.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Joomla\CMS\Uri\Uri;

/** @var \Joomla\Component\Users\Site\View\Captive\HtmlView $this */

$shownMethods = [];
?>
<div class="tracy-auth">
    <div id="com-users-select" class="tracy-auth-card">
        <header class="tracy-auth-head">
            <h1 id="com-users-select-heading" class="tracy-auth-title">
                <?php echo Text::_('COM_USERS_MFA_SELECT_PAGE_HEAD'); ?>
            </h1>
            <p id="com-users-select-information" class="tracy-auth-lead">
                <?php echo Text::_('COM_USERS_LBL_SELECT_INSTRUCTIONS'); ?>
            </p>
        </header>

        <div class="com-users-select-methods tracy-mfa-picker">
            <?php foreach ($this->records as $record) : ?>
                <?php
                if (!array_key_exists($record->method, $this->mfaMethods) && $record->method !== 'backupcodes') {
                    continue;
                }

                $allowEntryBatching = $this->mfaMethods[$record->method]['allowEntryBatching'] ?? false;

                if ($this->allowEntryBatching) {
                    if ($allowEntryBatching && in_array($record->method, $shownMethods, true)) {
                        continue;
                    }

                    $shownMethods[] = $record->method;
                }

                $methodName = $this->getModel()->translateMethodName($record->method);
                ?>
                <a class="com-users-method tracy-mfa-picker-row"
                   href="<?php echo Route::_('index.php?option=com_users&view=captive&record_id=' . $record->id); ?>">
                    <img src="<?php echo Uri::root() . $this->getModel()->getMethodImage($record->method); ?>"
                         alt=""
                         class="com-users-method-image tracy-mfa-picker-mark">
                    <span class="com-users-method-title tracy-mfa-picker-title">
                        <?php if (!$this->allowEntryBatching || !$allowEntryBatching) : ?>
                            <?php echo $record->method === 'backupcodes' ? $record->title : $this->escape($record->title); ?>
                        <?php else : ?>
                            <?php echo $methodName; ?>
                        <?php endif; ?>
                    </span>
                    <span class="com-users-method-name tracy-mfa-picker-meta">
                        <?php echo $methodName; ?>
                    </span>
                </a>
            <?php endforeach; ?>
        </div>
    </div>
</div>
