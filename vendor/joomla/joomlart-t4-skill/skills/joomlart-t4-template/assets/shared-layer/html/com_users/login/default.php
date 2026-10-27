<?php

/**
 * @package     Tracy
 * @subpackage  com_users.login
 *
 * Template override — the view router. Core picks login/logout here; this override adds nothing to
 * that decision, it only wraps the chosen sub-template in the template's auth shell so both states
 * inherit the same 420px centred column. Keeping the shell here (not in the two partials) means the
 * width lives in exactly one place.
 *
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

/** @var \Joomla\Component\Users\Site\View\Login\HtmlView $this */

$isLogin = (isset($this->user->cookieLogin) && !empty($this->user->cookieLogin)) || $this->user->guest;
?>
<div class="tracy-auth<?php echo $isLogin ? '' : ' tracy-auth--compact'; ?>">
    <?php echo $this->loadTemplate($isLogin ? 'login' : 'logout'); ?>
</div>
