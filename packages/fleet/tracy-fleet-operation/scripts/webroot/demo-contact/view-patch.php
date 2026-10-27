<?php
/** Adapt the known native view without changing a field, label, or recipient. Unknown layouts are refused. */
function tracy_demo_contact_view(string $before): string
{
    $condition = "$" . "showForm = $" . "tparams->get('show_email_form') && ($" . "this->item->email_to || $" . "this->item->user_id);";
    $previewCondition = str_replace(');', " || (defined('TRACY_DEMO_CONTACT_PREVIEW') && TRACY_DEMO_CONTACT_PREVIEW));", $condition);
    $render = "echo $" . "this->loadTemplate('form');";
    $previewRender = "echo class_exists('PlgSystemTracydemocontact') ? PlgSystemTracydemocontact::render($" . "this->loadTemplate('form')) : $" . "this->loadTemplate('form');";
    // Whitespace differs between releases. Refuse an unfamiliar view rather than replacing its layout.
    $pattern = '/\$showForm\s*=\s*\$tparams->get\(\'show_email_form\'\)\s*&&\s*\(\$this->item->email_to\s*\|\|\s*\$this->item->user_id\);/';
    $after = $before;
    if (!str_contains($before, 'TRACY_DEMO_CONTACT_PREVIEW')) {
        $after = preg_replace_callback($pattern, static fn () => $previewCondition, $before, -1, $count);
        if ($count !== 1 || substr_count($after, $render) !== 1) throw new RuntimeException('Unsupported contact layout');
        $after = str_replace($render, $previewRender, $after);
    }
    if (!str_contains($after, 'PlgSystemTracydemocontact::render')) throw new RuntimeException('Incomplete contact preview layout');
    return $after;
}
