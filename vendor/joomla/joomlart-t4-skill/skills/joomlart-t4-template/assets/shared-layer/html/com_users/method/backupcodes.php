<?php

/**
 * @package     Tracy
 * @subpackage  com_users.method
 *
 * Template override of the CORE view. The printed one-time recovery codes. The core layout had no
 * page shell at all — a bare <h2>, an `alert alert-info` and a `table-striped` sitting straight on the
 * page — so this was the com_users view that looked least like the site. Card shell, --surface-warm
 * notice, and the codes set in the mono face on a --surface-warm grid: they are meant to be read
 * character by character and copied, which is exactly what a monospaced grid is for.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;

/** @var \Joomla\Component\Users\Site\View\Method\HtmlView $this */

HTMLHelper::_('bootstrap.tooltip', '.hasTooltip');

$cancelURL = Route::_('index.php?option=com_users&task=methods.display&user_id=' . $this->user->id);

if (!empty($this->returnURL)) {
    $cancelURL = $this->escape(base64_decode($this->returnURL));
}

if ($this->record->method !== 'backupcodes') {
    throw new RuntimeException(Text::_('JERROR_ALERTNOAUTHOR'), 403);
}
?>
<div class="tracy-auth tracy-auth--wide">
    <div class="com-users-backupcodes tracy-auth-card">
        <header class="tracy-auth-head">
            <h1 class="tracy-auth-title">
                <?php echo Text::_('COM_USERS_USER_BACKUPCODES'); ?>
            </h1>
        </header>

        <div class="tracy-notice">
            <?php echo Text::_('COM_USERS_USER_BACKUPCODES_DESC'); ?>
        </div>

        <ul class="tracy-mfa-codes">
            <?php foreach ($this->backupCodes as $code) : ?>
                <?php if (!empty($code)) : ?>
                    <li><?php echo $this->escape($code); ?></li>
                <?php endif; ?>
            <?php endforeach; ?>
        </ul>

        <p class="tracy-auth-lead">
            <?php echo Text::_('COM_USERS_MFA_BACKUPCODES_RESET_INFO'); ?>
        </p>

        <div class="tracy-auth-actions">
            <a class="btn btn-danger"
               href="<?php echo Route::_(sprintf(
                        'index.php?option=com_users&task=method.regenerateBackupCodes&user_id=%s&%s=1%s',
                        $this->user->id,
                        Factory::getApplication()->getFormToken(),
                        empty($this->returnURL) ? '' : '&returnurl=' . $this->returnURL
                    )); ?>">
                <span class="icon icon-refresh" aria-hidden="true"></span>
                <?php echo Text::_('COM_USERS_MFA_BACKUPCODES_RESET'); ?>
            </a>
            <a href="<?php echo $cancelURL; ?>" class="btn btn-secondary">
                <?php echo Text::_('JCANCEL'); ?>
            </a>
        </div>
    </div>
</div>
