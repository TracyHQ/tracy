<?php
/**
 * The markup of one element of an HTML value, in the content map's notation: `((tag attrs))words((/tag))`, `((br/))`.
 *
 * Reads JSON `[{"html": "...", "xpath": "/html/body/div/h2"}, ...]` on stdin and writes JSON `[markup | null, ...]`:
 * for each entry, the inner markup of the element the xpath names (null when it names no element). The HTML is loaded
 * the way the Claude Cowork plugin's `ContentSlots::htmlSlots` loads it (a synthetic `/html/body/div` root), so the
 * xpaths a capture wrote resolve to the same element. Used by `capture-contract.py --inline-markup` (a whole-unit slot
 * keeps the inline tags of its unit) and by the content coverage `resample.mjs` (the same, from a database dump).
 *
 * Text is written as it reads (entities decoded, as the helper's text samples are); runs of white space are one space.
 * An attribute whose value holds a parenthesis is left out: the notation cannot carry it.
 */

const VOID_TAGS = ['br', 'hr', 'img', 'wbr', 'input', 'source', 'col', 'area', 'embed', 'meta', 'link', 'param', 'track'];

function markupOf(DOMNode $node): string
{
    $out = '';
    foreach ($node->childNodes as $child) {
        if ($child instanceof DOMText) {
            $out .= $child->textContent;
        } elseif ($child instanceof DOMElement) {
            $tag = strtolower($child->tagName);
            $attrs = '';
            foreach ($child->attributes as $attribute) {
                if (strpbrk($attribute->value, '()') !== false) {
                    continue;
                }
                $attrs .= ' ' . $attribute->name . '="' . str_replace('"', '&quot;', $attribute->value) . '"';
            }
            $out .= in_array($tag, VOID_TAGS, true)
                ? "(({$tag}{$attrs}/))"
                : "(({$tag}{$attrs}))" . markupOf($child) . "((/{$tag}))";
        }
    }
    return $out;
}

function unitMarkup(string $html, string $xpath): ?string
{
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="utf-8"?><html><body><div>' . $html . '</div></body></html>');
    libxml_clear_errors();
    $found = @(new DOMXPath($dom))->query($xpath);
    if ($found === false || $found->length !== 1 || !($found->item(0) instanceof DOMElement)) {
        return null;
    }
    return trim(preg_replace('/\s+/u', ' ', markupOf($found->item(0))));
}

$entries = json_decode(stream_get_contents(STDIN), true);
if (!is_array($entries)) {
    fwrite(STDERR, "unit-markup.php: stdin is not a JSON list\n");
    exit(2);
}
$out = [];
foreach ($entries as $entry) {
    $out[] = is_array($entry) && is_string($entry['html'] ?? null) && is_string($entry['xpath'] ?? null)
        ? unitMarkup($entry['html'], $entry['xpath'])
        : null;
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
