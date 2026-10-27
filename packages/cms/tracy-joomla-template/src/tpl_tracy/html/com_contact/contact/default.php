<?php

/**
 * A contact of com_contact as the Tracy contact page: the same two columns the section library
 * draws — the words on the left, the form on the right — with Joomla's own form doing the sending.
 * `default_form.php` beside this file dresses the fields; everything else here is the page frame.
 *
 * @package tpl_tracy
 */

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\Language\Text;

/** @var Joomla\Component\Contact\Site\View\Contact\HtmlView $this */

$app     = Factory::getApplication();
$app->set('tracy.page', 'contact');
$tparams = $this->item->params;
$item    = $this->item;
$showForm = $tparams->get('show_email_form') && ($item->email_to || $item->user_id);
?>
<section class="tracy-section tracy-contact tracy-container">
    <div class="tracy-grid tracy-contact__grid">
        <div class="tracy-contact__copy">
            <p class="tracy-eyebrow"><?php echo Text::_('COM_CONTACT_CONTACT'); ?></p>
            <?php if ($tparams->get('show_page_heading') || $item->name) : ?>
                <h2 class="tracy-contact__title"><?php echo $this->escape($item->name); ?></h2>
            <?php endif; ?>
            <?php if ($item->misc) : ?>
                <div class="tracy-lead"><?php echo $item->misc; ?></div>
            <?php endif; ?>
            <?php if ($tparams->get('show_email') && $item->email_to) : ?>
                <p class="tracy-meta"><?php echo $item->email_to; ?></p>
            <?php endif; ?>
            <?php if ($tparams->get('address_check') > 0 || $tparams->get('show_telephone')) : ?>
                <div class="tracy-contact__address"><?php echo $this->loadTemplate('address'); ?></div>
            <?php endif; ?>
        </div>

        <div class="tracy-contact__form">
            <?php if ($showForm) : ?>
                <?php echo $this->loadTemplate('form'); ?>
            <?php endif; ?>
        </div>
    </div>
</section>
