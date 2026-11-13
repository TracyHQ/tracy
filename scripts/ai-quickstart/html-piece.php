<?php
/**
 * Set or read a piece of a stored HTML value with the Claude Cowork plugin's own functions (ticket #584, door-proof.mjs).
 *
 * A mapping location with `piece: true` names a node inside a slot's stored value (an element, a text node, an
 * attribute). The build sets the piece and writes the whole value back under the slot's key through
 * `content.contract` apply; this is that first half, run with the plugin release the site carries, so the node is
 * found exactly as the plugin finds it.
 *
 * Reads JSON `{"lib": "<plugin lib folder>", "markers": "<empty-html-places.php>", "pieces": [...]}` on stdin. Each
 * piece is `{"value": "<the stored value>", "xpath": "...", "set"?: "<new text>"}`. Writes JSON
 * `[{"value": "<the stored value with the piece set>", "text": "<the piece's text>"} | {"error": "..."}, ...]`; without
 * `set` the value is returned unchanged. A value in the JA ACM marker notation is read and written in it.
 */

$in = json_decode(stream_get_contents(STDIN), true);
require $in['lib'] . '/ContentSlots.php';
require $in['markers'];

$out = [];
foreach ($in['pieces'] as $piece) {
    try {
        $stored = (string) $piece['value'];
        $marked = isMarked($stored);
        $html = $marked ? fromMarkers($stored) : $stored;
        if (array_key_exists('set', $piece)) {
            $html = ContentSlots::htmlPatch($html, [['xpath' => $piece['xpath'], 'value' => (string) $piece['set']]]);
            $stored = $marked ? toMarkers($html) : $html;
        }
        $nodes = (new DOMXPath(ContentSlots::html($html)))->query($piece['xpath']);
        if (!$nodes || $nodes->length !== 1) throw new RuntimeException('the xpath names ' . ($nodes ? $nodes->length : 0) . ' nodes');
        $out[] = ['value' => $stored, 'text' => ContentSlots::slotText($nodes->item(0))];
    } catch (Throwable $e) {
        $out[] = ['error' => get_class($e) . ': ' . $e->getMessage()];
    }
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
