<?php
/** Keep a demo's native contact form visible without inventing a recipient or sending a message. */
defined('_JEXEC') or die;

use Joomla\CMS\Plugin\CMSPlugin;
use Joomla\CMS\Factory;

class PlgSystemTracydemocontact extends CMSPlugin
{
    public const NOTICE = 'This demo form is for preview only. Messages cannot be sent.';

    public function onAfterRoute(): void
    {
        $app = $this->getApplication() ?? Factory::getApplication();
        if (!$app->isClient('site') || $app->input->getCmd('option') !== 'com_contact') return;
        $task = strtolower($app->input->getCmd('task'));
        $view = $app->input->getCmd('view', 'contact');
        if ($task !== 'contact.submit' && ($task !== '' || $view !== 'contact')) return;
        $model = $app->bootComponent('com_contact')->getMVCFactory()->createModel('Contact', 'Site');
        $item = $model->getItem($app->input->getInt('id'));
        if (!$item || !empty($item->email_to) || !empty($item->user_id)) return;
        if ($task === 'contact.submit') {
            // Stop before contact plugins or Joomla's mailer can see a submission, including a forged GET.
            http_response_code(409);
            header('Content-Type: text/plain; charset=utf-8');
            header('Cache-Control: no-store');
            echo self::NOTICE;
            $app->close();
            return;
        }
        if (!defined('TRACY_DEMO_CONTACT_PREVIEW')) define('TRACY_DEMO_CONTACT_PREVIEW', true);
    }

    public static function render(string $html): string
    {
        if (!defined('TRACY_DEMO_CONTACT_PREVIEW') || !TRACY_DEMO_CONTACT_PREVIEW) return $html;
        // Keep the template's controls and labels. Disable every submit control; the server enforces the same rule.
        $html = preg_replace_callback('/<(button|input)\b[^>]*>/i', static function ($m) {
            $tag = $m[0];
            $submit = preg_match('/\btype\s*=\s*(["\']?)submit\1(?=\s|\/?>)/i', $tag)
                || (strtolower($m[1]) === 'button' && !preg_match('/\btype\s*=/i', $tag));
            return $submit ? substr($tag, 0, -1) . ' disabled aria-disabled="true">' : $tag;
        }, $html);
        return '<p role="note" data-tracy-demo-contact-preview>' . self::NOTICE . '</p>' . $html;
    }
}
