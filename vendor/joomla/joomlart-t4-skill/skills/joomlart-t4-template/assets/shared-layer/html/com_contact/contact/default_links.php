<?php

/**
 * Tracy — the contact's five link slots.
 *
 * The base override prints them inside `ul.nav.nav-tabs.nav-stacked`, which is Bootstrap's tab strip
 * applied to what is really a list of outbound links — it draws a tab border under each row. Rendered
 * here as capsule chips, the same vocabulary the tag cloud and the category children use. The <h3>
 * the base emitted is dropped: the card that holds this block already carries the heading.
 *
 * @package     tracy_apple
 * @license     GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

use Joomla\CMS\Language\Text;

/** @var \Joomla\Component\Contact\Site\View\Contact\HtmlView $this */
$params = $this->item->params;
$links  = [];

foreach (range('a', 'e') as $char) {
    $url = $params->get('link' . $char);

    if (!$url) {
        continue;
    }

    // The admin field accepts a bare host; keep the base's behaviour of completing the scheme.
    $links[] = [
        'url'   => str_starts_with($url, 'http') ? $url : 'http://' . $url,
        'label' => $params->get('link' . $char . '_name') ?: $url,
    ];
}
?>
<?php if ($links) : ?>
    <h2 class="tracy-card__title"><?php echo Text::_('COM_CONTACT_LINKS'); ?></h2>
    <div class="com-contact__links contact-links">
        <ul class="tracy-chips">
            <?php foreach ($links as $link) : ?>
                <li>
                    <a class="tracy-chip" href="<?php echo $this->escape($link['url']); ?>" itemprop="url" rel="noopener noreferrer">
                        <?php echo $this->escape($link['label']); ?>
                    </a>
                </li>
            <?php endforeach; ?>
        </ul>
    </div>
<?php endif; ?>
