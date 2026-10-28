<?php
/**
 * Test stand-in for the Claude Cowork plugin's `lib/ContentSlots.php` that answers like the real helper does: one slot
 * per text node (`.../text()`, `text()[n]` when an element holds several), one url slot per `href`, one image slot per
 * `src`, one text slot per `alt` and `title`, each with an absolute xpath under the synthetic root `/html/body/div`. A sibling index is written only when the
 * element has same-named siblings. Used by the tests of `--whole-units`.
 */
final class ContentSlots
{
    public static function htmlSlots(string $html): array
    {
        $dom = new DOMDocument();
        libxml_use_internal_errors(true);
        $dom->loadHTML('<?xml encoding="utf-8"?><html><body><div>' . $html . '</div></body></html>');
        libxml_clear_errors();
        $root = $dom->getElementsByTagName('div')->item(0);
        $out = [];
        self::walk($root, '/html/body/div', $out);
        return $out;
    }

    private static function walk(DOMElement $element, string $path, array &$out): void
    {
        $textNodes = [];
        foreach ($element->childNodes as $child) {
            if ($child instanceof DOMText && trim($child->textContent) !== '') {
                $textNodes[] = $child;
            }
        }
        $seen = [];
        foreach ($element->childNodes as $child) {
            if ($child instanceof DOMText && trim($child->textContent) !== '') {
                $seen['#text'] = ($seen['#text'] ?? 0) + 1;
                $suffix = count($textNodes) > 1 ? '[' . $seen['#text'] . ']' : '';
                $out[] = ['type' => 'text', 'sample' => trim($child->textContent), 'xpath' => $path . '/text()' . $suffix];
            } elseif ($child instanceof DOMElement) {
                $same = 0;
                $position = 0;
                foreach ($element->childNodes as $other) {
                    if ($other instanceof DOMElement && $other->tagName === $child->tagName) {
                        $same++;
                        if ($other->isSameNode($child)) {
                            $position = $same;
                        }
                    }
                }
                $childPath = $path . '/' . $child->tagName . ($same > 1 ? '[' . $position . ']' : '');
                foreach (['href' => 'url', 'src' => 'image', 'alt' => 'text', 'title' => 'text'] as $attribute => $type) {
                    if ($child->hasAttribute($attribute) && trim($child->getAttribute($attribute)) !== '') {
                        $out[] = ['type' => $type, 'sample' => $child->getAttribute($attribute), 'xpath' => $childPath . '/@' . $attribute];
                    }
                }
                self::walk($child, $childPath, $out);
            }
        }
    }
}
